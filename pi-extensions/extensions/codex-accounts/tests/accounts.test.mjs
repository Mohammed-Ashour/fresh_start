import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const packageDir = process.env.PI_PACKAGE_DIR ?? join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@earendil-works/pi-coding-agent');
const requirePi = createRequire(join(packageDir, 'package.json'));
const { createJiti } = requirePi('jiti');
const ai = join(packageDir, 'node_modules/@earendil-works/pi-ai/dist');
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: {
    '@earendil-works/pi-ai/providers/all': join(ai, 'providers/all.js'),
    '@earendil-works/pi-ai': join(ai, 'compat.js'),
    '@earendil-works/pi-coding-agent': join(packageDir, 'dist/index.js'),
} });
const dir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { AccountStore, CORE, credentialAccount } = await jiti.import(join(dir, 'store.ts'));
const { Accounts } = await jiti.import(join(dir, 'accounts.ts'));
const { rotateStream } = await jiti.import(join(dir, 'rotation.ts'));
const usage = await jiti.import(join(dir, 'usage.ts'));
const ui = await jiti.import(join(dir, 'ui.ts'));
const { ModelRuntime } = await import(pathToFileURL(join(packageDir, 'dist/index.js')));
const { createAssistantMessageEventStream } = await import(pathToFileURL(join(ai, 'compat.js')));
const extension = (await jiti.import(join(dir, 'index.ts'))).default;

const model = { id: 'test-codex', name: 'Test', provider: CORE, api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api',
    input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000, reasoning: true };
const token = (id, expires = Date.now() + 3600_000) => ({ type: 'oauth', access: 'header.' + Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: id, chatgpt_plan_type: 'plus' },
    'https://api.openai.com/profile': { email: `${id}@test.invalid` } })).toString('base64url') + '.signature',
    refresh: `fake-refresh-${id}`, accountId: id, expires });
const interaction = { signal: new AbortController().signal, notify() {}, prompt: async () => 'browser' };

