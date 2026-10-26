import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

let host = dirname(realpathSync(process.env.PI_BIN || "/opt/homebrew/bin/pi"));
while (!existsSync(join(host, "dist/index.js"))) {
  const parent = dirname(host);
  if (parent === host) throw new Error("Cannot locate Pi's installed package");
  host = parent;
}
const temporary = mkdtempSync(join(tmpdir(), "mini-agents-test-"));
after(() => rmSync(temporary, { recursive: true, force: true }));
const corePath = join(host, "dist/index.js");
const core = await import(pathToFileURL(corePath));
const requirePi = createRequire(join(host, "package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: {
  "@earendil-works/pi-coding-agent": corePath,
  "@earendil-works/pi-ai": join(host, "node_modules/@earendil-works/pi-ai/dist/index.js"),
  "@earendil-works/pi-tui": join(host, "node_modules/@earendil-works/pi-tui/dist/index.js"),
} });
const extension = await jiti.import(new URL("../index.ts", import.meta.url).pathname);
const { visibleWidth } = await import(pathToFileURL(join(host, "node_modules/@earendil-works/pi-tui/dist/index.js")));

/** Create a private fixture folder for one test. */
function fixture() { return mkdtempSync(join(temporary, "case-")); }

/** Serve a deterministic streaming model without paid API calls. */
async function modelServer(mode = "success") {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    if (mode === "hang") return;
    if (mode === "error") { response.writeHead(400); response.end("fixture failure"); return; }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (delta, finish_reason = null) => `data: ${JSON.stringify({
      id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture",
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`;
    if (mode === "external" && requests.length === 1) {
      response.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: "external-call", type: "function",
        function: { name: "fixture_mcp", arguments: "{}" } }] }));
      response.write(chunk({}, "tool_calls"));
    } else if ((mode === "write" && requests.length === 1) || (mode === "question-write" && requests.length === 2)) {
      response.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: "write-file", type: "function",
        function: { name: "write", arguments: JSON.stringify({ path: "implemented.txt", content: "implemented\n" }) } }] }));
      response.write(chunk({}, "tool_calls"));
    } else if ((mode === "question" || mode === "question-write") && requests.length === 1) {
      response.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: "ask-user", type: "function",
        function: { name: "ask_user", arguments: JSON.stringify({ question: "Which file should I change?" }) } }] }));
      response.write(chunk({}, "tool_calls"));
    } else if (mode === "web" && requests.length === 1 && requests[0].tools.some((tool) => tool.function.name === "web_enable")) {
      response.write(chunk({ role: "assistant", tool_calls: [{ index: 0, id: "enable-web", type: "function",
        function: { name: "web_enable", arguments: "{}" } }] }));
      response.write(chunk({}, "tool_calls"));
    } else {
      response.write(chunk({ role: "assistant", content: "No actionable findings." }));
      response.write(chunk({}, mode === "length" ? "length" : "stop"));
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const directory = fixture();
  const runtime = await core.ModelRuntime.create({
    modelsPath: null, authPath: join(directory, "auth.json"),
    modelsStorePath: join(directory, "models-store.json"), refreshOnCreate: false,
  });
  runtime.registerProvider("mini-fixture", {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: "openai-completions", apiKey: "test",
    models: [{
      id: "fixture", name: "Fixture", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 1000,
    }],
  });
  return { runtime, model: runtime.getModel("mini-fixture", "fixture"), requests,
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

/** Wait for observable background work, failing rather than hanging a test. */
async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Background work did not finish within five seconds");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Capture command and widget behavior without taking ownership of a terminal. */
function commandHarness(service, options = {}) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  const realAgentDir = core.getAgentDir();
  const agentDir = fixture();
  symlinkSync(join(realAgentDir, "npm"), join(agentDir, "npm"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const commands = new Map();
  const events = new Map();
  const reports = [];
  const questions = [];
  const notifications = [];
  const widgets = [];
  const selections = [];
  const peeks = [];
  let menuCount = 0;
  const registeredTools = new Map();
  const startupMessages = [];
  const parentCalls = [];
  let parent;
  let bootstrap;
  let blocked = false;
  let permissionCommand;
  extension.default({
    registerTool: (tool) => registeredTools.set(tool.name, tool),
    getActiveTools: () => [...registeredTools.keys()],
    getSettings: () => ({ retry: { enabled: false }, compaction: { enabled: false } }),
    sendUserMessage: (message) => {
      startupMessages.push(message);
      if (options.manualStartup) return;
      bootstrap = (async () => {
        const loader = new core.DefaultResourceLoader({
          cwd: context.cwd, agentDir, settingsManager: core.SettingsManager.inMemory({}),
          noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
          systemPromptOverride: () => "Parent effective instructions: preserve unrelated changes.",
          additionalExtensionPaths: [new URL("../../permission-gate.ts", import.meta.url).pathname],
          extensionFactories: [(pi) => {
            pi.on("tool_call", (event) => {
              parentCalls.push(event.toolName);
              if (blocked && ["write", "edit", "bash"].includes(event.toolName)) return { block: true, reason: "Parent plan mode denies mutations" };
            });
            pi.on("tool_result", (event) => {
              if (event.toolName === "fixture_mcp") return { content: [{ type: "text", text: "filtered by parent hook" }] };
            });
          }],
        });
        await loader.reload();
        assert.deepEqual(loader.getExtensions().errors, []);
        permissionCommand = loader.getExtensions().extensions.find((item) => item.commands.has("permissions")).commands.get("permissions");
        await permissionCommand.handler("fullAuto", context);
        ({ session: parent } = await core.createAgentSession({ cwd: context.cwd, model: service.model,
          modelRuntime: service.runtime, resourceLoader: loader, sessionManager: core.SessionManager.inMemory(context.cwd),
          tools: ["read", "grep", "find", "ls", "bash", "edit", "write", "fixture_mcp"],
          customTools: [core.defineTool({ name: "fixture_mcp", label: "Fixture MCP", description: "External fixture capability",
            parameters: { type: "object", properties: {}, additionalProperties: false },
            execute: async () => ({ content: [{ type: "text", text: "external result" }], details: undefined }) })],
        }));
        await parent.bindExtensions({ mode: "print" });
        parent.sessionManager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Starting authorized implementation" }],
          api: "openai-completions", provider: service.model.provider, model: service.model.id,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() });
        parent.refreshContext();
        const token = JSON.parse(message.match(/with token ("[^"]+")/)[1]);
        await registeredTools.get("mini_agents").execute("bootstrap", { action: "start", token }, undefined, undefined,
          parent.extensionRunner.createToolContext("bootstrap", undefined));
      })().catch((error) => notifications.push({ message: String(error), level: "error" }));
    },
    on: (name, handler) => events.set(name, handler), registerCommand: (name, command) => commands.set(name, command),
    sendMessage: (message, options) => { (message.customType === "mini-agents-question" ? questions : reports).push(message); assert.equal(options.triggerTurn, false); },
  });
  const context = {
    mode: "tui", model: service.model, cwd: fixture(), modelRegistry: new core.ModelRegistry(service.runtime),
    sessionManager: core.SessionManager.inMemory("/tmp"),
    getSystemPromptOptions: () => ({ cwd: context.cwd, skills: [] }),
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      confirm: async () => true,
      setStatus: () => {},
      select: async (title, options) => { selections.push({ title, options }); return "All"; },
      setWidget: (_key, factory) => {
        widgets.push(factory);
        if (!factory) return;
        const component = factory({}, { fg: (_color, text) => text });
        if (_key === "mini-agents-peek") peeks.push(component.render(80));
        assert.equal(component.handleInput, undefined, "Progress must not capture keyboard input");
        for (const width of [8, 40, 100]) {
          for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
        }
      },
      custom: async (factory, options) => {
        if (options?.overlay) {
          let closed = false;
          const component = factory({ requestRender: () => {}, terminal: { rows: 20 } }, { fg: (_color, text) => text }, {}, () => { closed = true; });
          peeks.push(component.render(80));
          component.handleInput("\x1b");
          component.dispose();
          assert.ok(closed, "Esc must close the peek view");
          return;
        }
        menuCount++;
        let component;
        const tui = { requestRender: () => component.render(100) };
        return new Promise((resolve) => {
          component = factory(tui, { fg: (_color, text) => text }, {}, resolve);
          component.focused = true;
          component.handleInput("fixture");
          component.handleInput("\r");
        });
      },
    },
  };
  return { commands, events, context, reports, questions, notifications, widgets, selections, peeks, agentDir,
    registeredTools, startupMessages, parentCalls,
    set blocked(value) { blocked = value; },
    get parent() { return parent; },
    setPermissionMode: (mode) => permissionCommand.handler(mode, context),
    get menuCount() { return menuCount; },
    async close() {
      await events.get("session_shutdown")();
      await bootstrap;
      parent?.dispose();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      await service.close();
    } };
}


test("launch workspace identifies a branch, detached HEAD, unborn branch and non-Git directory", async () => {
  const cwd = fixture();
  execFileSync("git", ["init", "-b", "launch-test"], { cwd });
  assert.match(await extension.workspaceContext(cwd), /launch-test \(no commit yet\)/);
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "fixture"], { cwd });
  const info = await extension.workspaceContext(cwd);
  assert.ok(info.includes(`Launch directory: ${cwd}`));
  assert.match(info, /Launch Git branch: launch-test/);
  assert.match(info, /Launch commit: [a-f0-9]{40}/);
  execFileSync("git", ["checkout", "--detach"], { cwd, stdio: "ignore" });
  assert.match(await extension.workspaceContext(cwd), /detached HEAD/);
  assert.match(await extension.workspaceContext(fixture()), /unavailable/);
});

