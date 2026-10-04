#!/usr/bin/env node
/**
 * render_erd.js — Compile a Mermaid ERD (.mmd) into a physical SVG artifact.
 *
 * Usage:
 *   node scripts/render_erd.js <input.mmd> [output.svg]
 *
 * Defaults:
 *   input : (required) path to the Mermaid source file
 *   output: docs/architecture/erd.svg (relative to cwd)
 *
 * Behavior:
 *   Success -> prints "SUCCESS", exit code 0
 *   Failure -> prints "SYNTAX_ERROR: <stderr trace>", exit code 1
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_OUTPUT = path.join('docs', 'architecture', 'erd.svg');
const MAX_RETRIES_ENV = 'MMDC_NPX_RETRIES';

function fail(message) {
  console.error(`SYNTAX_ERROR: ${message}`);
  process.exit(1);
}

function resolveMmdc() {
  // Prefer a locally installed binary; fall back to `npx mmdc`.
  try {
    const local = require.resolve('@mermaid-js/mermaid-cli/package.json');
    const binDir = path.join(path.dirname(local), 'node_modules', '.bin');
    const bin = path.join(binDir, process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');
    if (fs.existsSync(bin)) return { cmd: bin, prefix: [] };
  } catch (_) { /* not installed locally */ }
  return { cmd: 'npx', prefix: ['--yes', 'mmdc'] };
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3] || DEFAULT_OUTPUT;

  if (!input) {
    console.error('USAGE_ERROR: missing input file. Usage: node scripts/render_erd.js <input.mmd> [output.svg]');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    fail(`input file not found: ${input}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });

  // Headless Chromium needs sandbox disabled in many CI/container environments.
  const puppeteerConfig = path.join(os.tmpdir(), 'mmdc-puppeteer-config.json');
  if (!fs.existsSync(puppeteerConfig)) {
    fs.writeFileSync(puppeteerConfig, JSON.stringify({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    }));
  }


  const { cmd, prefix } = resolveMmdc();
  const flagSets = ['--puppeteerConfigFile', '--puppeteer-config'];
  let result;
  for (const flag of flagSets) {
    const args = [...prefix, '-i', input, '-o', output, flag, puppeteerConfig];
    result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (!/unknown option/.test(result.stderr || '')) break; // flag accepted (or hard failure) -> stop
  }

  if (result.error) {
    fail(`failed to launch mermaid-cli: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail((result.stderr || result.stdout || `mmdc exited with code ${result.status}`).trim());
  }
  if (!fs.existsSync(output)) {
    fail(`mmdc reported success but produced no output at ${output}`);
  }

  // mermaid-cli can exit 0 while embedding a parse-error message inside the SVG.
  const svg = fs.readFileSync(output, 'utf8');
  if (/syntax error|parse error|mermaid version \d+\.\d+\.\d+ error/i.test(svg)) {
    fail(`mermaid-cli produced an error-embedded SVG for ${input}; check the Mermaid syntax`);
  }

  console.log('SUCCESS');
  process.exit(0);
}

main();