async function fixture(t, initial = {}) {
    const root = mkdtempSync(join(tmpdir(), 'codex-accounts-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const store = new AccountStore(root);
    writeFileSync(store.authPath, JSON.stringify(initial), { mode: 0o600 });
    const runtime = await ModelRuntime.create({ authPath: store.authPath, modelsPath: null, modelsStorePath: join(root, 'models-store.json'), refreshOnCreate: false });
    let login = token('a'); let refreshes = 0;
    const builtin = { id: CORE, name: 'Fake Codex', getModels: () => [model],
        auth: { oauth: { name: 'ChatGPT', isSubscription: true, login: async () => login,
            refresh: async c => { refreshes++; await new Promise(r => setTimeout(r, 20)); return { ...c, refresh: c.refresh + '-rotated', expires: Date.now() + 3600_000 }; },
            toAuth: async c => ({ apiKey: c.access }) } },
        stream: () => { throw new Error('Unexpected network call'); }, streamSimple: () => { throw new Error('Unexpected network call'); } };
    runtime.registerNativeProvider(builtin);
    const accounts = new Accounts(store, runtime, builtin);
    return { root, store, runtime, builtin, accounts, setLogin(c) { login = c; }, refreshes: () => refreshes };
}

function message(text = '', stopReason = 'stop', errorMessage) {
    return { role: 'assistant', content: text ? [{ type: 'text', text }] : [], api: model.api, provider: CORE, model: model.id,
        stopReason, errorMessage, timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}
function events(list) { const s = createAssistantMessageEventStream(); for (const event of list) s.push(event); s.end(); return s; }
async function collect(s) { const result = []; for await (const event of s) result.push(event); return result; }
const success = () => { const m = message('ok'); return events([{ type: 'start', partial: m }, { type: 'done', reason: 'stop', message: m }]); };
const quota = () => { const m = message('', 'error', 'You have hit your ChatGPT usage limit. Try again in ~3 min.'); return events([{ type: 'start', partial: m }, { type: 'error', reason: 'error', error: m }]); };

// Credential and core compatibility tests use Pi's real locked credential runtime, with fake OAuth only.
test('loading restores a legacy missing core login once, never changes other credentials or settings', async t => {
    const f = await fixture(t, { 'codex-a': token('a'), anthropic: { type: 'api_key', key: 'unrelated' } });
    const settingsPath = join(f.root, 'settings.json'); writeFileSync(settingsPath, '{"defaultProvider":"openai-codex","defaultModel":"test-codex"}');
    const before = readFileSync(settingsPath, 'utf8');
    await f.accounts.migrate();
    assert.equal(f.store.credential(CORE).accountId, 'a');
    assert.equal(f.store.credential('codex-a'), undefined);
    assert.equal(JSON.parse(readFileSync(f.store.authPath)).anthropic.key, 'unrelated');
    assert.equal(readFileSync(settingsPath, 'utf8'), before);
    assert.equal(f.store.state().migrated, true);
    await f.runtime.logout(CORE);
    await f.accounts.migrate(); // A deliberate logout is not undone on reload.
    assert.equal(f.store.credential(CORE), undefined);
    assert.equal(statSync(f.store.statePath).mode & 0o777, 0o600);
});

test('valid core login and configured non-OAuth credential are never overwritten during migration', async t => {
    const f = await fixture(t, { [CORE]: token('b'), 'codex-a': token('a') });
    await f.accounts.migrate();
    assert.equal(f.store.credential(CORE).accountId, 'b');
    assert.equal(f.store.accounts().length, 2);
    assert.equal(f.store.credential('codex-account-a').accountId, 'a');
    const g = await fixture(t, { [CORE]: { type: 'api_key', key: 'keep' }, 'codex-a': token('a') });
    await g.accounts.migrate();
    assert.equal(JSON.parse(readFileSync(g.store.authPath))[CORE].key, 'keep');
});

test('native login hook and /codex add share account archiving, cancellation and deduplication', async t => {
    const f = await fixture(t, { [CORE]: token('a') }); await f.accounts.migrate();
    f.setLogin(token('b'));
    const returned = await f.accounts.login(interaction); // same hook called by the native /login provider
    await f.accounts.save(CORE, returned); // native Pi persists the return value
    await f.accounts.sync();
    assert.deepEqual(f.store.accounts().map(a => a.accountId).sort(), ['a', 'b']);
    assert.equal(f.store.credential('codex-account-a').accountId, 'a');
    assert.equal(f.store.credential(CORE).accountId, 'b');
    await f.accounts.add(interaction); // re-login B, no duplicate
    assert.equal(f.store.accounts().length, 2);
    const before = readFileSync(f.store.authPath, 'utf8');
    f.builtin.auth.oauth.login = async () => { throw new Error('cancelled'); };
    await assert.rejects(f.accounts.add(interaction), /cancelled/);
    assert.equal(readFileSync(f.store.authPath, 'utf8'), before);
});

test('concurrent OAuth refresh uses Pi locking and preserves rotated token and unrelated provider', async t => {
    const f = await fixture(t, { [CORE]: token('a', 1), anthropic: { type: 'api_key', key: 'keep' } });
    const account = f.store.accounts()[0];
    await Promise.all([f.accounts.auth(account), f.accounts.auth(account)]);
    assert.equal(f.refreshes(), 1);
    assert.equal(f.store.credential(CORE).refresh, 'fake-refresh-a-rotated');
    assert.equal(JSON.parse(readFileSync(f.store.authPath)).anthropic.key, 'keep');
});

test('corrupt auth/state fails closed without dropping credentials', async t => {
    const f = await fixture(t, { [CORE]: token('a') });
    writeFileSync(f.store.statePath, '{broken');
    assert.throws(() => f.store.update(() => {}), /Invalid JSON/);
    assert.equal(readFileSync(f.store.statePath, 'utf8'), '{broken');
    writeFileSync(f.store.authPath, '{broken');
    assert.throws(() => f.store.accounts(), /Invalid JSON/);
    assert.equal(readFileSync(f.store.authPath, 'utf8'), '{broken');
});

test('weekly exhaustion blocks selection, expired reset stays unknown, and display uses remaining quota', () => {
    const now = Date.now();
    const snapshot = usage.snapshotFromPayload({ rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18000, reset_at: (now + 3600_000) / 1000 },
        secondary_window: { used_percent: 100, limit_window_seconds: 604800, reset_at: (now + 86400_000) / 1000 } } }, now);
    assert.equal(usage.availability({ usage: snapshot }, now), 'exhausted');
    assert.match(ui.quotaSummary({ usage: snapshot }, now), /5h 80% left/);
    assert.match(ui.quotaSummary({ usage: snapshot }, now), /wk 0% left/);
    const reset = { usage: { ...snapshot, primary: { ...snapshot.primary, resetAt: now - 1 }, secondary: null } };
    assert.equal(usage.availability(reset, now), 'unknown');
    assert.match(ui.quotaSummary(reset, now), /unverified/);
    assert.equal(usage.snapshotFromPayload({ rate_limit: { primary_window: { used_percent: null } } }), undefined);
    assert.equal(usage.isUsageLimitError('HTTP 429 too many requests'), false);
});

test('default selection, explicit switch, continuation and all-exhausted behavior', async t => {
    const f = await fixture(t, { [CORE]: token('a'), 'codex-b': token('b') }); await f.accounts.migrate();
    f.store.update(s => { s.default = 'codex-b'; });
    assert.equal(f.accounts.candidates()[0].accountId, 'b');
    f.accounts.next = 'codex-a'; assert.equal(f.accounts.candidates()[0].accountId, 'a');
    f.accounts.selected(f.accounts.candidates()[0]); assert.equal(f.accounts.next, undefined);
    assert.equal(f.accounts.candidates()[0].accountId, 'a');
    f.accounts.block(f.store.accounts().find(a => a.accountId === 'a'), 'ChatGPT usage limit');
    assert.equal(f.accounts.candidates()[0].accountId, 'b');
    f.accounts.next = 'codex-a'; f.accounts.selected(f.accounts.candidates()[0]);
    assert.equal(f.accounts.next, undefined); // a skipped, exhausted preference does not hijack later continuations
    f.accounts.block(f.store.accounts().find(a => a.accountId === 'b'), 'ChatGPT usage limit');
    const result = await rotateStream(model, { messages: [] }, {}, f.accounts, () => { throw new Error('must not send'); }, () => {}).result();
    assert.match(result.errorMessage, /No Codex accounts with available quota/);
});

test('quota before content retries another account once with same model and hooks', async t => {
    const f = await fixture(t, { [CORE]: token('a'), 'codex-b': token('b') }); await f.accounts.migrate();
    const calls = [], hook = [];
    const send = (m, c, o) => {
        const id = credentialAccount({ ...token('a'), accountId: undefined, access: o.apiKey }, CORE)?.accountId;
        calls.push([id, m.id]); assert.equal(o.onPayload, payloadHook); assert.equal(o.signal, signal);
        void o.onResponse({ status: 200, headers: { 'x-codex-primary-used-percent': '20' } }, m);
        return calls.length === 1 ? quota() : success();
    };
    const signal = new AbortController().signal, payloadHook = () => {};
    const result = await collect(rotateStream(model, { messages: [] }, { signal, onPayload: payloadHook, onResponse: () => { hook.push(true); } }, f.accounts, send, () => {}));
    assert.deepEqual(calls, [['a', 'test-codex'], ['b', 'test-codex']]);
    assert.equal(result.filter(e => e.type === 'start').length, 1);
    assert.equal(result.filter(e => e.type === 'done').length, 1);
    assert.equal(result.filter(e => e.type === 'error').length, 0);
    assert.equal(hook.length, 2);
});

test('partial content, authentication errors, generic 429 and abort are never replayed', async t => {
    for (const mode of ['partial', 'auth', '429', 'abort']) {
        const f = await fixture(t, { [CORE]: token('a'), 'codex-b': token('b') }); await f.accounts.migrate();
        let calls = 0;
        const result = await collect(rotateStream(model, { messages: [] }, {}, f.accounts, () => {
            calls++;
            const err = message(mode === 'partial' ? 'partial' : '', mode === 'abort' ? 'aborted' : 'error',
                mode === 'auth' ? '401 unauthorized' : mode === '429' ? 'HTTP 429 too many requests' : 'ChatGPT usage limit');
            const list = [{ type: 'start', partial: err }];
            if (mode === 'partial') list.push({ type: 'text_delta', contentIndex: 0, delta: 'partial', partial: err });
            list.push({ type: 'error', reason: mode === 'abort' ? 'aborted' : 'error', error: err });
            return events(list);
        }, () => {}));
        assert.equal(calls, 1, mode); assert.equal(result.filter(e => e.type === 'error').length, 1, mode);
    }
});

test('all quota errors have bounded retries and exactly one terminal error; pre-abort sends nothing', async t => {
    const f = await fixture(t, { [CORE]: token('a'), 'codex-b': token('b') }); await f.accounts.migrate();
    let calls = 0;
    const result = await collect(rotateStream(model, { messages: [] }, {}, f.accounts, () => { calls++; return quota(); }, () => {}));
    assert.equal(calls, 2); assert.equal(result.filter(e => e.type === 'error').length, 1);
    const controller = new AbortController(); controller.abort();
    const aborted = await rotateStream(model, { messages: [] }, { signal: controller.signal }, f.accounts, () => { throw new Error('must not send'); }, () => {}).result();
    assert.equal(aborted.stopReason, 'aborted');
});

test('actual extension registration has one OAuth login, preserves settings, and legacy aliases resolve core auth', async t => {
    const root = mkdtempSync(join(tmpdir(), 'codex-extension-test-')); t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, 'auth.json'), JSON.stringify({ 'codex-a': token('a'), 'codex-b': token('b'), other: { type: 'api_key', key: 'keep' } }));
    const settings = '{"defaultProvider":"openai-codex","defaultModel":"gpt-5.5"}'; writeFileSync(join(root, 'settings.json'), settings);
    const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = root;
    const providers = [], virtuals = [], commands = new Map(), handlers = new Map();
    try {
        await extension({ registerProvider: p => providers.push(p), registerVirtualModel: v => virtuals.push(v), registerCommand: (name, options) => commands.set(name, options),
            on: (name, handler) => handlers.set(name, handler), getSettings: () => JSON.parse(settings) });
        assert.deepEqual(providers.filter(p => p.auth.oauth).map(p => p.id), [CORE]);
        assert.ok(commands.has('codex') && commands.has('codex-usage'));
        assert.ok(handlers.has('session_shutdown'));
        assert.equal(providers.filter(p => p.auth.apiKey).length, 0); // no competing API-key login entries, either
        const alias = virtuals.find(p => p.provider === 'codex-a');
        assert.ok(alias);
        const routed = alias.route({ thinkingLevel: 'medium' }, { modelRegistry: { find: (p, id) => ({ ...model, id, provider: p }) } });
        assert.equal(routed.model.provider, CORE);
        assert.equal(routed.thinkingLevel, 'medium');
        assert.equal(readFileSync(join(root, 'settings.json'), 'utf8'), settings);
        const withoutExtension = await ModelRuntime.create({ authPath: join(root, 'auth.json'), modelsPath: null, modelsStorePath: join(root, 'cache.json'), refreshOnCreate: false });
        assert.ok((await withoutExtension.getAuth(CORE)).auth.apiKey); // core works even when extension is disabled
    } finally { if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; }
});