test("progress text removes control sequences and flattens newlines", () => {
  const input = "\x1b[31mread\x1b[0m\n file\x1b]0;bad title\x07\tname\x00";

  const result = extension.progressText(input);

  assert.equal(result, "read file name");
});

test("elapsed time is compact", () => {
  assert.equal(extension.elapsed(-5), "0s");
  assert.equal(extension.elapsed(59_999), "59s");
  assert.equal(extension.elapsed(192_000), "3m 12s");
});

const items = (ids) => ids.map((id) => ({ value: id, label: id }));

test("model menu searches model IDs and providers case-insensitively", () => {
  const selected = [];
  const ids = ["anthropic/claude-sonnet", "openai/custom-review", "local/llama"];
  const menu = extension.createSearchMenu("Models", items(ids), { fg: (_color, text) => text },
    (id) => selected.push(id), () => {});
  menu.focused = true;

  menu.handleInput("SONNET");
  const lines = menu.render(100).join("\n");
  menu.handleInput("\r");

  assert.equal(menu.focused, true);
  assert.match(lines, /anthropic\/claude-sonnet/);
  assert.doesNotMatch(lines, /openai\/custom-review/);
  assert.deepEqual(selected, ["anthropic/claude-sonnet"]);
});

test("model menu supports navigation, backspace, no matches, and cancellation", async () => {
  const { visibleWidth } = await import(pathToFileURL(join(host, "node_modules/@earendil-works/pi-tui/dist/index.js")));
  const selected = [];
  const menu = extension.createSearchMenu("Models", items(["custom/alpha", "custom/beta"]),
    { fg: (_color, text) => text }, (id) => selected.push(id), () => {});

  menu.handleInput("zzzz");
  menu.handleInput("\r");
  assert.deepEqual(selected, []);
  for (let index = 0; index < 4; index++) menu.handleInput("\x7f");
  menu.handleInput("\x1b[B");
  menu.handleInput("\r");
  menu.handleInput("\x1b");

  assert.deepEqual(selected, ["custom/beta", undefined]);
  assert.ok(menu.render(12).every((line) => visibleWidth(line) <= 12));
});

