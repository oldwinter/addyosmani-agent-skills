#!/bin/bash
# session-start-test.sh - Tests for the SessionStart hook JSON payload

set -euo pipefail

tmp_payload="$(mktemp)"
tmp_link_dir="$(mktemp -d)"
relative_link_dir="$(mktemp -d hooks/.session-start-link.XXXXXX)"
trap 'rm -f "$tmp_payload"; rm -rf "$tmp_link_dir" "$relative_link_dir"' EXIT

has_jq=0
if command -v jq >/dev/null 2>&1; then
  has_jq=1
fi

payload="$(bash hooks/session-start.sh)"
printf '%s' "$payload" > "$tmp_payload"

HAS_JQ="$has_jq" PAYLOAD_PATH="$tmp_payload" node <<'NODE'
const fs = require('fs');

const payload = JSON.parse(fs.readFileSync(process.env.PAYLOAD_PATH, 'utf8'));
const hasJq = process.env.HAS_JQ === '1';
const out = payload.hookSpecificOutput;

if (!out || typeof out !== 'object') {
  throw new Error('payload is missing hookSpecificOutput (hosts reject other shapes)');
}
if (out.hookEventName !== 'SessionStart') {
  throw new Error(`expected hookEventName SessionStart, got ${out.hookEventName}`);
}
if (typeof out.additionalContext !== 'string' || !out.additionalContext.trim()) {
  throw new Error('additionalContext must be a non-empty string');
}

const ctx = out.additionalContext;
if (hasJq) {
  if (!ctx.includes('agent-skills loaded.')) {
    throw new Error('additionalContext is missing startup preface');
  }
  if (!ctx.includes('# Using Agent Skills')) {
    throw new Error('additionalContext is missing using-agent-skills content');
  }
} else if (!ctx.includes('jq is required')) {
  throw new Error('additionalContext is missing jq fallback guidance');
}

console.log('session-start JSON payload OK');
NODE

if [ "$has_jq" -eq 1 ]; then
  printf '\nTesting SessionStart through symlinks\n'
  ln -s "$PWD/hooks/session-start.sh" "$tmp_link_dir/session-start.sh"
  ln -s ../session-start.sh "$relative_link_dir/session-start.sh"
  for link in "$tmp_link_dir/session-start.sh" "$relative_link_dir/session-start.sh"; do
    payload="$(bash "$link")"
    PAYLOAD="$payload" node <<'NODE'
const payload = JSON.parse(process.env.PAYLOAD);
const ctx = payload.hookSpecificOutput?.additionalContext || '';
if (!ctx.includes('agent-skills loaded.') || !ctx.includes('# Using Agent Skills')) {
  throw new Error('symlink invocation did not load using-agent-skills');
}
NODE
  done
  printf 'session-start symlink resolution OK\n'
fi