test('removing the core account promotes a remaining login; removing the last signs out', async t => {
    const f = await fixture(t, { [CORE]: token('a'), 'codex-b': token('b'), other: { type: 'api_key', key: 'keep' } });
    await f.accounts.migrate();
    f.accounts.active = 'codex-a'; f.accounts.next = 'codex-a';
    await f.accounts.remove(f.store.accounts().find(a => a.accountId === 'a'));
    assert.equal(f.store.credential(CORE).accountId, 'b');
    assert.equal(f.store.accounts().length, 1);
    assert.equal(f.store.credential('codex-account-b'), undefined);
    assert.equal(f.accounts.active, undefined); assert.equal(f.accounts.next, undefined);
    await f.accounts.remove(f.store.accounts()[0]);
    assert.equal(f.store.credential(CORE), undefined); assert.equal(f.store.accounts().length, 0);
    assert.equal(JSON.parse(readFileSync(f.store.authPath)).other.key, 'keep');
});

test('failed refresh is explicit and never replayed; a fresh sign-in can still replace a revoked core login', async t => {
    const f = await fixture(t, { [CORE]: token('a', 1), 'codex-b': token('b') }); await f.accounts.migrate();
    f.builtin.auth.oauth.refresh = async () => { throw new Error('invalid_grant'); };
    let calls = 0;
    const result = await rotateStream(model, { messages: [] }, {}, f.accounts, () => { calls++; return success(); }, () => {}).result();
    assert.equal(result.stopReason, 'error'); assert.equal(calls, 0);
    f.setLogin(token('c'));
    await f.accounts.add(interaction);
    assert.equal(f.store.credential(CORE).accountId, 'c');
    assert.deepEqual(f.store.accounts().map(a => a.accountId).sort(), ['a', 'b', 'c']);
});