test("job logs are bounded and include text still being written", () => {
  const job = extension.makeJob("reader", "Read");
  for (let index = 0; index < 510; index++) extension.addLog(job, `entry ${index}`);
  job.draft = "partial\nanswer";

  const lines = extension.jobLog(job);

  assert.equal(job.log.length, 500);
  assert.equal(job.log[0], "entry 10");
  assert.deepEqual(lines.slice(-2), ["│ partial", "│ answer"]);
});

test("tool arguments are summarized on one bounded line", () => {
  assert.equal(extension.describeArgs({ path: "src/a.py", offset: 40 }), "path=src/a.py offset=40");
  assert.equal(extension.describeArgs({ query: "line one\nline\x1b[31m two" }), "query=line one line two");
  assert.equal(extension.describeArgs(undefined), "");
  assert.ok(extension.describeArgs({ text: "x".repeat(500) }).length <= 200);
});

test("peek view follows the tail, scrolls back, resumes following, and closes", () => {
  const job = extension.makeJob("reader", "Read");
  for (let index = 0; index < 40; index++) extension.addLog(job, `line ${index}`);
  let renders = 0;
  let closed = false;
  const view = extension.createPeekView(() => "title", job,
    { requestRender: () => { renders++; }, terminal: { rows: 15 } }, { fg: (_color, text) => text }, () => { closed = true; });
  try {
    const following = view.render(40);
    view.handleInput("\x1b[5~");
    const scrolled = view.render(40);
    view.handleInput("\x1b[F");
    extension.addLog(job, "newest");
    const resumed = view.render(40);
    view.handleInput("q");

    assert.equal(following[0], "title");
    assert.match(following.at(-2), /line 39/);
    assert.doesNotMatch(scrolled.join("\n"), /line 39/);
    assert.match(scrolled.at(-1), /↑\d+/);
    assert.match(resumed.at(-2), /newest/);
    assert.ok(renders >= 2);
    assert.ok(closed);
    assert.ok(following.length <= 15);
  } finally { view.dispose(); }
});

