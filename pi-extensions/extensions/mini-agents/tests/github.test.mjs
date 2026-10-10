import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { parsePrMetadata, prTarget, readGithubPr, readPrFile } from "../github.ts";

const directory = mkdtempSync(join(tmpdir(), "mini-agents-github-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const url = "https://github.com/owner/project/pull/368";
const base = "a".repeat(40);
const head = "b".repeat(40);
const metadata = JSON.stringify(["PR title", "PR body", base, head, "owner/project", "fork/project", 1]);
const diff = "diff --git a/file.py b/file.py\n--- a/file.py\n+++ b/file.py\n@@ -1 +1 @@\n-old\n+new\n";
const snapshot = { ...parsePrMetadata(metadata), url, diffPath: "/tmp/pr.diff" };

test("PR target resolves links in prose without mistaking them for working-tree reviews", () => {
  assert.deepEqual(prTarget(`Review ${url}/files please`), { url, endpoint: "repos/owner/project/pulls/368" });
  assert.equal(prTarget("Review current uncommitted changes"), undefined);
  assert.throws(() => prTarget(`${url} and https://github.com/owner/project/pull/369`), /one PR/);
  assert.throws(() => prTarget("https://github.com/owner/project/pull/not-a-number"), /valid/);
  assert.throws(() => prTarget("https://github.com/owner/project/pull/368malformed"), /valid/);
  assert.equal(prTarget("Review the current PR"), undefined);
});

test("current PR and PR numbers resolve through gh in the project directory", async () => {
  for (const [task, expected] of [["skipper review the current PR", []], ["deep review PR #368", ["368"]]]) {
    const calls = [];
    const read = async (args, _signal, cwd) => {
      calls.push({ args, cwd });
      if (args[0] === "pr" && args[1] === "view") return `${url}\n`;
      return args[0] === "api" ? metadata : diff;
    };

    const result = await readGithubPr(task, directory, "/project", undefined, read);

    assert.equal(result.url, url);
    assert.deepEqual(calls[0].args, ["pr", "view", ...expected, "--json", "url", "--jq", ".url"]);
    assert.equal(calls[0].cwd, "/project");
  }
});

test("unresolvable current PR fails instead of reviewing the working tree", async () => {
  await assert.rejects(readGithubPr("review this PR", directory, "/project", undefined, async () => "\n"),
    /Could not resolve/);
});

test("PR metadata rejects missing repos, invalid commit IDs, and file counts", () => {
  for (const value of [null, [], ["title", "body", "bad", head, "owner/project", "fork/project", 1],
    ["title", "body", base, head, "owner/project", null, 1],
    ["title", "body", base, head, "owner/project", "fork/project", -1]]) {
    assert.throws(() => parsePrMetadata(JSON.stringify(value)));
  }
});

test("PR download saves the committed diff and checks the revision twice", async () => {
  const commands = [];
  const read = async (args) => { commands.push(args); return args[0] === "api" ? metadata : diff; };

  const result = await readGithubPr(`Review ${url}`, directory, undefined, undefined, read);

  assert.equal(result.headSha, head);
  assert.equal(readFileSync(result.diffPath, "utf8"), diff);
  assert.equal(commands.length, 3);
  assert.ok(commands[0].includes("GET"));
  assert.deepEqual(commands[1], ["pr", "diff", url, "--color", "never"]);
  assert.deepEqual(commands[0], commands[2]);
});

test("PR download rejects an updated revision rather than reviewing mixed commits", async () => {
  let calls = 0;
  const read = async () => [metadata, diff, metadata.replace(head, "c".repeat(40))][calls++];

  await assert.rejects(readGithubPr(url, directory, undefined, undefined, read), /PR changed/);
});

test("PR download rejects incomplete diffs and propagates authentication failures", async () => {
  await assert.rejects(readGithubPr(url, directory, undefined, undefined,
    async (args) => args[0] === "api" ? metadata : ""), /Incomplete PR diff/);
  await assert.rejects(readGithubPr(url, directory, undefined, undefined,
    async () => { throw new Error("gh is not authenticated"); }), /authenticated/);
});

test("local review scopes do not call GitHub", async () => {
  let calls = 0;

  const result = await readGithubPr("Review local changes", directory, undefined, undefined,
    async () => { calls++; throw new Error("Unexpected GitHub call"); });

  assert.equal(result, undefined);
  assert.equal(calls, 0);
});

test("PR source reads pin the fork's head SHA and escape paths with query characters", async () => {
  const commands = [];
  const read = async (args) => { commands.push(args); return "first\nsecond\nthird"; };

  const result = await readPrFile(snapshot, "src/file ?#.py", "head", 2, 1, undefined, read);

  assert.match(result, /2: second/);
  assert.doesNotMatch(result, /3: third/);
  assert.ok(commands[0].includes(`repos/fork/project/contents/src/file%20%3F%23.py?ref=${head}`));
  assert.ok(commands[0].includes("GET"));
  assert.ok(!commands[0].includes("POST"));
});

test("base file reads use the base repository and commit", async () => {
  let endpoint;

  await readPrFile(snapshot, "file.py", "base", 1, 10, undefined, async (args) => {
    endpoint = args.find((arg) => arg.startsWith("repos/")); return "base source";
  });

  assert.equal(endpoint, `repos/owner/project/contents/file.py?ref=${base}`);
});

test("source reads reject traversal, binary data, oversized excerpts, and invalid ranges", async () => {
  for (const path of ["../secret", "/absolute", "src/../secret", "src\\secret", "file\0.py"]) {
    await assert.rejects(readPrFile(snapshot, path, "head", 1, 10, undefined,
      async () => { throw new Error("Should not call gh"); }), /repository-relative/);
  }
  await assert.rejects(readPrFile(snapshot, "file", "head", 0, 10), /offset/);
  await assert.rejects(readPrFile(snapshot, "file", "head", 1, 2001), /limit/);
  await assert.rejects(readPrFile(snapshot, "file", "head", 1, 10, undefined, async () => "binary\0"), /binary/);
  await assert.rejects(readPrFile(snapshot, "file", "head", 1, 10, undefined, async () => "a".repeat(60_000)), /fewer lines/);
});