test('archiving refreshes an expiring token first; overlapping credential saves remain ordered', async t => {
    const f = await fixture(t, { [CORE]: token('a', 1) }); await f.accounts.migrate();
    f.setLogin(token('b')); await f.accounts.add(interaction);
    assert.equal(f.store.credential('codex-account-a').refresh, 'fake-refresh-a-rotated');
    await Promise.all([f.accounts.save('codex-account-c', token('c')), f.accounts.save('codex-account-c', token('d'))]);
    assert.equal(f.store.credential('codex-account-c').accountId, 'd');
});

test('native stream still works without extension accounts or with unreadable extension metadata', async t => {
    const f = await fixture(t);
    const noAccounts = await rotateStream(model, { messages: [] }, { apiKey: 'explicit' }, f.accounts, (_m, _c, o) => { assert.equal(o.apiKey, 'explicit'); return success(); }, () => {}).result();
    assert.equal(noAccounts.stopReason, 'stop');
    writeFileSync(f.store.authPath, '{broken');
    const corrupt = await rotateStream(model, { messages: [] }, { apiKey: 'explicit' }, f.accounts, (_m, _c, o) => { assert.equal(o.apiKey, 'explicit'); return success(); }, () => {}).result();
    assert.equal(corrupt.stopReason, 'stop'); assert.equal(readFileSync(f.store.authPath, 'utf8'), '{broken');
});