test("peek view wraps long lines within the width and shows a placeholder before activity", () => {
  const job = extension.makeJob("reader", "Read");
  const view = extension.createPeekView(() => "t", job, { requestRender: () => {} }, { fg: (_color, text) => text }, () => {});
  try {
    assert.match(view.render(30).join("\n"), /Waiting for activity/);
    extension.addLog(job, "word ".repeat(40));
    const lines = view.render(30);
    assert.ok(lines.length > 3);
    assert.ok(lines.every((line) => visibleWidth(line) <= 30));
  } finally { view.dispose(); }
});

test("conversation context keeps user, assistant, and agent results, but drops tool output", () => {
  const messages = [
    { role: "user", content: "Fix the catalog lock", timestamp: 1 },
    { role: "assistant", content: [{ type: "thinking", thinking: "secret" }, { type: "text", text: "I will read the file." },
      { type: "toolCall", id: "1", name: "read", arguments: {} }], timestamp: 2 },
    { role: "toolResult", toolCallId: "1", toolName: "read", content: [{ type: "text", text: "HUGE FILE" }], isError: false, timestamp: 3 },
    { role: "custom", customType: "mini-agents-results", content: "## Review #1 findings", display: true, timestamp: 4 },
    { role: "compactionSummary", summary: "Earlier we discussed locks.", tokensBefore: 1, timestamp: 0 },
    { role: "user", content: [{ type: "text", text: "   " }], timestamp: 5 },
  ];

  const text = extension.conversationText(messages);

  assert.match(text, /\[user\]\nFix the catalog lock/);
  assert.match(text, /\[assistant\]\nI will read the file\.\n\[called read\]/);
  assert.match(text, /## Review #1 findings/);
  assert.match(text, /Earlier we discussed locks/);
  assert.doesNotMatch(text, /HUGE FILE|secret/);
  assert.equal(extension.conversationText([]), "");
});

test("long conversations keep the most recent part", () => {
  const messages = Array.from({ length: 50 }, (_, index) => ({ role: "user", content: `message ${index} ${"x".repeat(100)}`, timestamp: index }));

  const text = extension.conversationText(messages, 500);

  assert.match(text, /^\[earlier conversation omitted\]/);
  assert.match(text, /message 49/);
  assert.doesNotMatch(text, /message 0 /);
  assert.ok(text.length <= 500 + 40);
});

test("Git inspection includes staged, unstaged, and untracked status without edits", async () => {
  const cwd = fixture();
  execFileSync("git", ["init", "-q", cwd]);
  writeFileSync(join(cwd, "tracked.txt"), "staged\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd });
  writeFileSync(join(cwd, "tracked.txt"), "unstaged\n");
  writeFileSync(join(cwd, "untracked.txt"), "untracked\n");

  const result = await extension.gitChanges(cwd);

  assert.match(result, /staged/);
  assert.match(result, /unstaged/);
  assert.match(result, /\?\? untracked.txt/);
  assert.equal(readFileSync(join(cwd, "tracked.txt"), "utf8"), "unstaged\n");
});

test("Git inspection fails explicitly outside a repository", async () => {
  await assert.rejects(extension.gitChanges(fixture()));
});

const command = (h, args) => h.commands.get("mini-agents").handler(args, h.context);
async function manage(h, params, ctx = h.context) {
  const result = await h.registeredTools.get("mini_agents").execute("manage", params, undefined, undefined, ctx);
  return JSON.parse(result.content[0].text);
}

test("one generic command and a model-only management tool load through Pi", async () => {
  const loader = new core.DefaultResourceLoader({
    cwd: fixture(), agentDir: core.getAgentDir(), settingsManager: core.SettingsManager.inMemory({}),
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
    additionalExtensionPaths: [new URL("../index.ts", import.meta.url).pathname],
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual([...loaded.extensions[0].commands.keys()], ["mini-agents"]);
  assert.equal(loaded.extensions[0].tools.get("mini_agents").definition.exposure, "model-only");
});

test("agent-created children appear in shared UI, retain status and accept follow-ups", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    const run = await manage(h, { action: "start", name: "coverage", purpose: "Inspect parser tests" });
    assert.equal(run.id, 1);
    assert.equal(run.options.readOnly, true);
    assert.ok(h.widgets.some(Boolean));
    await waitFor(() => h.reports.length === 1);
    const names = service.requests[0].tools.map((tool) => tool.function.name);
    for (const name of ["read", "git_changes", "github_data", "ask_user"]) assert.ok(names.includes(name), name);
    for (const name of ["write", "edit", "bash", "mini_agents"]) assert.ok(!names.includes(name), name);
    assert.match(JSON.stringify(service.requests[0]), /coverage.*Purpose: Inspect parser tests/s);
    assert.match(JSON.stringify(service.requests[0]), new RegExp(`Launch directory: ${h.context.cwd}`));
    await command(h, "peek 1");
    assert.match(h.peeks.at(-1).join("\n"), /coverage/);
    const status = await manage(h, { action: "status", id: 1 });
    assert.equal(status.state, "done");
    assert.match(status.output, /No actionable findings/);
    assert.ok(existsSync(status.reportPath));
    await manage(h, { action: "message", id: 1, message: "Now focus on sad paths" });
    await waitFor(() => h.reports.length === 2);
    const history = JSON.stringify(service.requests.at(-1).messages);
    assert.match(history, /Inspect parser tests/);
    assert.match(history, /Now focus on sad paths/);
    assert.equal((await manage(h, { action: "list" })).length, 1);
    await command(h, "peek close");
    await command(h, "stop 1");
    await assert.rejects(manage(h, { action: "message", id: 1, message: "Restart" }), /closed/);
  } finally { await h.close(); }
});

test("manual and model-created agents share IDs and user controls", async () => {
  const service = await modelServer("hang");
  const h = commandHarness(service);
  try {
    await command(h, "first: inspect fixtures");
    await manage(h, { action: "start", name: "second", purpose: "Check other evidence" });
    await waitFor(() => service.requests.length === 2);
    assert.deepEqual((await manage(h, { action: "list" })).map((run) => run.name), ["first", "second"]);
    await command(h, "peek 2");
    assert.match(h.peeks.at(-1)[0], /#2 second/);
    await command(h, "stop 2");
    await waitFor(() => h.reports.length === 1);
    assert.equal((await manage(h, { action: "status", id: 1 })).state, "running");
    await manage(h, { action: "stop", id: 1 });
    await waitFor(() => h.reports.length === 2);
  } finally { await h.close(); }
});

test("questions notify parent and user, then resume through either control path", async () => {
  for (const reply of ["tool", "command"]) {
    const service = await modelServer("question");
    const h = commandHarness(service);
    try {
      await manage(h, { action: "start", name: "clarify", purpose: "Ask a question" });
      await waitFor(() => h.questions.length === 1);
      const status = await manage(h, { action: "status", id: 1 });
      assert.match(status.question, /Which file/);
      await command(h, "peek 1");
      assert.match(h.peeks.at(-1).join("\n"), /Question: Which file/);
      assert.equal(h.menuCount, 0);
      if (reply === "tool") await manage(h, { action: "message", id: 1, message: "src/main.ts" });
      else await command(h, "reply 1 src/main.ts");
      await waitFor(() => h.reports.length === 1);
      assert.match(JSON.stringify(service.requests.at(-1).messages), /src\/main.ts/);
      assert.equal((await manage(h, { action: "status", id: 1 })).question, undefined);
    } finally { await h.close(); }
  }
});

test("messages during startup queue without replacing the initial purpose", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    await manage(h, { action: "start", name: "queue", purpose: "Original task" });
    await manage(h, { action: "message", id: 1, message: "Additional detail" });
    await waitFor(() => h.reports.length === 1);
    assert.equal(service.requests.length, 2);
    assert.match(JSON.stringify(service.requests[0].messages), /Original task/);
    assert.match(JSON.stringify(service.requests[1].messages), /Additional detail/);
  } finally { await h.close(); }
});

test("writable manual startup proxies checked tools, inherits instructions and excludes delegation", async () => {
  const service = await modelServer("write");
  const h = commandHarness(service);
  try {
    await command(h, "--write builder: Write implemented.txt");
    await waitFor(() => h.reports.length === 1);
    assert.equal(readFileSync(join(h.context.cwd, "implemented.txt"), "utf8"), "implemented\n");
    assert.ok(h.parentCalls.includes("write"));
    assert.match(JSON.stringify(service.requests[0]), /Parent effective instructions/);
    assert.ok(!service.requests[0].tools.some((tool) => tool.function.name === "mini_agents"));
    assert.equal(h.startupMessages.length, 1);
    assert.equal(h.menuCount, 0);
  } finally { await h.close(); }
});

test("model directly starts writable children with the same checked parent executor", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    await command(h, "--write bootstrap: Prepare parent executor");
    await waitFor(() => h.reports.length === 1);
    const parentContext = h.parent.extensionRunner.createToolContext("direct", undefined);
    const run = await manage(h, { action: "start", name: "direct", purpose: "Read through parent", readOnly: false, tools: ["read", "fixture_mcp"] }, parentContext);
    await waitFor(() => h.reports.length === 2);
    assert.equal(run.id, 2);
    const names = service.requests.at(-1).tools.map((tool) => tool.function.name);
    assert.ok(names.includes("fixture_mcp"));
    assert.ok(!names.includes("write"));
    assert.equal(h.startupMessages.length, 1, "Direct model startup needs no token round trip");
  } finally { await h.close(); }
});

