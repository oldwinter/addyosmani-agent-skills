#!/usr/bin/env node
/**
 * validate-commands.js
 *
 * Guards against silent drift across the three slash-command directories:
 *   .claude/commands/  (.md — Claude Code)
 *   .gemini/commands/  (.toml — Gemini CLI)
 *   commands/          (.toml — Antigravity CLI)
 *
 * Checks (errors block CI):
 *   - Every command present in one directory exists in all three
 *   - The 'description' field is identical across all three equivalents
 *   - Claude command frontmatter is valid YAML, not merely splittable
 *
 * What this does NOT check:
 *   Prompt body differences are intentional — each tool has its own
 *   syntax ($ARGUMENTS, agent-skills: prefixes, GEMINI.md vs CLAUDE.md).
 *
 * Exit codes: 0 = all clear, 1 = one or more errors
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// The same frontmatter-validity rules validate-skills applies to SKILL.md.
// `descriptionFromMd` below splits each line on its first colon, exactly as the
// skill reader used to, so a command whose frontmatter is not valid YAML passes
// every check here — and Claude Code parses that frontmatter when the command is
// loaded. The #494 thread verified all 25 SKILL.md files AND the command files by
// hand; this makes the second half a check too.
const { frontmatterYamlErrors } = require(path.join(__dirname, 'lib', 'skill-lint.js'));

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');

const DIRS = {
  claude:     { dir: path.join(ROOT, '.claude', 'commands'), ext: '.md'   },
  gemini:     { dir: path.join(ROOT, '.gemini', 'commands'), ext: '.toml' },
  antigravity:{ dir: path.join(ROOT, 'commands'),            ext: '.toml' },
};

// Commands where the file stem differs between Claude and the TOML dirs.
// Key = Claude stem, value = TOML stem.
const NAME_MAP = {
  plan: 'planning',
};
const NAME_MAP_REVERSE = Object.fromEntries(
  Object.entries(NAME_MAP).map(([k, v]) => [v, k])
);

// ─── Parsers ──────────────────────────────────────────────────────────────────

function descriptionFromMd(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match   = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/);
  if (!match) return null;
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    if (line.slice(0, colonIdx).trim() === 'description') {
      return line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

function descriptionFromToml(filePath) {
  const content     = fs.readFileSync(filePath, 'utf8');
  const doubleMatch = content.match(/^description\s*=\s*"((?:[^"\\]|\\.)*)"/m);
  if (doubleMatch) return doubleMatch[1].replace(/\\"/g, '"');
  const singleMatch = content.match(/^description\s*=\s*'([^']*)'/m);
  return singleMatch ? singleMatch[1] : null;
}

function commandTomlErrors(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const errors = [];
  const seen = new Set();
  let multiline = null;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (multiline) {
      const close = line.indexOf(multiline.delimiter);
      if (close === -1) return;
      const trailing = line.slice(close + multiline.delimiter.length).trim();
      if (trailing && !trailing.startsWith('#')) {
        errors.push(`line ${lineNo}: unexpected text after ${multiline.key} multiline string`);
      }
      multiline = null;
      return;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const assignment = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    if (!assignment) {
      errors.push(`line ${lineNo}: expected key = quoted string`);
      return;
    }
    const [, key, raw] = assignment;
    if (seen.has(key)) errors.push(`line ${lineNo}: duplicate key "${key}"`);
    seen.add(key);

    const delimiter = raw.startsWith('\"\"\"') ? '\"\"\"' : raw.startsWith("'''") ? "'''" : null;
    if (delimiter) {
      const rest = raw.slice(3);
      const close = rest.indexOf(delimiter);
      if (close === -1) {
        multiline = { key, delimiter, lineNo };
      } else {
        const trailing = rest.slice(close + delimiter.length).trim();
        if (trailing && !trailing.startsWith('#')) {
          errors.push(`line ${lineNo}: unexpected text after ${key} multiline string`);
        }
      }
      return;
    }

    const quote = raw[0];
    if (quote !== '\"' && quote !== "'") {
      errors.push(`line ${lineNo}: ${key} must be a quoted string`);
      return;
    }
    let escaped = false;
    let close = -1;
    for (let i = 1; i < raw.length; i++) {
      const char = raw[i];
      if (quote === '\"' && char === '\\' && !escaped) {
        escaped = true;
        continue;
      }
      if (char === quote && !escaped) {
        close = i;
        break;
      }
      escaped = false;
    }
    if (close === -1) {
      errors.push(`line ${lineNo}: unterminated string for ${key}`);
      return;
    }
    const trailing = raw.slice(close + 1).trim();
    if (trailing && !trailing.startsWith('#')) {
      errors.push(`line ${lineNo}: unexpected text after ${key} string`);
    }
  });

  if (multiline) {
    errors.push(`line ${multiline.lineNo}: unterminated multiline string for ${multiline.key}`);
  }
  return errors;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

function loadCommands({ dir, ext }) {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir)
      .filter(f => f.endsWith(ext))
      .map(f => {
        const stem = path.basename(f, ext);
        const full = path.join(dir, f);
        try {
          const desc = ext === '.md' ? descriptionFromMd(full) : descriptionFromToml(full);
          return [stem, desc];
        } catch (e) {
          console.log(`  ✗  ${stem} — cannot read file: ${e.message}`);
          return [stem, null];
        }
      })
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const byTool = {
    claude:      loadCommands(DIRS.claude),
    gemini:      loadCommands(DIRS.gemini),
    antigravity: loadCommands(DIRS.antigravity),
  };

  // Canonical command list: use Claude stems as the reference.
  // Map each Claude stem to its TOML equivalent for lookup.
  const claudeStems = Object.keys(byTool.claude).sort();
  const allTomlStems = new Set([
    ...Object.keys(byTool.gemini),
    ...Object.keys(byTool.antigravity),
  ]);
  const allCanonicalStems = new Set([
    ...claudeStems,
    ...[...allTomlStems].map(s => NAME_MAP_REVERSE[s] ?? s),
  ]);

  let errors = 0;

  // ── Parity check ────────────────────────────────────────────────────────────
  console.log('Checking command parity...');

  // Commands in Claude not found in TOML dirs
  for (const stem of claudeStems) {
    const tomlStem = NAME_MAP[stem] ?? stem;
    const missing  = [];
    if (!(tomlStem in byTool.gemini))      missing.push('.gemini/commands');
    if (!(tomlStem in byTool.antigravity)) missing.push('commands');
    if (missing.length) {
      console.log(`  ✗  ${stem} — missing in: ${missing.join(', ')}`);
      errors++;
    } else {
      console.log(`  ✓  ${stem}${stem !== tomlStem ? ` (${tomlStem} in toml dirs)` : ''}`);
    }
  }

  // Commands in TOML dirs not found in Claude
  for (const stem of [...allTomlStems].sort()) {
    const claudeStem = NAME_MAP_REVERSE[stem] ?? stem;
    if (!(claudeStem in byTool.claude)) {
      console.log(`  ✗  ${stem} — present in toml dirs but missing in .claude/commands`);
      errors++;
    }
  }

  // ── Claude frontmatter validity ─────────────────────────────────────────────
  // Only the .md directory: TOML syntax is checked separately below.
  console.log('\nChecking Claude command frontmatter...');

  for (const stem of claudeStems) {
    const full = path.join(DIRS.claude.dir, `${stem}${DIRS.claude.ext}`);
    let yamlErrors = [];
    try {
      yamlErrors = frontmatterYamlErrors(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      console.log(`  ✗  ${stem} — cannot read file: ${e.message}`);
      errors++;
      continue;
    }
    if (yamlErrors.length === 0) {
      console.log(`  ✓  ${stem}`);
      continue;
    }
    console.log(`  ✗  ${stem}`);
    for (const message of yamlErrors) {
      console.log(`       ${message}`);
      errors++;
    }
  }

  // ── TOML syntax validity ─────────────────────────────────────────────────
  // Command TOML deliberately uses a tiny top-level string-only subset:
  // description plus a single- or multiline prompt. Validate that complete
  // structure rather than extracting one line and assuming the rest parses.
  console.log('\nChecking TOML command syntax...');

  for (const tool of ['gemini', 'antigravity']) {
    const config = DIRS[tool];
    for (const stem of Object.keys(byTool[tool]).sort()) {
      const full = path.join(config.dir, `${stem}${config.ext}`);
      const syntaxErrors = commandTomlErrors(full);
      if (syntaxErrors.length === 0) {
        console.log(`  ✓  ${tool}/${stem}`);
        continue;
      }
      console.log(`  ✗  ${tool}/${stem}`);
      for (const message of syntaxErrors) {
        console.log(`       ${message}`);
        errors++;
      }
    }
  }

  // ── Description sync check ──────────────────────────────────────────────────
  console.log('\nChecking description sync...');

  for (const claudeStem of claudeStems) {
    const tomlStem   = NAME_MAP[claudeStem] ?? claudeStem;
    const descClaude = byTool.claude[claudeStem];
    const descGemini = byTool.gemini[tomlStem];
    const descAgy    = byTool.antigravity[tomlStem];

    const malformed = [
      ['.claude/commands', byTool.claude, claudeStem],
      ['.gemini/commands', byTool.gemini, tomlStem],
      ['commands/', byTool.antigravity, tomlStem],
    ].filter(([, commands, stem]) => Object.prototype.hasOwnProperty.call(commands, stem) && commands[stem] == null);

    if (malformed.length) {
      console.log(`  ✗  ${claudeStem}`);
      for (const [toolDir, , stem] of malformed) {
        console.log(`       ${toolDir}/${stem} — missing or malformed description`);
      }
      errors++;
      continue;
    }

    if (descClaude == null || descGemini == null || descAgy == null) {
      // Missing file already flagged by parity check
      continue;
    }

    const allMatch = descClaude === descGemini && descGemini === descAgy;

    if (allMatch) {
      console.log(`  ✓  ${claudeStem}`);
    } else {
      console.log(`  ✗  ${claudeStem}`);
      console.log(`       .claude:      ${descClaude}`);
      console.log(`       .gemini:      ${descGemini}`);
      console.log(`       commands/:    ${descAgy}`);
      errors++;
    }
  }

  const status = errors > 0 ? 'FAILED' : 'PASSED';
  console.log(`\n${allCanonicalStems.size} commands checked — ${errors} error(s) — ${status}`);

  if (errors > 0) process.exit(1);
}

main();
