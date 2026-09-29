#!/usr/bin/env node

"use strict";

const { readFileSync } = require("node:fs");

const manifestPaths = [
  "plugin.json",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".agents/plugins/marketplace.json",
];

function readManifestVersions(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (Array.isArray(manifest.plugins)) {
    if (manifest.plugins.length === 0) {
      return [{ label: `${manifestPath} plugins`, version: undefined }];
    }
    return manifest.plugins.map((plugin, index) => ({
      label: `${manifestPath} plugin ${plugin?.name ?? `#${index + 1}`}`,
      version: plugin?.version,
    }));
  }
  return [{ label: manifestPath, version: manifest.version }];
}

const expectedVersion = readManifestVersions("plugin.json")[0].version;
if (!expectedVersion) {
  throw new Error("plugin.json is missing a version field");
}

for (const manifestPath of manifestPaths) {
  for (const { label, version } of readManifestVersions(manifestPath)) {
    if (version !== expectedVersion) {
      throw new Error(
        `${label} has version ${version ?? "<missing>"}; expected ${expectedVersion}`,
      );
    }
  }
}

console.log(`All plugin manifests use version ${expectedVersion}.`);