test("live parent permission changes apply after a child question", async () => {
  const service = await modelServer("question-write");
  const h = commandHarness(service);
  try {
    await command(h, "--write builder: Ask then write");
    await waitFor(() => h.questions.length === 1);
    await h.setPermissionMode("plan");
    await command(h, "reply 1 proceed");
    await waitFor(() => h.reports.length === 1);
    assert.equal(existsSync(join(h.context.cwd, "implemented.txt")), false);
    assert.match(JSON.stringify(service.requests.at(-1).messages), /Plan mode: only .md files allowed/);
  } finally { await h.close(); }
});

test("custom tool result hooks remain live", async () => {
  const service = await modelServer("external");
  const h = commandHarness(service);
  try {
    await command(h, "--write reader: Call fixture_mcp");
    await waitFor(() => h.reports.length === 1);
    assert.ok(h.parentCalls.includes("fixture_mcp"));
    assert.match(JSON.stringify(service.requests[1]), /filtered by parent hook/);
    assert.doesNotMatch(JSON.stringify(service.requests[1]), /external result/);
  } finally { await h.close(); }
});

test("queued writers are visible, mutually exclusive, cancellable and tokens expire on stop", async () => {
  const service = await modelServer();
  const h = commandHarness(service, { manualStartup: true });
  try {
    await command(h, "--write writer: Update a file");
    assert.equal((await manage(h, { action: "list" }))[0].state, "starting");
    await command(h, "--write another: Update another file");
    assert.match(h.notifications.at(-1).message, /already active/);
    const token = JSON.parse(h.startupMessages[0].match(/with token ("[^"]+")/)[1]);
    await command(h, "stop 1");
    await waitFor(() => h.reports.length === 1);
    await assert.rejects(manage(h, { action: "start", token }), /No authorized/);
    assert.equal(service.requests.length, 0);
  } finally { await h.close(); }
});

test("shutdown invalidates queued startup and posts no results into another session", async () => {
  const service = await modelServer();
  const h = commandHarness(service, { manualStartup: true });
  try {
    await command(h, "--write writer: Wait for startup");
    const token = JSON.parse(h.startupMessages[0].match(/with token ("[^"]+")/)[1]);
    await h.events.get("session_shutdown")();
    assert.equal(h.reports.length, 0);
    await assert.rejects(manage(h, { action: "start", token }), /closed/);
  } finally { await h.close(); }
});

test("declined write confirmation or disabled tool starts no child", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    h.context.ui.confirm = async () => false;
    await command(h, "--write writer: Update");
    assert.equal(h.startupMessages.length, 0);
    h.registeredTools.delete("mini_agents");
    await command(h, "--write writer: Update");
    assert.match(h.notifications.at(-1).message, /Enable mini_agents/);
    assert.equal(service.requests.length, 0);
  } finally { await h.close(); }
});

test("invalid management requests fail without starting children", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    await assert.rejects(manage(h, { action: "start", name: "missing" }), /name and purpose/);
    await assert.rejects(manage(h, { action: "status", id: 99 }), /Unknown/);
    await assert.rejects(manage(h, { action: "start", name: "bad", purpose: "Read", model: "missing/model" }), /unavailable/);
    await assert.rejects(manage(h, { action: "start", name: "bad", purpose: "Read", tools: ["write"] }), /requires readOnly/);
    await assert.rejects(manage(h, { action: "start", token: "invented" }), /No authorized/);
    assert.equal(service.requests.length, 0);
  } finally { await h.close(); }
});

