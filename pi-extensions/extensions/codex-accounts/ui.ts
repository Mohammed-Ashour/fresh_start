import type { Account, AccountRuntime, State } from "./store";
import { availability, formatResetTime } from "./usage";

export const actions = [
    { value: "add", label: "add: sign in to another ChatGPT account" },
    { value: "use", label: "use: switch this session to an account" },
    { value: "default", label: "default: choose the account for new sessions" },
    { value: "usage", label: "usage: refresh remaining quota and reset times" },
    { value: "remove", label: "remove: sign out a saved account" },
    { value: "cancel", label: "cancel: stop a pending sign-in" },
    { value: "help", label: "help: show account commands" },
];
export const help = [
    "Codex accounts", "",
    "/codex: account menu",
    "/codex add: sign in",
    "/codex use [account]: switch this session",
    "/codex default [account]: default for new sessions",
    "/codex usage: remaining quota and reset times",
    "/codex remove [account]: sign out, with confirmation",
    "/codex cancel: cancel sign-in", "",
    "Account arguments accept an email, full account ID or unique ID prefix. Tab completes saved accounts.",
    "/login uses the same Codex sign-in flow.",
].join("\n");

export function accountName(account: Account, all: Account[]): string {
    const peers = all.filter(a => a.label === account.label && a.id !== account.id);
    if (!peers.length) return account.label;
    let length = Math.min(8, account.accountId.length);
    while (length < account.accountId.length && peers.some(a => a.accountId.startsWith(account.accountId.slice(0, length)))) length++;
    return `${account.label} [${account.accountId.slice(0, length)}]`;
}
export function quotaSummary(runtime: AccountRuntime | undefined, now = Date.now()): string {
    const windows = [["5h", runtime?.usage?.primary], ["wk", runtime?.usage?.secondary]] as const;
    const quotas = windows.filter(([, w]) => w && (!w.resetAt || w.resetAt > now))
        .map(([label, w]) => `${label} ${Math.round(100 - w!.usedPercent)}% left`);
    const state = availability(runtime, now);
    if (state === "exhausted") quotas.push("waiting for reset");
    else if (state === "unknown") quotas.push(runtime?.usageError ? "refresh failed" : "unverified");
    return quotas.join(" · ") || "quota unknown";
}
export function choiceLabel(account: Account, all: Account[], state: State, current?: string, next?: string): string {
    const tags = [account.id === current ? "current" : undefined, account.id === next ? "next" : undefined, account.id === state.default ? "default" : undefined].filter(Boolean);
    return `${accountName(account, all)}${tags.length ? ` [${tags.join(", ")}]` : ""} · ${quotaSummary(state.accounts[account.id])}`;
}
export function footerLine(account: Account, all: Account[], state: State, next = false, now = Date.now()): string {
    const ready = all.filter(a => availability(state.accounts[a.id], now) === "available").length;
    const runtime = state.accounts[account.id];
    const blocked = runtime?.blockedUntil && runtime.blockedUntil > now ? runtime.blockedUntil : undefined;
    const resets = [runtime?.usage?.primary, runtime?.usage?.secondary]
        .filter(w => w?.resetAt && w.resetAt > now && (availability(runtime, now) !== "exhausted" || w.usedPercent >= 100))
        .map(w => w!.resetAt!);
    const waiting = [blocked, ...resets].filter((at): at is number => at !== undefined);
    const reset = waiting.length ? availability(runtime, now) === "exhausted" ? Math.max(...waiting) : Math.min(...waiting) : undefined;
    const date = reset ? new Date(reset) : undefined;
    const resetLabel = date ? date.toLocaleDateString() === new Date(now).toLocaleDateString()
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined;
    const name = accountName(account, all);
    return `Codex ${next ? "next " : ""}${name.length > 32 ? name.slice(0, 29) + "..." : name}: ${quotaSummary(runtime, now)}${resetLabel ? ` · reset ${resetLabel}` : ""} · ${ready}/${all.length} ready`;
}
export function usageReport(all: Account[], state: State, current?: string, next?: string): string {
    const lines = ["Codex remaining quota", ""];
    for (const account of all) {
        const runtime = state.accounts[account.id];
        const tags = [account.id === current ? "current" : undefined, account.id === next ? "next" : undefined, account.id === state.default ? "default" : undefined,
            runtime?.usage?.planType ?? account.planType].filter(Boolean);
        lines.push(`${accountName(account, all)}${tags.length ? ` [${tags.join(", ")}]` : ""}`);
        const windows = [["Short window", runtime?.usage?.primary], ["Weekly", runtime?.usage?.secondary]] as const;
        for (const [label, w] of windows) {
            if (!w) { lines.push(`  ${label}: unknown`); continue; }
            lines.push(`  ${label}: ${w.resetAt && w.resetAt <= Date.now() ? "reset passed, refresh needed" : `${Math.round(100 - w.usedPercent)}% left`}${w.resetAt ? ` · resets ${formatResetTime(w.resetAt)}` : ""}`);
        }
        if (runtime?.blockedUntil && runtime.blockedUntil > Date.now()) lines.push(`  Unavailable until ${formatResetTime(runtime.blockedUntil)}`);
        if (runtime?.usageError) lines.push("  Refresh failed; quota values above are cached.");
        else if (availability(runtime) === "unknown") lines.push("  Cached or incomplete quota; not confirmed ready.");
        lines.push("");
    }
    const ready = all.filter(a => availability(state.accounts[a.id]) === "available").length;
    lines.push(`${ready}/${all.length} accounts confirmed ready. Unknown quota can still be tried; expired or revoked logins need sign-in.`);
    return lines.join("\n");
}
export function findAccount(query: string, all: Account[]): Account {
    const text = query.trim().toLowerCase();
    const exact = all.filter(a => [a.id, a.accountId, a.label].some(v => v.toLowerCase() === text));
    const matches = exact.length ? exact : text.length >= 4 ? all.filter(a => a.id.toLowerCase().startsWith(text) || a.accountId.toLowerCase().startsWith(text)) : [];
    if (matches.length > 1) throw new Error("That account name is ambiguous. Use /codex to choose an account, or Tab to complete its ID.");
    if (!matches.length) throw new Error("No matching saved account. Use /codex to choose one or add a login.");
    return matches[0];
}
export function completions(prefix: string, all: Account[], state: State, current?: string, next?: string) {
    prefix = prefix.trimStart();
    const match = prefix.match(/^(use|default|remove)\s+(.*)$/i);
    if (!match) return actions.filter(a => a.value.startsWith(prefix.toLowerCase()));
    const filter = match[2].trim().toLowerCase();
    return all.filter(a => [a.label, a.accountId, a.id].some(v => v.toLowerCase().includes(filter)))
        .map(a => ({ value: `${match[1].toLowerCase()} ${a.accountId}`, label: choiceLabel(a, all, state, current, next) }));
}