test('usage endpoint failures are visible, headers have correct units, and caller cancellation is passed through', async t => {
    const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
    const now = Date.now();
    const header = usage.snapshotFromHeaders({ 'X-Codex-Primary-Used-Percent': '20', 'X-Codex-Primary-Reset-After-Seconds': '60',
        'x-codex-secondary-used-percent': '30', 'x-codex-secondary-reset-at': String((now + 3600_000) / 1000) }, now);
    assert.equal(header.primary.resetAt, now + 60_000); assert.equal(header.secondary.resetAt, now + 3600_000);
    globalThis.fetch = async (_url, opts) => { assert.equal(opts.headers['chatgpt-account-id'], 'a'); return new Response('', { status: 401 }); };
    await assert.rejects(usage.fetchUsageSnapshot('fake-token', 'a'), /HTTP 401/);
    globalThis.fetch = async () => new Response('{}', { status: 200 });
    await assert.rejects(usage.fetchUsageSnapshot('fake-token', 'a'), /no quota windows/);
    const controller = new AbortController(); controller.abort();
    globalThis.fetch = async (_url, opts) => { assert.equal(opts.signal.aborted, true); opts.signal.throwIfAborted(); };
    await assert.rejects(usage.fetchUsageSnapshot('fake-token', 'a', controller.signal), /abort/i);
});