test("writable jobs fail closed for missing or wrong-directory executors", async () => {
  const service = await modelServer();
  try {
    for (const parent of [undefined, { cwd: "/elsewhere" }]) {
      const job = extension.makeJob("writer", "Write");
      await extension.runJob(job, { readOnly: false }, "Write", fixture(), service.model, service.runtime,
        new AbortController().signal, () => {}, { parent });
      assert.equal(job.state, "failed");
      assert.match(job.activity, /checked tool executor|not in the launch directory/);
    }
    assert.equal(service.requests.length, 0);
  } finally { await service.close(); }
});

test("model errors and truncated responses preserve failed state and partial output", async () => {
  for (const mode of ["error", "length"]) {
    const service = await modelServer(mode);
    const h = commandHarness(service);
    try {
      await manage(h, { action: "start", name: mode, purpose: "Inspect" });
      await waitFor(() => h.reports.length === 1);
      const status = await manage(h, { action: "status", id: 1 });
      assert.equal(status.state, "failed");
      if (mode === "length") assert.match(status.output, /No actionable findings/);
    } finally { await h.close(); }
  }
});

test("run timeout includes time waiting for a user reply", async () => {
  process.env.MINI_AGENTS_RUN_LIMIT_MS = "150";
  const h = commandHarness(await modelServer("question"));
  try {
    await manage(h, { action: "start", name: "wait", purpose: "Ask" });
    await waitFor(() => h.reports.length === 1);
    assert.match(h.reports[0].content, /cancelled.*Run limit reached/s);
    assert.equal((await manage(h, { action: "status", id: 1 })).question, undefined);
  } finally { delete process.env.MINI_AGENTS_RUN_LIMIT_MS; await h.close(); }
});

