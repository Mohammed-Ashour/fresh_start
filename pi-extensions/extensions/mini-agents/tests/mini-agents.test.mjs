import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
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
const { build } = await import(pathToFileURL(join(host, "node_modules/esbuild/lib/main.js")));
const output = join(temporary, "extension.mjs");
await build({
  entryPoints: [new URL("../index.ts", import.meta.url).pathname], outfile: output,
  bundle: true, platform: "node", format: "esm",
  plugins: [{ name: "host-packages", setup(builder) {
    builder.onResolve({ filter: /^@earendil-works\// }, ({ path }) => ({
      path: path === "@earendil-works/pi-coding-agent" ? corePath :
        join(host, "node_modules", path, "dist/index.js"), external: true,
    }));
  } }],
});
const extension = await import(pathToFileURL(output));
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
    if (mode === "web" && requests.length === 1 && requests[0].tools.some((tool) => tool.function.name === "web_enable")) {
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

test("defaults persist independently, including custom model IDs containing slashes", () => {
  const path = join(fixture(), "defaults.json");
  assert.deepEqual(extension.readDefaults(path), {});

  extension.saveDefault(path, "reviewers", "custom/team/model");
  extension.saveDefault(path, "researchers", "another/research");

  assert.deepEqual(extension.readDefaults(path), { reviewers: "custom/team/model", researchers: "another/research" });
});

test("malformed defaults are reported rather than silently overwritten", () => {
  const path = join(fixture(), "defaults.json");
  for (const invalid of ["{", "[]", "null", '{"reviewers":42}', '{"researchers":"missing-provider"}']) {
    writeFileSync(path, invalid);

    assert.throws(() => extension.saveDefault(path, "reviewers", "provider/model"));
    assert.equal(readFileSync(path, "utf8"), invalid);
  }
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

test("job factories produce fresh state and only the requested roles", () => {
  const reviewers = extension.makeJobs("reviewers");
  reviewers[0].state = "failed";

  const fresh = extension.makeJobs("reviewers");
  const researchers = extension.makeJobs("researchers");

  assert.deepEqual(fresh.map((job) => job.name), ["reviewer"]);
  assert.equal(fresh[0].state, "starting");
  assert.equal(fresh[0].instructions, "", "Reviewers follow the user's skills, not a built-in structure");
  assert.deepEqual(researchers.map((job) => job.name), ["sources", "countercheck"]);
});

test("report preserves partial output, failures, and cancellations", () => {
  const jobs = extension.makeJobs("researchers");
  jobs[0] = { ...jobs[0], state: "failed", activity: "API failed", output: "Partial finding" };
  jobs[1] = { ...jobs[1], state: "cancelled", activity: "Cancelled by user" };

  const result = extension.formatReport("Research #2", "Inspect", jobs, ["report `x`"]);

  assert.match(result, /## Research #2/);
  assert.match(result, /### sources\n\*\*failed:\*\* API failed/);
  assert.match(result, /Partial finding/);
  assert.match(result, /### countercheck\n\*\*cancelled:\*\* Cancelled by user/);
  assert.match(result, /report `x`/);
});

test("single-job reports omit redundant job headings", () => {
  const jobs = extension.makeJobs("reviewers");
  jobs[0] = { ...jobs[0], state: "done", output: "Findings from skipper-review" };

  const result = extension.formatReport("Review #1", "Review the PR", jobs, []);

  assert.doesNotMatch(result, /###/);
  assert.doesNotMatch(result, /\*\*done/);
  assert.match(result, /Findings from skipper-review/);
});

test("job logs are bounded and include text still being written", () => {
  const job = extension.makeJobs("reviewers")[0];
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
  const job = extension.makeJobs("reviewers")[0];
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
  const job = extension.makeJobs("reviewers")[0];
  const view = extension.createPeekView(() => "t", job, { requestRender: () => {} }, { fg: (_color, text) => text }, () => {});
  try {
    assert.match(view.render(30).join("\n"), /Waiting for activity/);
    extension.addLog(job, "word ".repeat(40));
    const lines = view.render(30);
    assert.ok(lines.length > 3);
    assert.ok(lines.every((line) => visibleWidth(line) <= 30));
  } finally { view.dispose(); }
});

test("help lists every subcommand with usage, tips, the saved model, and active runs", () => {
  const review = extension.helpLines("reviewers", "openai/gpt", 2);
  const research = extension.helpLines("researchers", undefined, 0);

  for (const sub of ["model", "peek", "stop", "help", "--context <request>"]) {
    assert.ok(review.some((line) => line.includes(`/reviewers ${sub}`)), sub);
  }
  assert.match(review.join("\n"), /current PR/);
  assert.match(review.join("\n"), /skipper review/);
  assert.equal(review.at(-1), "Model: openai/gpt · Active: 2");
  assert.match(research.join("\n"), /\/researchers <request>/);
  assert.match(research.at(-1), /not set/);
  const rows = review.filter((line) => line.startsWith("  /"));
  const column = 4 + Math.max(...rows.map((line) => line.slice(2).split(/\s{2,}/)[0].length));
  assert.ok(rows.every((line) => line[column - 1] === " " && line[column] !== " "), "Descriptions line up");
});

test("help command opens an overlay without starting a run or asking for a model", async () => {
  const service = await modelServer();
  const harness = commandHarness(service);
  try {
    await harness.commands.get("reviewers").handler("help", harness.context);

    assert.equal(harness.menuCount, 0);
    assert.equal(service.requests.length, 0);
    assert.equal(harness.peeks.length, 1);
    assert.match(harness.peeks[0][0], /\/reviewers: background review/);
    assert.match(harness.peeks[0].join("\n"), /Esc, q, or Enter closes/);
  } finally { await harness.close(); }
});

test("--context is parsed anywhere as its own word", () => {
  assert.deepEqual(extension.parseRequest("--context skipper review the current PR"), { task: "skipper review the current PR", withContext: true });
  assert.deepEqual(extension.parseRequest("review  this --context "), { task: "review this", withContext: true });
  assert.deepEqual(extension.parseRequest("review --contextual-things"), { task: "review --contextual-things", withContext: false });
  assert.deepEqual(extension.parseRequest(""), { task: "", withContext: false });
});

test("autocomplete suggests subcommands and the context flag for the first word only", () => {
  const all = extension.completeArguments("reviewers", "");
  assert.deepEqual(all.map((item) => item.value), ["model", "peek", "stop", "help", "--context "]);
  assert.match(all[0].description, /review model/);
  assert.deepEqual(extension.completeArguments("researchers", "pe").map((item) => item.value), ["peek"]);
  assert.deepEqual(extension.completeArguments("reviewers", "--").map((item) => item.label), ["--context"]);
  assert.equal(extension.completeArguments("reviewers", "xyz"), null);
  assert.equal(extension.completeArguments("reviewers", "--context "), null);
  assert.equal(extension.completeArguments("reviewers", "skipper review"), null);
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

test("--context injects the current conversation; without it the child starts fresh", async () => {
  for (const flag of [true, false]) {
    const service = await modelServer();
    const harness = commandHarness(service);
    harness.context.sessionManager.appendMessage({ role: "user", content: "We decided to lock the parent item first", timestamp: 1 });
    try {
      await harness.commands.get("reviewers").handler(`${flag ? "--context " : ""}review the lock order`, harness.context);
      await waitFor(() => harness.reports.length === 1);

      const request = JSON.stringify(service.requests[0]);
      assert.equal(request.includes("We decided to lock the parent item first"), flag);
      assert.equal(request.includes("<parent_conversation>"), flag);
      assert.ok(request.includes("review the lock order"));
      assert.ok(!request.includes("--context"), "The flag itself must not reach the child");
      assert.equal(/with conversation context/.test(harness.reports[0].content), flag);
    } finally { await harness.close(); }
  }
});

test("--context with an empty conversation warns and still runs", async () => {
  const service = await modelServer();
  const harness = commandHarness(service);
  try {
    await harness.commands.get("researchers").handler("--context what is a backfill", harness.context);
    await waitFor(() => harness.reports.length === 1);

    assert.ok(harness.notifications.some(({ message, level }) => level === "warning" && /empty/.test(message)));
    assert.ok(!JSON.stringify(service.requests[0]).includes("<parent_conversation>"));
  } finally { await harness.close(); }
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

test("reviewer sessions return text and expose only read-only tools", async () => {
  const service = await modelServer();
  const jobs = extension.makeJobs("reviewers");
  let updates = 0;
  try {
    await Promise.all(jobs.map((job) => extension.runJob(job, "reviewers", "Review", fixture(),
      service.model, service.runtime, new AbortController().signal, () => { updates++; })));

    assert.ok(jobs.every((job) => job.state === "done"), JSON.stringify(jobs));
    assert.ok(jobs.every((job) => job.output === "No actionable findings."));
    assert.equal(service.requests.length, 1);
    assert.ok(updates > 1);
    const names = service.requests[0].tools.map((tool) => tool.function.name).sort();
    assert.deepEqual(names, ["find", "git_changes", "grep", "ls", "read"]);
    assert.match(JSON.stringify(service.requests[0]), /read every SKILL.md that fits the user's request/);
  } finally { await service.close(); }
});

test("researchers activate installed web tools without shell or editing tools", async () => {
  const service = await modelServer("web");
  const job = extension.makeJobs("researchers")[0];
  try {
    await extension.runJob(job, "researchers", "Research", fixture(), service.model,
      service.runtime, new AbortController().signal, () => {});

    assert.equal(job.state, "done", JSON.stringify(job));
    assert.ok(job.log.includes("│ No actionable findings."), job.log.join("\n"));
    if (service.requests[0].tools.some((tool) => tool.function.name === "web_enable")) {
      assert.ok(job.log.some((line) => line.startsWith("→ web_enable")), job.log.join("\n"));
    }
    const names = service.requests.at(-1).tools.map((tool) => tool.function.name);
    for (const name of ["web_search", "fetch_content", "get_search_content"]) {
      assert.ok(names.includes(name), names.join(","));
    }
    assert.ok(!names.some((name) => ["bash", "write", "edit", "subagent"].includes(name)));
  } finally { await service.close(); }
});

test("API failures and token-limit responses are not marked successful", async () => {
  for (const mode of ["error", "length"]) {
    const service = await modelServer(mode);
    const job = extension.makeJobs("reviewers")[0];
    try {
      await extension.runJob(job, "reviewers", "Review", fixture(), service.model,
        service.runtime, new AbortController().signal, () => {});

      assert.equal(job.state, "failed", JSON.stringify(job));
      assert.ok(job.activity.length > 0);
      if (mode === "length") assert.equal(job.output, "No actionable findings.");
    } finally { await service.close(); }
  }
});

test("cancelled startup makes no model request", async () => {
  const service = await modelServer();
  const controller = new AbortController();
  controller.abort("Cancelled by user");
  const job = extension.makeJobs("reviewers")[0];
  try {
    await extension.runJob(job, "reviewers", "Review", fixture(), service.model,
      service.runtime, controller.signal, () => {});

    assert.equal(job.state, "cancelled");
    assert.equal(service.requests.length, 0);
  } finally { await service.close(); }
});

test("cancellation stops a streaming request and finishes cleanup", async () => {
  const service = await modelServer("hang");
  const controller = new AbortController();
  const job = extension.makeJobs("reviewers")[0];
  const timer = setTimeout(() => controller.abort("Cancelled by user"), 1000);
  try {
    await extension.runJob(job, "reviewers", "Review", fixture(), service.model,
      service.runtime, controller.signal, () => {});

    assert.equal(job.state, "cancelled", JSON.stringify(job));
    assert.match(job.activity, /Cancelled by user/);
  } finally { clearTimeout(timer); await service.close(); }
});

test("extension registers only the two commands and shutdown cleanup", () => {
  const commands = [];
  const events = [];

  extension.default({ registerCommand: (name) => commands.push(name), on: (name) => events.push(name) });

  assert.deepEqual(commands, ["reviewers", "researchers"]);
  assert.deepEqual(events, ["session_shutdown"]);
});

test("Pi's real loader loads the installed TypeScript entrypoint", async () => {
  const loader = new core.DefaultResourceLoader({
    cwd: fixture(), agentDir: core.getAgentDir(), settingsManager: core.SettingsManager.inMemory({}),
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
    additionalExtensionPaths: [new URL("../index.ts", import.meta.url).pathname],
  });

  await loader.reload();

  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.deepEqual([...loaded.extensions[0].commands.keys()], ["reviewers", "researchers"]);
  const reviewers = loaded.extensions[0].commands.get("reviewers");
  assert.deepEqual((await reviewers.getArgumentCompletions("pe")).map((item) => item.value), ["peek"]);
});

/** Wait for observable background work, failing rather than hanging a test. */
async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Background work did not finish within five seconds");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Capture command and widget behavior without taking ownership of a terminal. */
function commandHarness(service) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  const realAgentDir = core.getAgentDir();
  const agentDir = fixture();
  symlinkSync(join(realAgentDir, "npm"), join(agentDir, "npm"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const commands = new Map();
  const events = new Map();
  const reports = [];
  const notifications = [];
  const widgets = [];
  const selections = [];
  const peeks = [];
  let menuCount = 0;
  extension.default({
    on: (name, handler) => events.set(name, handler), registerCommand: (name, command) => commands.set(name, command),
    sendMessage: (message, options) => { reports.push(message); assert.equal(options.triggerTurn, false); },
  });
  const context = {
    mode: "tui", cwd: fixture(), modelRegistry: new core.ModelRegistry(service.runtime),
    sessionManager: core.SessionManager.inMemory("/tmp"),
    getSystemPromptOptions: () => ({ cwd: context.cwd, skills: [] }),
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      select: async (title, options) => { selections.push({ title, options }); return "All"; },
      setWidget: (_key, factory) => {
        widgets.push(factory);
        if (!factory) return;
        const component = factory({}, { fg: (_color, text) => text });
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
  return { commands, events, context, reports, notifications, widgets, selections, peeks, agentDir,
    get menuCount() { return menuCount; },
    async close() {
      await events.get("session_shutdown")();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      await service.close();
    } };
}

test("command saves a custom default, returns immediately, and publishes background results", async () => {
  const harness = commandHarness(await modelServer());
  try {
    await harness.commands.get("reviewers").handler("Inspect fixtures", harness.context);
    assert.equal(harness.reports.length, 0);

    await waitFor(() => harness.reports.length === 1);

    assert.equal(harness.menuCount, 1, "Only model selection should open a modal");
    assert.ok(harness.widgets.length > 1);
    assert.match(harness.reports[0].content, /## Review #1 · reviewer · mini-fixture\/fixture/);
    assert.match(harness.reports[0].content, /No actionable findings\./);
    assert.ok(existsSync(harness.reports[0].details.reportPath));
    assert.equal(extension.readDefaults(join(harness.agentDir, "mini-agents-models.json")).reviewers, "mini-fixture/fixture");
    assert.ok(!harness.notifications.some(({ level }) => level === "error"));
  } finally { await harness.close(); }
});

test("reviews and research run concurrently and stop independently", async () => {
  const service = await modelServer("hang");
  const harness = commandHarness(service);
  try {
    await harness.commands.get("reviewers").handler("Review", harness.context);
    await harness.commands.get("researchers").handler("Research something", harness.context);
    await waitFor(() => service.requests.length === 3);
    assert.ok(!harness.notifications.some(({ level }) => level === "warning" || level === "error"));

    await harness.commands.get("researchers").handler("stop", harness.context);
    await waitFor(() => harness.reports.length === 1);

    assert.match(harness.reports[0].content, /## Research #2/);
    assert.match(harness.reports[0].content, /\*\*cancelled:\*\* Cancelled by user/);
    assert.notEqual(harness.widgets.at(-1), undefined, "The review should still be visible");

    await harness.commands.get("reviewers").handler("stop", harness.context);
    await waitFor(() => harness.reports.length === 2);

    assert.match(harness.reports[1].content, /## Review #1/);
    assert.equal(harness.widgets.at(-1), undefined);
    assert.equal(harness.selections.length, 0, "A single active run stops without a picker");
  } finally { await harness.close(); }
});

test("several reviews can run at once and stop offers a picker", async () => {
  const service = await modelServer("hang");
  const harness = commandHarness(service);
  try {
    await harness.commands.get("reviewers").handler("Review one", harness.context);
    await harness.commands.get("reviewers").handler("Review two", harness.context);
    await waitFor(() => service.requests.length === 2);

    await harness.commands.get("reviewers").handler("stop", harness.context);
    await waitFor(() => harness.reports.length === 2);

    assert.deepEqual(harness.selections[0].options.slice(0, 1), ["All"]);
    assert.equal(harness.selections[0].options.length, 3);
    assert.ok(harness.reports.every((report) => /cancelled/.test(report.content)));
  } finally { await harness.close(); }
});

test("stop reports when nothing of that kind is running", async () => {
  const harness = commandHarness(await modelServer());
  try {
    await harness.commands.get("researchers").handler("stop", harness.context);
    await harness.commands.get("reviewers").handler("peek", harness.context);

    assert.match(harness.notifications[0].message, /No research is running/);
    assert.match(harness.notifications[1].message, /No review is running/);
    assert.equal(harness.menuCount, 0);
    assert.equal(harness.peeks.length, 0);
  } finally { await harness.close(); }
});

test("peek always asks which job, and closing it leaves the agent running", async () => {
  const service = await modelServer("hang");
  const harness = commandHarness(service);
  harness.context.ui.select = async (title, options) => { harness.selections.push({ title, options }); return options.at(-1); };
  try {
    await harness.commands.get("reviewers").handler("Review", harness.context);
    await waitFor(() => service.requests.length === 1);

    await harness.commands.get("reviewers").handler("peek", harness.context);

    assert.equal(harness.selections.length, 1, "Even a single job is chosen explicitly");
    assert.match(harness.selections[0].options[0], /^#1 reviewer/);
    assert.match(harness.peeks[0][0], /#1 review · reviewer · mini-fixture\/fixture/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(harness.reports.length, 0, "Closing the peek must not end the run");
    assert.notEqual(harness.widgets.at(-1), undefined, "The run should still be in progress");

    await harness.commands.get("researchers").handler("Research", harness.context);
    await waitFor(() => service.requests.length === 3);
    await harness.commands.get("researchers").handler("peek", harness.context);

    assert.deepEqual(harness.selections[1].options.map((option) => option.split(" · ")[0]), ["#2 sources", "#2 countercheck"]);
    assert.match(harness.peeks[1][0], /#2 research · countercheck/);
    assert.equal(harness.reports.length, 0);
  } finally { await harness.close(); }
});

test("cancelling the peek picker opens nothing and leaves the run alone", async () => {
  const service = await modelServer("hang");
  const harness = commandHarness(service);
  harness.context.ui.select = async () => undefined;
  try {
    await harness.commands.get("reviewers").handler("Review", harness.context);
    await waitFor(() => service.requests.length === 1);

    await harness.commands.get("reviewers").handler("peek", harness.context);

    assert.equal(harness.peeks.length, 0);
    assert.equal(harness.reports.length, 0);
  } finally { await harness.close(); }
});

test("finished runs save each job's log next to the report", async () => {
  const harness = commandHarness(await modelServer());
  try {
    await harness.commands.get("reviewers").handler("Review", harness.context);
    await waitFor(() => harness.reports.length === 1);

    const directory = dirname(harness.reports[0].details.reportPath);
    assert.match(readFileSync(join(directory, "reviewer.log"), "utf8"), /│ No actionable findings\./);
    assert.match(harness.reports[0].content, /logs `/);
  } finally { await harness.close(); }
});

test("shutdown cancels work, saves partial results, and never posts to a replacement session", async () => {
  const service = await modelServer("hang");
  const harness = commandHarness(service);
  try {
    await harness.commands.get("reviewers").handler("Review", harness.context);
    await waitFor(() => service.requests.length === 1);

    await harness.events.get("session_shutdown")();

    assert.equal(harness.reports.length, 0);
    assert.equal(harness.widgets.at(-1), undefined);
    const { readdirSync } = await import("node:fs");
    const root = join(harness.agentDir, "mini-agents-runs");
    const result = join(root, readdirSync(root)[0], "results.md");
    assert.match(readFileSync(result, "utf8"), /Session closed/);
  } finally { await harness.close(); }
});

test("both child workflows inherit the parent's exact enabled skill list", async () => {
  const skillDirectory = fixture();
  writeFileSync(join(skillDirectory, "SKILL.md"), "---\nname: parent-only-skill\ndescription: Review and research using a custom checklist.\n---\nRead the evidence before reporting.\n");
  const skills = core.loadSkillsFromDir({ dir: skillDirectory, source: "test" }).skills;
  assert.equal(skills.length, 1);
  for (const mode of ["reviewers", "researchers"]) {
    const service = await modelServer();
    const job = extension.makeJobs(mode)[0];
    try {
      await extension.runJob(job, mode, "Inspect using parent-only-skill", fixture(), service.model,
        service.runtime, new AbortController().signal, () => {}, { skills });

      assert.equal(job.state, "done", JSON.stringify(job));
      assert.match(JSON.stringify(service.requests[0]), /parent-only-skill/);
      assert.ok(service.requests[0].tools.some((tool) => tool.function.name === "read"));
    } finally { await service.close(); }
  }
});

test("PR reviewers receive the committed snapshot and pinned source tool, not working-tree diffs", async () => {
  const service = await modelServer();
  const job = extension.makeJobs("reviewers")[0];
  const diffPath = join(fixture(), "pr.diff");
  writeFileSync(diffPath, "diff --git a/file.py b/file.py\n");
  const pr = { url: "https://github.com/owner/repo/pull/368", title: "PR", body: "Description",
    headSha: "b".repeat(40), baseSha: "a".repeat(40), headRepo: "owner/repo", baseRepo: "owner/repo", diffPath };
  try {
    await extension.runJob(job, "reviewers", "Review the PR", fixture(), service.model,
      service.runtime, new AbortController().signal, () => {}, { pr });

    const names = service.requests[0].tools.map((tool) => tool.function.name);
    assert.ok(names.includes("pr_file"));
    assert.ok(!names.includes("git_changes"));
    assert.ok(!names.includes("bash"));
    assert.ok(JSON.stringify(service.requests[0]).includes(diffPath));
    assert.ok(JSON.stringify(service.requests[0]).includes(pr.headSha));
  } finally { await service.close(); }
});

test("background reviews see every parent skill and are told to pick the ones that fit", async () => {
  const service = await modelServer();
  const harness = commandHarness(service);
  const skillDirectory = fixture();
  writeFileSync(join(skillDirectory, "SKILL.md"), "---\nname: current-review-skill\ndescription: Review the change.\n---\nInspect the tests.\n");
  const skills = core.loadSkillsFromDir({ dir: skillDirectory, source: "test" }).skills;
  harness.context.getSystemPromptOptions = () => ({ cwd: harness.context.cwd, skills });
  try {
    await harness.commands.get("reviewers").handler("skipper review with skills", harness.context);
    await waitFor(() => harness.reports.length === 1);

    assert.equal(service.requests.length, 1);
    const request = JSON.stringify(service.requests[0]);
    assert.ok(request.includes("current-review-skill"));
    assert.ok(request.includes("skipper review with skills"));
    assert.ok(!request.includes("<skill name="), "No skill is force-loaded; the reviewer chooses");
  } finally { await harness.close(); }
});

test("PR preparation errors fail the review without issuing model requests", async () => {
  const service = await modelServer();
  const harness = commandHarness(service);
  try {
    await harness.commands.get("reviewers").handler("Review https://github.com/owner/repo/pull/invalid", harness.context);
    await waitFor(() => harness.reports.length === 1);

    assert.equal(service.requests.length, 0);
    assert.match(harness.reports[0].content, /\*\*failed:\*\*/);
    assert.match(harness.reports[0].content, /valid github.com PR URL/);
  } finally { await harness.close(); }
});
