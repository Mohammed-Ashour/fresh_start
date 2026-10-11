import { getAgentDir, ModelRuntime, type ExtensionAPI, type ExtensionContext, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type { AuthInteraction, AuthPrompt, Provider } from "@earendil-works/pi-ai";
import { AccountStore, CORE, PREFIX, type Account } from "./store";
import { Accounts } from "./accounts";
import { rotateStream } from "./rotation";
import { availability, fetchUsageSnapshot, withUsage, WHAM_MIN_INTERVAL_MS } from "./usage";
import { accountName, choiceLabel, completions, findAccount, footerLine, help, usageReport } from "./ui";

/** One native Codex provider and OAuth flow. Settings and a valid core credential stay intact. */
export default async function (pi: ExtensionAPI) {
    const found = builtinProviders().find(provider => provider.id === CORE);
    if (!found?.auth.oauth) throw new Error("codex-accounts requires Pi's native openai-codex provider");
    const builtin = found;
    const store = new AccountStore(getAgentDir());
    const runtime = await ModelRuntime.create({ authPath: store.authPath, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    const accounts = new Accounts(store, runtime, builtin);
    // Only repair the previous version's missing core credential. Pi handles the locked write.
    let startupWarning: string | undefined;
    try { await accounts.migrate(); }
    catch { startupWarning = "Codex account setup could not finish. Check codex-accounts.json, or sign in with /codex add."; }

    let context: ExtensionContext | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = new AbortController();
    let loginController: AbortController | undefined;
    const polls = new Map<string, Promise<void>>();
    const registeredAliases = new Set<string>();

    function status(ctx = context) {
        if (!ctx) return;
        try {
            if (ctx.model?.provider !== CORE && ctx.model?.provider !== "codex-multi" && !ctx.model?.provider.startsWith(PREFIX)) {
                ctx.ui.setStatus("codex", undefined); return;
            }
            const all = store.accounts(), state = accounts.safeState();
            const current = all.find(a => a.id === accounts.next) ?? all.find(a => a.id === accounts.active) ?? all.find(a => a.id === state.default) ?? all[0];
            if (!current) { ctx.ui.setStatus("codex", "Codex · sign in with /codex"); return; }
            ctx.ui.setStatus("codex", footerLine(current, all, state, !!accounts.next || !accounts.active));
        } catch { ctx.ui.setStatus("codex", "Codex · quota unavailable"); }
    }

    const selected = (account: Account) => {
        status();
        // Notification on changes only; stream authentication remains independent of UI.
        const state = accounts.safeState();
        const skippedDefault = !lastAccount && account.id !== state.default && availability(state.accounts[state.default ?? ""]) === "exhausted";
        if ((lastAccount && lastAccount !== account.id || skippedDefault) && announcedAccount !== account.id && context?.hasUI) {
            try { context.ui.notify(`Codex switched to ${account.label}${skippedDefault ? "; default account is out of quota" : ""}.`, "info"); }
            catch { /* notifications must not interrupt a request */ }
        }
        lastAccount = account.id;
        announcedAccount = undefined;
    };
    let lastAccount: string | undefined;
    let announcedAccount: string | undefined;

    const native: Provider = {
        ...builtin,
        name: "Codex (ChatGPT accounts)",
        auth: {
            oauth: { ...found.auth.oauth, login: (interaction, options) => accounts.login(interaction, options) },
        },
        streamSimple: (model, transcript, options) => rotateStream(model, transcript, options, accounts, builtin.streamSimple.bind(builtin), selected),
        stream: (model, transcript, options) => rotateStream(model, transcript, options, accounts,
            (m, c, o) => builtin.stream(m, c, o), selected),
    };
    pi.registerProvider(native);

    /** Old session/provider IDs keep working, but never advertise another OAuth login entry. */
    function aliases() {
        const ids = new Set(accounts.safeState().legacyAliases ?? []);
        for (const id of ids) {
            if (!id.startsWith(PREFIX) || registeredAliases.has(id)) continue;
            for (const oldModel of builtin.getModels()) pi.registerVirtualModel({
                provider: id, id: oldModel.id, name: `${oldModel.name}, legacy account alias`,
                thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
                route(request, ctx) {
                    const model = ctx.modelRegistry.find(CORE, oldModel.id);
                    if (!model) throw new Error(`Codex model ${oldModel.id} is unavailable`);
                    accounts.next = id;
                    return { model, thinkingLevel: request.thinkingLevel };
                },
            });
            registeredAliases.add(id);
        }
    }
    try { aliases(); } catch { /* core provider registration stays intact */ }

    let recoveringSelection = false;
    let recoveryWarningShown = false;
    async function recoverLegacySelection(ctx: ExtensionContext): Promise<void> {
        if (recoveringSelection) return;
        recoveringSelection = true;
        const lifecycle = stopped;
        try {
            const selected = ctx.model;
            if (!selected || !["openai-codex-responses", "pi-virtual"].includes(selected.api)
                || !selected.provider.startsWith(PREFIX) || selected.provider === "codex-multi") return;
            // Restored physical objects can outlive provider registration; signing in does not rebind them.
            // Move legacy selections to the native provider, including models absent from the current catalog.
            const known = accounts.safeState().legacyAliases?.includes(selected.provider)
                || store.accounts().some(a => a.id === selected.provider);
            if (!known || !store.credential(CORE)) return;
            const model = ctx.modelRegistry.find(CORE, selected.id)
                ?? (selected.api === "openai-codex-responses" ? { ...selected, provider: CORE } : undefined);
            if (!model) return;
            // setModel checks Pi's cached configured-auth snapshot, not just auth.json.
            // Registration/reload and native login can leave that snapshot behind the saved credential.
            await ctx.modelRegistry.refresh({ allowNetwork: false });
            if (lifecycle.signal.aborted || lifecycle !== stopped
                || ctx.model?.provider !== selected.provider || ctx.model.id !== selected.id) return;
            if (await pi.setModel(model)) {
                if (!accounts.next && store.accounts().some(a => a.id === selected.provider)) accounts.next = selected.provider;
                try { ctx.ui.notify(`Recovered Codex selection: ${CORE}/${model.id}. No new sign-in needed.`, "info"); }
                catch { /* successful recovery must not depend on notifications */ }
            }
        } catch {
            // Storage or registry failures must not skip session setup or fail every input handler.
            if (!lifecycle.signal.aborted && lifecycle === stopped && !recoveryWarningShown) {
                recoveryWarningShown = true;
                try { ctx.ui.notify("Codex selection recovery failed. Quota polling will continue; check model/credential storage and use /codex use to select an account.", "warning"); }
                catch { /* optional UI */ }
            }
        } finally { recoveringSelection = false; }
    }
    // Existing codex-multi/auto settings/sessions are supported, but never written by this extension.
    if (accounts.safeState().legacyAuto) pi.registerVirtualModel({ provider: "codex-multi", id: "auto", name: "Codex accounts, compatibility alias",
        thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
        route(request, ctx) {
            const preferred = request.previous?.model.id ?? accounts.safeState().accounts[accounts.safeState().default ?? ""]?.preferredModel;
            const configured = pi.getSettings().defaultModel;
            const models = ctx.modelRegistry.getModelsOfType("chat", CORE);
            const model = models.find(m => m.id === preferred) ?? models.find(m => m.id === configured)
                ?? models.find(m => m.id === "gpt-5.5") ?? models.find(m => !m.id.includes("spark")) ?? models[0];
            if (!model) throw new Error("No Codex models available; sign in with /codex or /login");
            return { model, thinkingLevel: request.thinkingLevel };
        },
    });

    async function poll(account: Account, force = false): Promise<void> {
        if (polls.has(account.id)) return polls.get(account.id);
        const previous = accounts.safeState().accounts[account.id];
        if (!force && previous?.lastWhamAt && Date.now() - previous.lastWhamAt < WHAM_MIN_INTERVAL_MS) return;
        const lifecycle = stopped;
        const work = (async () => {
            try {
                const signal = AbortSignal.any([lifecycle.signal, AbortSignal.timeout(10_000)]);
                const auth = await accounts.auth(account, signal);
                const snapshot = await fetchUsageSnapshot(auth.auth.apiKey!, account.accountId, signal);
                signal.throwIfAborted();
                store.update(state => { state.accounts[account.id] = withUsage(state.accounts[account.id], snapshot); });
            } catch {
                if (!lifecycle.signal.aborted && lifecycle === stopped) {
                    try { store.update(state => { state.accounts[account.id] = { ...state.accounts[account.id],
                        lastWhamAt: Date.now(), usageError: "usage unavailable, cached data only" }; }); } catch { /* optional display */ }
                }
            } finally { polls.delete(account.id); if (!lifecycle.signal.aborted && lifecycle === stopped) status(); }
        })();
        polls.set(account.id, work);
        return work;
    }
    async function report(ctx: ExtensionContext) {
        const all = store.accounts();
        if (!all.length) { ctx.ui.notify("No Codex accounts. Sign in with /codex or /login.", "info"); return; }
        const lifecycle = stopped;
        ctx.ui.setStatus("codex-refresh", `Refreshing quota for ${all.length} Codex account${all.length === 1 ? "" : "s"}...`);
        try {
            await Promise.allSettled(all.map(a => poll(a, true)));
            if (lifecycle.signal.aborted || lifecycle !== stopped) return;
            pi.sendMessage({ customType: "codex-accounts-usage", display: true,
                content: usageReport(all, accounts.safeState(), accounts.active, accounts.next) });
        } finally {
            if (!lifecycle.signal.aborted && lifecycle === stopped) { ctx.ui.setStatus("codex-refresh", undefined); status(ctx); }
        }
    }

    function interaction(ctx: ExtensionCommandContext, signal: AbortSignal): AuthInteraction {
        return {
            signal,
            prompt: async (prompt: AuthPrompt) => {
                const opts = { signal: prompt.signal ? AbortSignal.any([signal, prompt.signal]) : signal };
                if (prompt.type === "select") {
                    const pick = await ctx.ui.select(prompt.message, prompt.options.map(o => o.label), opts);
                    const option = prompt.options.find(o => o.label === pick);
                    if (!option) throw new Error("Sign-in cancelled");
                    return option.id;
                }
                const value = await ctx.ui.input(prompt.message, prompt.placeholder, opts);
                if (!value?.trim()) throw new Error("Sign-in cancelled");
                return value;
            },
            notify: event => {
                if (event.type === "auth_url" || event.type === "device_code") {
                    const url = event.type === "auth_url" ? event.url : event.verificationUri;
                    ctx.ui.notify(event.type === "device_code" ? `Open ${url}, code ${event.userCode}. /codex cancel cancels sign-in.` : `Open ${url} to sign in.`, "info");
                    if (ctx.mode === "tui") {
                        const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
                        const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
                        void pi.exec(command, args).catch(() => {});
                    }
                } else ctx.ui.notify(event.message, "info");
            },
        };
    }
    async function add(ctx: ExtensionCommandContext) {
        if (!ctx.hasUI) throw new Error("Sign-in requires interactive Pi or an RPC client with dialogs");
        if (loginController) throw new Error("Sign-in is already running; /codex cancel stops it");
        const controller = new AbortController(), lifecycle = stopped;
        loginController = controller;
        try {
            await ctx.waitForIdle();
            const signal = AbortSignal.any([controller.signal, lifecycle.signal, AbortSignal.timeout(15 * 60_000)]);
            signal.throwIfAborted();
            const account = await accounts.add(interaction(ctx, signal), { agentName: "pi" });
            signal.throwIfAborted();
            aliases();
            await ctx.modelRegistry.refresh({ allowNetwork: false });
            signal.throwIfAborted();
            if (!ctx.model || ctx.model.provider === CORE || ctx.model.provider === "codex-multi" || ctx.model.provider.startsWith(PREFIX)) {
                const model = ctx.modelRegistry.find(CORE, ctx.model?.id ?? "") ?? ctx.modelRegistry.find(CORE, "gpt-5.5");
                if (model) await pi.setModel(model);
            }
            signal.throwIfAborted();
            announcedAccount = account.id;
            ctx.ui.notify(`Signed in to ${accountName(account, store.accounts())}. Ready for your next Codex request.`, "info");
            void poll(account, true);
        } finally {
            if (loginController === controller) loginController = undefined;
            if (!lifecycle.signal.aborted && lifecycle === stopped) status(ctx);
        }
    }
    async function pick(ctx: ExtensionContext, title: string): Promise<Account | undefined> {
        if (!ctx.hasUI) throw new Error("Specify an account ID, or use the interactive /codex picker.");
        const state = accounts.safeState();
        const all = store.accounts().sort((a, b) => Number(b.id === state.default) - Number(a.id === state.default));
        if (!all.length) { ctx.ui.notify("No saved accounts. Use /codex add to sign in.", "info"); return; }
        const labels = all.map(a => choiceLabel(a, all, state, accounts.active, accounts.next));
        const answer = await ctx.ui.select(title, labels, { signal: stopped.signal });
        return answer === undefined ? undefined : all[labels.indexOf(answer)];
    }
    async function accountAction(action: "use" | "default" | "remove", query: string, ctx: ExtensionCommandContext) {
        const lifecycle = stopped;
        const account = query ? findAccount(query, store.accounts()) : await pick(ctx,
            action === "use" ? "Switch account · this session" : action === "default" ? "Default account · new sessions" : "Remove saved account");
        if (!account) return;
        await ctx.waitForIdle();
        if (lifecycle.signal.aborted || lifecycle !== stopped) return;
        const name = accountName(account, store.accounts());
        if (action === "remove") {
            if (!ctx.hasUI) throw new Error("Removing an account requires interactive confirmation.");
            const last = store.accounts().length === 1;
            const consequence = last ? "This is your last login. You will need to sign in again." : account.providerId === CORE
                ? "A remaining account will keep native Codex signed in." : "Your other accounts stay signed in.";
            if (!await ctx.ui.confirm(`Sign out ${name}?`, consequence, { signal: lifecycle.signal })) return;
            if (lifecycle.signal.aborted || lifecycle !== stopped) return;
            await accounts.remove(account);
            if (lifecycle.signal.aborted || lifecycle !== stopped) return;
            for (const model of builtin.getModels()) pi.unregisterVirtualModel(account.id, model.id);
            registeredAliases.delete(account.id);
            await ctx.modelRegistry.refresh({ allowNetwork: false });
            if (ctx.model?.provider === account.id) {
                const model = ctx.modelRegistry.find(CORE, ctx.model.id);
                if (model) await pi.setModel(model);
            }
            ctx.ui.notify(`Removed ${name}.${last ? " Use /codex add to sign in again." : ""}`, "info");
        } else if (action === "default") {
            store.update(state => { state.default = account.id; });
            ctx.ui.notify(`Default saved: ${name}. Applies to new sessions; this session is unchanged.`, "info");
        } else {
            if (availability(accounts.safeState().accounts[account.id]) === "exhausted") {
                ctx.ui.notify(`${name} is waiting for a quota reset. Use /codex usage to refresh, or choose another account.`, "warning"); return;
            }
            if (ctx.model?.provider !== CORE) {
                const model = ctx.modelRegistry.find(CORE, ctx.model?.id ?? "") ?? ctx.modelRegistry.find(CORE, "gpt-5.5")
                    ?? ctx.modelRegistry.getModelsOfType("chat", CORE)[0];
                if (!model || !await pi.setModel(model)) throw new Error("No usable Codex model. Sign in with /codex add.");
            }
            if (lifecycle.signal.aborted || lifecycle !== stopped) return;
            accounts.next = account.id;
            announcedAccount = account.id;
            ctx.ui.notify(`Next Codex request: ${name}. Default for new sessions is unchanged.`, "info");
        }
        status(ctx);
    }
    async function menu(ctx: ExtensionCommandContext) {
        if (!ctx.hasUI) throw new Error("Use /codex help for commands, or open the menu in interactive Pi.");
        const all = store.accounts(), state = accounts.safeState();
        if (!all.length) return add(ctx);
        const current = all.find(a => a.id === accounts.next) ?? all.find(a => a.id === accounts.active);
        const fallback = all.find(a => a.id === state.default);
        const choices = ["Switch account", "Set default for new sessions", "Remaining quota & reset times", "Add ChatGPT account", "Remove account..."];
        const action = await ctx.ui.select(`Codex · ${all.length} account${all.length === 1 ? "" : "s"}${current ? ` · ${accounts.next ? "next" : "current"} ${accountName(current, all)}` : fallback ? ` · default ${accountName(fallback, all)}` : ""}`, choices, { signal: stopped.signal });
        if (action === choices[0]) return accountAction("use", "", ctx);
        if (action === choices[1]) return accountAction("default", "", ctx);
        if (action === choices[2]) return report(ctx);
        if (action === choices[3]) return add(ctx);
        if (action === choices[4]) return accountAction("remove", "", ctx);
    }
    pi.registerCommand("codex", { description: "ChatGPT accounts: sign in, switch, set default, check quota",
        getArgumentCompletions: prefix => { try { return completions(prefix, store.accounts(), accounts.safeState(), accounts.active, accounts.next); } catch { return []; } },
        handler: async (args, ctx) => {
            const lifecycle = stopped;
            try {
                const input = args.trim();
                if (!input) return await menu(ctx);
                if (input === "cancel") {
                    if (loginController) { loginController.abort(); ctx.ui.notify("Sign-in cancellation requested.", "info"); }
                    else ctx.ui.notify("No sign-in is running.", "info");
                    return;
                }
                if (input === "add") return await add(ctx);
                if (input === "usage") return await report(ctx);
                if (input === "help") { pi.sendMessage({ customType: "codex-help", display: true, content: help }); return; }
                const match = input.match(/^(use|default|remove)(?:\s+(.+))?$/i);
                if (match) return await accountAction(match[1].toLowerCase() as "use" | "default" | "remove", match[2] ?? "", ctx);
                ctx.ui.notify("Unknown Codex command. Use /codex help or Tab for available actions.", "warning");
            } catch (error) {
                if (!lifecycle.signal.aborted && lifecycle === stopped) ctx.ui.notify(error instanceof Error ? error.message : "Codex command failed", "error");
            }
        } });
    pi.registerCommand("codex-usage", { description: "Remaining quota and both reset times for every ChatGPT account", handler: async (_args, ctx) => report(ctx) });

    pi.on("session_start", async (_event, ctx) => {
        stopped.abort(); loginController?.abort();
        stopped = new AbortController();
        if (timer) clearInterval(timer);
        timer = undefined;
        context = ctx;
        accounts.active = undefined; accounts.next = accounts.safeState().default;
        lastAccount = undefined; announcedAccount = undefined; recoveryWarningShown = false;
        ctx.ui.setStatus("codex-refresh", undefined);
        if (startupWarning) { try { ctx.ui.notify(startupWarning, "warning"); } catch { /* optional UI */ } }
        await recoverLegacySelection(ctx);
        status(ctx);
        const pollAll = () => {
            status();
            try { void Promise.allSettled(store.accounts().map(a => poll(a))); } catch { /* optional telemetry */ }
        };
        if (ctx.mode === "tui") {
            pollAll();
            if (!timer) timer = setInterval(pollAll, 60_000);
        }
    });
    pi.on("model_select", async (_event, ctx) => { context = ctx; await recoverLegacySelection(ctx); status(ctx); });
    // Input runs before Pi's auth preflight; before_agent_start is already too late.
    // Covers native /login performed after startup and clients supplying a stale model object.
    pi.on("input", async (_event, ctx) => { await recoverLegacySelection(ctx); });
    pi.on("agent_end", async (_event, ctx) => {
        context = ctx; status(ctx);
        try { const active = store.accounts().find(a => a.id === accounts.active); if (active) void poll(active).catch(() => {}); } catch { /* telemetry */ }
    });
    pi.on("session_shutdown", () => {
        stopped.abort(); loginController?.abort();
        if (timer) clearInterval(timer);
        timer = undefined; context = undefined;
    });
}