test("generic model setting preserves old defaults and validates malformed files", () => {
  const path = join(fixture(), "defaults.json");
  writeFileSync(path, JSON.stringify({ reviewers: "old/model" }));
  extension.saveDefault(path, "custom/team/model");
  assert.deepEqual(extension.readDefaults(path), { model: "custom/team/model" });
  assert.equal(JSON.parse(readFileSync(path, "utf8")).reviewers, "old/model");
  for (const invalid of ["{", "[]", "null", '{"model":42}', '{"model":"missing-provider"}']) {
    writeFileSync(path, invalid);
    assert.throws(() => extension.saveDefault(path, "provider/model"));
    assert.equal(readFileSync(path, "utf8"), invalid);
  }
});

test("context is opt-in and includes the parent conversation", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    h.context.sessionManager.appendMessage({ role: "user", content: "Earlier parser decision", timestamp: Date.now() });
    await command(h, "--context reader: Inspect parser");
    await waitFor(() => h.reports.length === 1);
    assert.match(JSON.stringify(service.requests[0].messages), /Earlier parser decision/);
    assert.match(h.reports[0].content, /with conversation context/);
  } finally { await h.close(); }
});

test("optional web tools load for generic read-only and writable agents", async (t) => {
  if (!existsSync(join(core.getAgentDir(), "npm/node_modules/pi-web-access/dist/index.js"))) {
    t.skip("pi-web-access is not installed");
    return;
  }
  for (const flag of ["", "--write "]) {
    const service = await modelServer("web");
    const h = commandHarness(service);
    try {
      await command(h, `${flag}--web sources: Compare fixture scopes`);
      await waitFor(() => h.reports.length === 1);
      const names = service.requests.at(-1).tools.map((tool) => tool.function.name);
      for (const name of ["web_search", "fetch_content", "get_search_content"]) assert.ok(names.includes(name), names.join(","));
      assert.equal((await manage(h, { action: "status", id: 1 })).state, "done");
    } finally { await h.close(); }
  }
});

