import type { AuthInteraction, AuthResult, LoginOptions, OAuthCredential, Provider } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { AccountStore, CORE, PREFIX, credentialAccount, type Account, type State } from "./store";
import { availability, blockedReset } from "./usage";

export type CredentialRuntime = Pick<ModelRuntime, "registerNativeProvider" | "login" | "logout" | "getAuth">;
const archiveId = (account: Account) => `codex-account-${account.accountId}`;
const silentInteraction: AuthInteraction = { prompt: async () => { throw new Error("Unexpected credential prompt"); }, notify() {} };

/** Pi owns credential transactions and refresh locking. This class never writes auth.json. */
export class Accounts {
    active?: string;
    next?: string;
    private credentialWrites: Promise<void> = Promise.resolve();
    private registered = new Set<string>();
    constructor(readonly store: AccountStore, private runtime: CredentialRuntime, readonly builtin: Provider) {}

    private provider(id: string): Provider {
        return { ...this.builtin, id, getModels: () => this.builtin.getModels().map(m => ({ ...m, provider: id })) };
    }
    private register(providerId: string): void {
        if (this.registered.has(providerId)) return;
        this.runtime.registerNativeProvider(this.provider(providerId));
        this.registered.add(providerId);
    }
    save(providerId: string, credential: OAuthCredential): Promise<void> {
        const write = this.credentialWrites.then(async () => {
            const base = this.provider(providerId);
            this.runtime.registerNativeProvider({ ...base, auth: { oauth: { ...this.builtin.auth.oauth!, login: async () => credential } } });
            try { await this.runtime.login(providerId, "oauth", silentInteraction); }
            finally { this.runtime.registerNativeProvider(base); this.registered.add(providerId); }
        });
        this.credentialWrites = write.catch(() => {});
        return write;
    }
    remember(id: string): void {
        const current = this.safeState();
        if (current.addedOrder.includes(id) && current.default) return;
        this.store.update(state => {
            if (!state.addedOrder.includes(id)) state.addedOrder.push(id);
            if (!state.default) state.default = id;
        });
    }
    /** Called by BOTH native /login and /codex. Archive only a different previous account. */
    async login(interaction: Parameters<NonNullable<Provider["auth"]["oauth"]>["login"]>[0], options?: LoginOptions): Promise<OAuthCredential> {
        const credential = await this.builtin.auth.oauth!.login(interaction, options);
        interaction.signal.throwIfAborted();
        const account = credentialAccount(credential, CORE);
        if (!account) throw new Error("OpenAI returned an invalid account credential");
        let previous = this.store.credential(CORE);
        let old = credentialAccount(previous, CORE);
        while (previous && old && old.id !== account.id) {
            interaction.signal.throwIfAborted();
            // Refresh before archiving: normal Pi requests must not rotate the token we are copying.
            try { await this.runtime.getAuth(CORE, { signal: interaction.signal, minOAuthValidityMs: 10 * 60_000 }); }
            catch { interaction.signal.throwIfAborted(); /* retain even an expired login for explicit reauthentication */ }
            previous = this.store.credential(CORE);
            old = credentialAccount(previous, CORE);
            if (!previous || !old || old.id === account.id) break;
            try { await this.save(archiveId(old), previous); break; }
            catch {
                interaction.signal.throwIfAborted();
                // Returning the new login here would overwrite the previous account's only saved token.
                const choice = await interaction.prompt({
                    type: "select", signal: interaction.signal,
                    message: "OpenAI authorization completed, but Pi could not save your previous account. The new login is not saved yet. Retry without reopening the browser, or cancel to keep the previous login.",
                    options: [{ id: "retry", label: "Retry saving the previous account" },
                        { id: "cancel", label: "Cancel; keep the previous login" }],
                });
                interaction.signal.throwIfAborted();
                if (choice !== "retry") throw new Error("Sign-in was not saved because the previous account could not be archived. The previous login was not replaced.");
                // The core slot may have refreshed while the dialog was open.
                previous = this.store.credential(CORE);
                old = credentialAccount(previous, CORE);
            }
        }
        interaction.signal.throwIfAborted();
        // Metadata is optional. A disk error must not turn a successful native login into a failure.
        try { if (old) this.remember(old.id); this.remember(account.id); } catch { /* shown on /codex if storage remains unavailable */ }
        this.next = account.id;
        return credential; // Pi persists this in the original openai-codex slot.
    }
    async add(interaction: AuthInteraction, options?: LoginOptions): Promise<Account> {
        const signal = interaction.signal ?? new AbortController().signal;
        const credential = await this.login({ ...interaction, signal }, options);
        await this.save(CORE, credential);
        await this.sync();
        return credentialAccount(credential, CORE)!;
    }
    /** Repair the original destructive migration once, without touching settings or a valid core login. */
    async migrate(): Promise<void> {
        const state = this.store.state();
        if (state.migrated) return;
        const accounts = this.store.accounts();
        const legacy = [...new Set([...(state.legacyAliases ?? []), ...state.addedOrder,
            ...accounts.filter(a => a.providerId === a.id).map(a => a.id)])];
        if (!this.store.hasCredential(CORE)) {
            const chosen = accounts.find(a => a.id === state.default) ?? accounts[0];
            if (chosen) {
                const credential = this.store.credential(chosen.providerId)!;
                await this.save(CORE, credential);
            }
        }
        await this.sync();
        this.store.update(next => { next.migrated = true; next.legacyAliases = legacy; next.legacyAuto = state.legacyAuto || legacy.length > 0; });
    }
    /** A core account has ONE credential owner, not a second refresh-token copy. */
    async sync(): Promise<void> {
        await this.credentialWrites;
        const core = credentialAccount(this.store.credential(CORE), CORE);
        if (core) {
            for (const id of [core.id, archiveId(core)]) {
                if (this.store.credential(id)) await this.runtime.logout(id);
            }
        }
        // Old public provider IDs become login-free aliases. Private credential IDs stay out of Pi's UI.
        for (const account of this.store.accounts()) {
            if (account.providerId === CORE) continue;
            const target = archiveId(account);
            if (account.providerId !== target) {
                await this.save(target, this.store.credential(account.providerId)!);
                await this.runtime.logout(account.providerId);
            }
        }
        for (const account of this.store.accounts()) {
            if (account.providerId !== CORE) this.register(account.providerId);
            try { this.remember(account.id); } catch { /* metadata must not block requests */ }
        }
    }
    candidates(): Account[] {
        const accounts = this.store.accounts();
        const state = this.safeState();
        const first = this.next ?? this.active ?? state.default;
        const order = [first, state.default, ...state.addedOrder, ...accounts.map(a => a.id)];
        const result: Account[] = [];
        for (const id of order) {
            const account = accounts.find(a => a.id === id);
            if (account && !result.some(a => a.id === id) && availability(state.accounts[account.id]) !== "exhausted") result.push(account);
        }
        return result;
    }
    safeState(): State {
        try { return this.store.state(); }
        catch { return { version: 2, migrated: false, addedOrder: [], accounts: {} }; }
    }
    async auth(account: Account, signal?: AbortSignal): Promise<AuthResult> {
        await this.credentialWrites;
        if (account.providerId !== CORE) this.register(account.providerId);
        const result = await this.runtime.getAuth(account.providerId, { signal });
        if (!result?.auth.apiKey) throw new Error(`Sign in again to ${account.label} with /codex`);
        // A concurrent /login may have replaced the core slot while this request was waiting.
        const actual = credentialAccount(this.store.credential(account.providerId), account.providerId);
        if (actual?.id !== account.id) throw new Error("Codex account changed during authentication; retry the request");
        return result;
    }
    selected(account: Account): void {
        this.active = account.id;
        this.next = undefined;
    }
    block(account: Account, message: string): void {
        try { this.store.update(state => {
            const runtime = state.accounts[account.id] ?? {};
            state.accounts[account.id] = { ...runtime, blockedUntil: blockedReset(runtime, message) };
        }); } catch { /* bounded in-request attempted set still prevents loops */ }
    }
    async remove(account: Account): Promise<void> {
        const current = this.store.accounts().find(a => a.id === account.id);
        if (!current) throw new Error("That account is no longer saved. Choose an account again.");
        account = current; // A native /login may have moved this account out of the core slot since the picker opened.
        await this.runtime.logout(account.providerId);
        const remainingAccounts = this.store.accounts();
        this.store.update(state => {
            delete state.accounts[account.id];
            state.addedOrder = state.addedOrder.filter(id => id !== account.id);
            state.legacyAliases = state.legacyAliases?.filter(id => id !== account.id);
            if (state.default === account.id) state.default = remainingAccounts[0]?.id;
        });
        if (this.active === account.id) this.active = undefined;
        if (this.next === account.id) this.next = undefined;
        // Removing the core account explicitly promotes a remaining account, so disabling the extension still works.
        if (account.providerId === CORE) {
            const remaining = this.store.accounts()[0];
            if (remaining) { await this.save(CORE, this.store.credential(remaining.providerId)!); await this.sync(); }
        }
    }
}