test('account picker, footer and quota report distinguish current/default/next and never confuse remaining with used', () => {
    const now = Date.now();
    const all = [credentialAccount(token('a'), CORE), credentialAccount(token('b'), 'codex-account-b')];
    const runtime = { usage: { capturedAt: now, source: 'wham', primary: { usedPercent: 20, resetAt: now + 3600_000, windowMinutes: 300 },
        secondary: { usedPercent: 60, resetAt: now + 86400_000, windowMinutes: 10080 } } };
    const state = { version: 2, migrated: true, default: 'codex-a', addedOrder: ['codex-a', 'codex-b'], accounts: { 'codex-a': runtime } };
    const label = ui.choiceLabel(all[0], all, state, 'codex-a', 'codex-b');
    assert.match(label, /current, default/); assert.match(label, /5h 80% left/); assert.match(label, /wk 40% left/);
    assert.match(ui.choiceLabel(all[1], all, state, 'codex-a', 'codex-b'), /next/);
    const footer = ui.footerLine(all[0], all, state, false, now);
    assert.match(footer, /80% left/); assert.match(footer, /1\/2 ready/); assert.match(footer, /reset/);
    assert.ok(footer.length < 150); assert.doesNotMatch(footer, /% used/);
    const report = ui.usageReport(all, state, 'codex-a', 'codex-b');
    assert.match(report, /Short window: 80% left/); assert.match(report, /Weekly: 40% left/); assert.match(report, /resets/);
    assert.match(report, /\[next, plus\]/);
    assert.equal(usage.availability({ usage: { ...runtime.usage, secondary: null } }), 'unknown');
});

test('duplicate account labels stay unique and command completion uses stable IDs', () => {
    const all = [credentialAccount(token('same00001'), CORE), credentialAccount(token('same00002'), 'codex-account-b')].map(a => ({ ...a, label: 'same@test.invalid' }));
    const state = { version: 2, migrated: true, default: all[0].id, addedOrder: [], accounts: {} };
    assert.notEqual(ui.choiceLabel(all[0], all, state), ui.choiceLabel(all[1], all, state));
    assert.throws(() => ui.findAccount('same@test.invalid', all), /ambiguous/);
    assert.throws(() => ui.findAccount('same', all), /ambiguous/);
    assert.equal(ui.findAccount('same00002', all).id, all[1].id);
    const choices = ui.completions('use same', all, state);
    assert.deepEqual(choices.map(c => c.value), ['use same00001', 'use same00002']);
    assert.deepEqual(ui.completions('us', all, state).map(c => c.value), ['use', 'usage']);
});

