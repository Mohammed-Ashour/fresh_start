import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { OAuthCredential } from "@earendil-works/pi-ai";

export const CORE = "openai-codex";
export const PREFIX = "codex-";

export interface UsageWindow { usedPercent: number; windowMinutes: number | null; resetAt: number | null }
export interface UsageSnapshot {
    primary: UsageWindow | null;
    secondary: UsageWindow | null;
    capturedAt: number;
    planType?: string;
    source: "headers" | "wham";
}
export interface AccountRuntime {
    blockedUntil?: number;
    usage?: UsageSnapshot;
    lastWhamAt?: number;
    usageError?: string;
    preferredModel?: string; // Read only for compatibility with version 1.
}
export interface State {
    version: 2;
    migrated: boolean;
    default?: string;
    legacyAliases?: string[];
    legacyAuto?: boolean;
    addedOrder: string[];
    accounts: Record<string, AccountRuntime>;
}
export interface Account { id: string; accountId: string; providerId: string; label: string; planType?: string }

export function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
    try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
    catch { return undefined; }
}

export function credentialAccount(credential: unknown, providerId: string): Account | undefined {
    if (!credential || typeof credential !== "object") return undefined;
    const c = credential as Partial<OAuthCredential>;
    if (c.type !== "oauth" || !c.access || !c.refresh || !Number.isFinite(c.expires)) return undefined;
    const jwt = decodeJwtPayload(c.access);
    const auth = jwt?.["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
    const profile = jwt?.["https://api.openai.com/profile"] as Record<string, unknown> | undefined;
    const accountId = auth?.chatgpt_account_id ?? c.accountId;
    if (typeof accountId !== "string" || !accountId || (c.accountId && c.accountId !== accountId)) return undefined;
    const email = profile?.email ?? jwt?.email;
    return { id: `${PREFIX}${accountId}`, accountId, providerId,
        label: typeof email === "string" ? email : `account ${accountId.slice(0, 8)}`,
        planType: typeof auth?.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : undefined };
}

function readObject(path: string): Record<string, unknown> {
    let raw: string;
    try { raw = readFileSync(path, "utf8"); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
        throw new Error(`Cannot read ${path}`);
    }
    try {
        const value = JSON.parse(raw.replace(/^\uFEFF/, ""));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return value;
    } catch { throw new Error(`Invalid JSON object in ${path}; the file was not changed`); }
}

/** Reads credentials only. All credential mutations/refreshes belong to Pi's ModelRuntime. */
export class AccountStore {
    readonly authPath: string;
    readonly statePath: string;
    constructor(readonly dir: string) {
        this.authPath = join(dir, "auth.json");
        this.statePath = join(dir, "codex-accounts.json");
    }
    hasCredential(providerId: string): boolean { return providerId in readObject(this.authPath); }
    credential(providerId: string): OAuthCredential | undefined {
        const c = readObject(this.authPath)[providerId];
        return credentialAccount(c, providerId) ? c as OAuthCredential : undefined;
    }
    accounts(): Account[] {
        const auth = readObject(this.authPath);
        const keys = [CORE, ...Object.keys(auth).filter(id => id.startsWith(PREFIX))];
        const unique = new Map<string, Account>();
        for (const key of keys) {
            const account = credentialAccount(auth[key], key);
            if (account && !unique.has(account.id)) unique.set(account.id, account);
        }
        return [...unique.values()];
    }
    state(): State {
        const raw = readObject(this.statePath);
        return { version: 2, migrated: raw.migrated === true,
            default: typeof raw.default === "string" ? raw.default : undefined,
            legacyAliases: Array.isArray(raw.legacyAliases) ? raw.legacyAliases.filter(x => typeof x === "string" && x.startsWith(PREFIX)) : [],
            legacyAuto: raw.legacyAuto === true,
            addedOrder: Array.isArray(raw.addedOrder) ? raw.addedOrder.filter(x => typeof x === "string") : [],
            accounts: raw.accounts && typeof raw.accounts === "object" && !Array.isArray(raw.accounts)
                ? raw.accounts as State["accounts"] : {} };
    }
    /** Short metadata-only transaction; distinct from Pi's auth.json lock. Never contains tokens. */
    update(mutate: (state: State) => void): State {
        mkdirSync(this.dir, { recursive: true, mode: 0o700 });
        const lock = `${this.statePath}.lock`;
        let held = false;
        const tmp = `${this.statePath}.${randomUUID()}.tmp`;
        try {
            for (let attempt = 0; attempt < 40; attempt++) {
                try { mkdirSync(lock, { mode: 0o700 }); held = true; break; }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
                }
            }
            if (!held) throw new Error("Codex metadata is locked by another process; retry later");
            const state = this.state();
            mutate(state);
            writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
            renameSync(tmp, this.statePath);
            return state;
        } finally {
            rmSync(tmp, { force: true });
            if (held) rmSync(lock, { recursive: true, force: true });
        }
    }
}