test("completed agents support full log inspection and one saved model default", async () => {
  const service = await modelServer();
  const h = commandHarness(service);
  try {
    await command(h, "model");
    assert.deepEqual(extension.readDefaults(join(h.agentDir, "mini-agents-models.json")), { model: "mini-fixture/fixture" });
    await command(h, "reader: Inspect");
    await waitFor(() => h.reports.length === 1);
    await command(h, "peek log 1");
    assert.match(h.peeks.at(-1).join("\n"), /No actionable findings/);
    assert.equal(h.menuCount, 1);
  } finally { await h.close(); }
});

test("a queued follow-up does not hide a failed initial response", async () => {
  const service = await modelServer("length");
  const h = commandHarness(service);
  try {
    await manage(h, { action: "start", name: "reader", purpose: "Inspect" });
    await manage(h, { action: "message", id: 1, message: "More details" });
    await waitFor(() => h.reports.length === 1);
    assert.equal(service.requests.length, 1);
    assert.equal((await manage(h, { action: "status", id: 1 })).state, "failed");
  } finally { await h.close(); }
});

test("a writer waiting for an answer holds its slot but read-only work can proceed", async () => {
  const service = await modelServer("question");
  const h = commandHarness(service);
  try {
    await command(h, "--write writer: Ask first");
    await waitFor(() => h.questions.length === 1);
    const parentContext = h.parent.extensionRunner.createToolContext("second", undefined);
    await assert.rejects(manage(h, { action: "start", name: "second", purpose: "Write", readOnly: false }, parentContext), /already active/);
    await manage(h, { action: "start", name: "reader", purpose: "Read" });
    await waitFor(() => h.reports.length === 1);
    await command(h, "stop 1");
    await waitFor(() => h.reports.length === 2);
    assert.equal((await manage(h, { action: "status", id: 1 })).state, "cancelled");
  } finally { await h.close(); }
});

test("question answers clear the pending slot before another message arrives", async () => {
  const job = extension.makeJob("clarify", "Ask");
  const controller = new AbortController();
  const answer = extension.waitForAnswer(job, "Which file?", controller.signal, undefined, () => {});
  const pending = job.question;
  await assert.rejects(extension.waitForAnswer(job, "Duplicate?", controller.signal, undefined, () => {}), /already waiting/);
  pending.answer("src/main.ts");
  assert.equal(job.question, undefined);
  assert.equal(await answer, "src/main.ts");
  const cancelled = extension.waitForAnswer(job, "Continue?", controller.signal, undefined, () => {});
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(job.question, undefined);
});