test('command UX: fresh installs have no legacy aliases, switching selects Codex, defaults do not switch, and removal can be cancelled', async t => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ux-test-')); t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, 'auth.json'), JSON.stringify({ [CORE]: token('a'), 'codex-account-b': token('b') }));
    const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = root;
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; });
    const commands = new Map(), events = new Map(), virtuals = [], messages = [], notices = [], statuses = new Map();
    let confirmation = false, selections = 0;
    const ctx = { hasUI: true, mode: 'print', model: { ...model, provider: 'anthropic' }, waitForIdle: async () => {},
        modelRegistry: { find: (p, id) => id === 'gpt-5.5' ? { ...model, id, provider: p } : undefined, getModelsOfType: () => [model], refresh: async () => {} },
        ui: { setStatus: (k, v) => statuses.set(k, v), notify: (message, type) => notices.push([message, type]),
            confirm: async () => confirmation, select: async () => { selections++; return undefined; } } };
    await extension({ registerProvider() {}, registerVirtualModel: v => virtuals.push(v), unregisterVirtualModel() {},
        registerCommand: (name, options) => commands.set(name, options), on: (name, handler) => events.set(name, handler),
        sendMessage: m => messages.push(m), setModel: async m => { ctx.model = m; return true; } });
    assert.deepEqual(virtuals, []);
    await events.get('session_start')({}, ctx);
    await commands.get('codex').handler('default b', ctx);
    assert.equal(JSON.parse(readFileSync(join(root, 'codex-accounts.json'))).default, 'codex-b');
    assert.equal(ctx.model.provider, 'anthropic');
    assert.match(notices.at(-1)[0], /this session is unchanged/);
    await commands.get('codex').handler('use b', ctx);
    assert.equal(ctx.model.provider, CORE); assert.match(statuses.get('codex'), /next b@test.invalid/);
    const authBefore = readFileSync(join(root, 'auth.json'), 'utf8');
    await commands.get('codex').handler('remove b', ctx);
    assert.equal(readFileSync(join(root, 'auth.json'), 'utf8'), authBefore);
    await commands.get('codex').handler('help', ctx); assert.match(messages.at(-1).content, /Tab completes/);
    globalThis.fetch = async () => new Response(JSON.stringify({ plan_type: 'plus', rate_limit: {
        primary_window: { used_percent: 20, reset_at: (Date.now() + 3600_000) / 1000, limit_window_seconds: 18000 },
        secondary_window: { used_percent: 30, reset_at: (Date.now() + 86400_000) / 1000, limit_window_seconds: 604800 } } }));
    await commands.get('codex').handler('usage', ctx);
    assert.match(messages.at(-1).content, /80% left/); assert.match(messages.at(-1).content, /2\/2 accounts confirmed ready/);
    assert.equal(statuses.get('codex-refresh'), undefined);
    confirmation = true; await commands.get('codex').handler('remove b', ctx);
    assert.equal(JSON.parse(readFileSync(join(root, 'auth.json')))['codex-account-b'], undefined);
    assert.equal(selections, 0); // direct commands do not require extra picker steps
    let markStarted;
    const started = new Promise(resolve => { markStarted = resolve; });
    globalThis.fetch = async (_url, opts) => {
        markStarted();
        return new Promise((_resolve, reject) => {
            if (opts.signal.aborted) reject(opts.signal.reason);
            else opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true });
        });
    };
    const beforeReload = messages.length;
    const pendingReport = commands.get('codex').handler('usage', ctx);
    await started;
    await events.get('session_shutdown')(); await events.get('session_start')({}, ctx);
    await pendingReport;
    assert.equal(messages.length, beforeReload); // no old-session report is sent into the new session
    assert.equal(statuses.get('codex-refresh'), undefined);
    await events.get('session_shutdown')();
});

test('fresh quota restores a reset account without clearing unverified blocks or overwriting newer headers', () => {
    const now = Date.now();
    const fresh = { capturedAt: now, source: 'wham', primary: { usedPercent: 20, resetAt: now + 3600_000, windowMinutes: 300 },
        secondary: { usedPercent: 40, resetAt: now + 86400_000, windowMinutes: 10080 } };
    const exhausted = { ...fresh, capturedAt: now - 60_000, secondary: { ...fresh.secondary, usedPercent: 100 } };
    const recovered = usage.withUsage({ usage: exhausted, blockedUntil: now + 86400_000 }, fresh, now);
    assert.equal(recovered.blockedUntil, undefined); assert.equal(usage.availability(recovered, now), 'available');
    const unknownBlock = usage.withUsage({ usage: { ...fresh, capturedAt: now - 60_000 }, blockedUntil: now + 60_000 }, fresh, now);
    assert.equal(unknownBlock.blockedUntil, now + 60_000);
    const newerHeaders = { ...exhausted, capturedAt: now + 1, source: 'headers' };
    const stalePoll = usage.withUsage({ usage: newerHeaders, blockedUntil: now + 86400_000 }, fresh, now);
    assert.equal(stalePoll.usage, newerHeaders); assert.equal(stalePoll.blockedUntil, now + 86400_000);
});

test('removing an account from a stale picker never deletes a newer native login', async t => {
    const f = await fixture(t, { [CORE]: token('a') }); await f.accounts.migrate();
    const oldPickerChoice = f.store.accounts()[0];
    f.setLogin(token('b')); await f.accounts.add(interaction);
    await f.accounts.remove(oldPickerChoice);
    assert.equal(f.store.credential(CORE).accountId, 'b');
    assert.deepEqual(f.store.accounts().map(a => a.accountId), ['b']);
    await assert.rejects(f.accounts.remove(oldPickerChoice), /no longer saved/);
});
