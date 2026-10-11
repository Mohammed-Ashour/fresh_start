import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { Api, AssistantMessage, AssistantMessageEvent, Model, StreamOptions, TranscriptContext, Provider } from "@earendil-works/pi-ai";
import type { Accounts } from "./accounts";
import type { Account } from "./store";
import { isUsageLimitError, snapshotFromHeaders } from "./usage";

function failure(model: Model<Api>, error: unknown, aborted: boolean): AssistantMessage {
    return { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        stopReason: aborted ? "aborted" : "error", errorMessage: aborted ? "Request aborted" : error instanceof Error ? error.message : String(error),
        timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}

/** Bounded failover BEFORE content, without relying on Pi's agent retry classification. */
export function rotateStream(model: Model<Api>, context: TranscriptContext, options: StreamOptions | undefined,
    accounts: Accounts, send: Provider["streamSimple"], selected: (account: Account) => void) {
    const stream = createAssistantMessageEventStream();
    void (async () => {
        try {
            options?.signal?.throwIfAborted();
            let candidates: Account[];
            try { await accounts.sync(); candidates = accounts.candidates(); }
            catch {
                // Broken extension metadata must not take down an otherwise configured native provider.
                for await (const event of send(model, context, options)) stream.push(event);
                stream.end(); return;
            }
            if (!candidates.length && accounts.store.accounts().length === 0) {
                for await (const event of send(model, context, options)) stream.push(event);
                stream.end(); return;
            }
            if (!candidates.length) throw new Error("No Codex accounts with available quota. Use /codex-usage to check reset times or /codex to sign in.");
            let lastError: AssistantMessage | undefined;
            for (const account of candidates) {
                options?.signal?.throwIfAborted();
                const auth = await accounts.auth(account, options?.signal);
                accounts.selected(account);
                selected(account);
                let start: AssistantMessageEvent | undefined;
                let emittedContent = false;
                let retry = false;
                let terminal = false;
                let httpQuota: boolean | undefined;
                let httpError: string | undefined;
                const requestFetch = options?.fetch ?? globalThis.fetch;
                const observeResponse: NonNullable<StreamOptions["onResponse"]> = async (response, physicalModel) => {
                    const snapshot = snapshotFromHeaders(response.headers);
                    if (snapshot) {
                        try { accounts.store.update(state => {
                            const prior = state.accounts[account.id] ?? {};
                            state.accounts[account.id] = { ...prior, usage: { ...snapshot,
                                primary: snapshot.primary ?? prior.usage?.primary ?? null,
                                secondary: snapshot.secondary ?? prior.usage?.secondary ?? null,
                                capturedAt: (!snapshot.primary && prior.usage?.primary) || (!snapshot.secondary && prior.usage?.secondary)
                                    ? Math.min(snapshot.capturedAt, prior.usage?.capturedAt ?? snapshot.capturedAt) : snapshot.capturedAt }, usageError: undefined };
                        }); } catch { /* optional quota display */ }
                    }
                    try { await options?.onResponse?.(response, physicalModel); }
                    catch (error) { httpQuota = false; httpError = undefined; throw error; }
                };
                const inner = send(model, context, {
                    ...options, apiKey: auth.auth.apiKey,
                    fetch: async (input, init) => {
                        httpQuota = undefined; httpError = undefined;
                        const response = await requestFetch(input, init);
                        if (!response.ok) {
                            let quotaMessage = "ChatGPT usage limit";
                            // Pi's native adapter labels ANY JSON 429 a usage limit. Inspect the original
                            // error so throttling/auth/model errors never become account-exhaustion events.
                            httpQuota = false;
                            try {
                                const raw = await response.clone().text();
                                try {
                                    const body = JSON.parse(raw);
                                    const error = body.error;
                                    const code = error?.code ?? error?.type;
                                    if (typeof error?.message === "string") httpError = `HTTP ${response.status}${typeof code === "string" ? ` ${code}` : ""}: ${error.message}`;
                                    httpQuota = code === "usage_limit_reached" || (!code && isUsageLimitError(error?.message ?? ""));
                                    if (httpQuota) {
                                        quotaMessage += typeof error?.message === "string" ? `. ${error.message}` : "";
                                        if (typeof error?.resets_at === "number" && Number.isFinite(error.resets_at)) {
                                            quotaMessage += `. Try again in ~${Math.max(0, Math.round((error.resets_at * 1000 - Date.now()) / 60_000))} min.`;
                                        }
                                    }
                                } catch { httpQuota = isUsageLimitError(raw); if (httpQuota) quotaMessage += `. ${raw}`; }
                            } catch { /* uninspectable errors are not eligible for replay */ }
                            if (httpQuota) {
                                await observeResponse({ status: response.status, headers: Object.fromEntries(response.headers.entries()) }, model);
                                // Native Codex does not retry errors containing 'usage limit'. Keep its
                                // normal transient retries, but stop immediately on proven quota errors.
                                throw new Error(quotaMessage);
                            }
                        }
                        return response;
                    },
                    onResponse: observeResponse,
                });
                for await (const event of inner) {
                    if (event.type === "start") { start = event; continue; }
                    if (event.type === "error") {
                        terminal = true;
                        const quota = event.reason !== "aborted" && (httpQuota ?? isUsageLimitError(event.error.errorMessage ?? ""));
                        if (quota) accounts.block(account, event.error.errorMessage ?? "");
                        if (quota && !emittedContent && event.error.content.length === 0 && !options?.signal?.aborted) {
                            retry = true; lastError = event.error; break;
                        }
                        stream.push(httpQuota === false && httpError ? { ...event, error: { ...event.error, errorMessage: httpError } } : event); break;
                    }
                    if (start) { stream.push(start); start = undefined; }
                    if (event.type === "done") terminal = true;
                    else emittedContent = true;
                    stream.push(event);
                }
                if (!retry) {
                    if (!terminal) throw new Error("Codex stream ended without a terminal event");
                    stream.end(); return;
                }
            }
            if (lastError) stream.push({ type: "error", reason: lastError.stopReason === "aborted" ? "aborted" : "error", error: lastError });
            else throw new Error("No Codex account could answer");
            stream.end();
        } catch (error) {
            const message = failure(model, error, options?.signal?.aborted === true);
            stream.push({ type: "error", reason: message.stopReason === "aborted" ? "aborted" : "error", error: message });
            stream.end();
        }
    })();
    return stream;
}
