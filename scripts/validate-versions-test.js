"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { afterEach, test } = require("node:test");

const VALIDATOR = path.join(__dirname, "validate-versions.js");
const sandboxes = [];

function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function makeSandbox(marketplacePlugins) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-skills-validate-versions-test-"));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(VALIDATOR, path.join(root, "scripts", "validate-versions.js"));
  const plugin = { name: "agent-skills", version: "1.2.3" };
  writeJson(root, "plugin.json", plugin);
  writeJson(root, ".codex-plugin/plugin.json", plugin);
  writeJson(root, ".claude-plugin/plugin.json", plugin);
  writeJson(root, ".claude-plugin/marketplace.json", { plugins: marketplacePlugins });
  writeJson(root, ".agents/plugins/marketplace.json", { plugins: marketplacePlugins });
  sandboxes.push(root);
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "validate-versions.js")], {
    cwd: root,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test("passes when every manifest plugin uses the root version", () => {
  const root = makeSandbox([
    { name: "first", version: "1.2.3" },
    { name: "second", version: "1.2.3" },
  ]);

  const result = run(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("fails when a later marketplace plugin version drifts", () => {
  const root = makeSandbox([
    { name: "first", version: "1.2.3" },
    { name: "second", version: "9.9.9" },
  ]);

  const result = run(root);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /second.*9\.9\.9.*1\.2\.3/s);
});
