import type { AccountRuntime, UsageSnapshot, UsageWindow } from "./store";

export const WHAM_MIN_INTERVAL_MS = 60_000;
export const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const finite = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const percent = (v: unknown) => { const n = finite(v); return n !== null && n >= 0 && n <= 100 ? n : null; };

export function snapshotFromHeaders(headers: Record<string, string>, now = Date.now()): UsageSnapshot | undefined {
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    function window(which: string): UsageWindow | null {
        const usedPercent = percent(h[`x-codex-${which}-used-percent`]);
        if (usedPercent === null) return null;
        const at = finite(h[`x-codex-${which}-reset-at`]);
        const after = finite(h[`x-codex-${which}-reset-after-seconds`]);
        return { usedPercent, windowMinutes: finite(h[`x-codex-${which}-window-minutes`]),
            resetAt: at !== null ? at * 1000 : after !== null ? now + after * 1000 : null };
    }
    const primary = window("primary"), secondary = window("secondary");
    return primary || secondary ? { primary, secondary, capturedAt: now, source: "headers", planType: h["x-codex-plan-type"] } : undefined;
}

export function snapshotFromPayload(raw: unknown, now = Date.now()): UsageSnapshot | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const body = raw as Record<string, any>;
    function window(win: Record<string, unknown> | undefined): UsageWindow | null {
        const usedPercent = percent(win?.used_percent);
        if (usedPercent === null) return null;
        const seconds = finite(win?.limit_window_seconds), at = finite(win?.reset_at);
        return { usedPercent, windowMinutes: seconds !== null && seconds > 0 ? Math.ceil(seconds / 60) : null,
            resetAt: at !== null ? at * 1000 : null };
    }
    const primary = window(body.rate_limit?.primary_window), secondary = window(body.rate_limit?.secondary_window);
    return primary || secondary ? { primary, secondary, capturedAt: now, source: "wham",
        planType: typeof body.plan_type === "string" ? body.plan_type : undefined } : undefined;
}

export async function fetchUsageSnapshot(access: string, accountId: string, signal?: AbortSignal): Promise<UsageSnapshot> {
    const timeout = AbortSignal.timeout(10_000);
    const response = await fetch(USAGE_URL, { headers: { authorization: `Bearer ${access}`,
        "chatgpt-account-id": accountId, accept: "application/json", originator: "pi" },
        redirect: "error", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new Error(`Usage unavailable, HTTP ${response.status}`);
    const snapshot = snapshotFromPayload(await response.json());
    if (!snapshot) throw new Error("Usage response has no quota windows");
    return snapshot;
}

export function availability(runtime: AccountRuntime | undefined, now = Date.now()): "available" | "unknown" | "exhausted" {
    if (runtime?.blockedUntil && runtime.blockedUntil > now) return "exhausted";
    const windows = [runtime?.usage?.primary, runtime?.usage?.secondary].filter((w): w is UsageWindow => !!w);
    if (windows.some(w => w.usedPercent >= 100 && (!w.resetAt || w.resetAt > now))) return "exhausted";
    if (windows.length < 2 || runtime?.usageError || windows.some(w => w.resetAt !== null && w.resetAt <= now)) return "unknown";
    if (now - (runtime?.usage?.capturedAt ?? 0) > 5 * 60_000) return "unknown";
    return "available";
}

export function withUsage(runtime: AccountRuntime | undefined, snapshot: UsageSnapshot, now = Date.now()): AccountRuntime {
    const newerHeaders = runtime?.usage && runtime.usage.capturedAt > snapshot.capturedAt;
    const usage = newerHeaders ? runtime.usage! : snapshot;
    const recovered = !newerHeaders && availability({ usage }, now) === "available"
        && [runtime?.usage?.primary, runtime?.usage?.secondary].some(w => w && w.usedPercent >= 100);
    return { ...runtime, usage, lastWhamAt: now, usageError: undefined,
        blockedUntil: runtime?.blockedUntil && runtime.blockedUntil > now && !recovered ? runtime.blockedUntil : undefined };
}

export function resetMinutesFromMessage(message: string): number | undefined {
    const minutes = message.match(/(?:in|after)\s*~?\s*(\d+)\s*min/i);
    return minutes ? Number(minutes[1]) : undefined;
}
export function isUsageLimitError(message: string): boolean {
    // Never treat arbitrary 429s, unsupported models, or authentication failures as exhausted subscriptions.
    return /usage_limit_reached|(?:ChatGPT|monthly|weekly|codex) usage limit|hit your .*usage limit/i.test(message);
}
export function blockedReset(runtime: AccountRuntime, message: string, now = Date.now()): number {
    const windows = [runtime.usage?.primary, runtime.usage?.secondary];
    const resets = windows.filter(w => w && w.usedPercent >= 100 && w.resetAt && w.resetAt > now).map(w => w!.resetAt!);
    const minutes = resetMinutesFromMessage(message);
    return Math.max(runtime.blockedUntil && runtime.blockedUntil > now ? runtime.blockedUntil : 0,
        resets.length ? Math.max(...resets) : now + (minutes === undefined ? 60_000 : Math.max(1, minutes) * 60_000));
}
export function formatResetTime(at: number): string {
    return new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
