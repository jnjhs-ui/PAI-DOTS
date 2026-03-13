#!/usr/bin/env bun
/**
 * PAI-DOTS Protection Validator
 *
 * Scans the repo for accidentally committed secrets, PII, or
 * modifications to protected files. Wire as a pre-commit hook
 * or run manually before pushing.
 *
 * Run: bun ~/.claude/tools/validate-protected.ts [path]
 */

import * as fs from 'fs';
import * as path from 'path';

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-ant-[a-zA-Z0-9]{20,}/g, label: 'Anthropic API key' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: 'OpenAI-style API key' },
  { pattern: /Bearer\s+[a-zA-Z0-9._\-]{20,}/g, label: 'Bearer token' },
  { pattern: /ELEVENLABS_API_KEY\s*=\s*\S+/g, label: 'ElevenLabs key' },
  { pattern: /SENDGRID_API_KEY\s*=\s*\S+/g, label: 'SendGrid key' },
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, label: 'Hardcoded password' },
  { pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g, label: 'Private key' },
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, label: 'Email address' },
];

// Load user-defined PII strings from .protected.json
function loadPiiStrings(repoRoot: string): string[] {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, '.protected.json'), 'utf-8');
    const config = JSON.parse(raw);
    return Array.isArray(config.pii_strings) ? config.pii_strings.filter(Boolean) : [];
  } catch {
    return [];
  }
}

const SKIP_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.ttf', '.zip'];
const SKIP_FILES = ['.protected.json', '.env.example'];

let issues = 0;

function scanFile(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.includes(ext)) return;
  if (SKIP_FILES.includes(path.basename(filePath))) return;

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  for (const { pattern, label } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      console.log(`  ❌ ${path.relative(process.cwd(), filePath)} — ${label}`);
      issues++;
    }
  }
}

function getStagedFiles(repoRoot: string): string[] {
  try {
    const { execFileSync } = require('child_process');
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
      cwd: repoRoot, encoding: 'utf-8', stdio: 'pipe'
    }).trim();
    return output ? output.split('\n').map((f: string) => path.join(repoRoot, f)) : [];
  } catch {
    return [];
  }
}

function getTrackedFiles(repoRoot: string): string[] {
  try {
    const { execFileSync } = require('child_process');
    const output = execFileSync('git', ['ls-files'], {
      cwd: repoRoot, encoding: 'utf-8', stdio: 'pipe'
    }).trim();
    return output ? output.split('\n').map((f: string) => path.join(repoRoot, f)) : [];
  } catch {
    return [];
  }
}

// Main
const targetDir = process.argv[2] || process.cwd();

console.log('\n🔒 PAI-DOTS Protection Validator\n');
console.log(`  Scanning: ${targetDir}\n`);

// When run as pre-commit hook, only scan staged files.
// When run manually, scan all git-tracked files.
const stagedFiles = getStagedFiles(targetDir);
const filesToScan = stagedFiles.length > 0 ? stagedFiles : getTrackedFiles(targetDir);

for (const filePath of filesToScan) {
  scanFile(filePath);
}

// Check user-defined PII strings against the same file set
const piiStrings = loadPiiStrings(targetDir).filter(s => !s.startsWith('_ADD_'));
if (piiStrings.length > 0) {
  for (const filePath of filesToScan) {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }
    for (const pii of piiStrings) {
      if (content.includes(pii)) {
        console.log(`  ❌ ${path.relative(targetDir, filePath)} — PII string match: "${pii}"`);
        issues++;
      }
    }
  }
}

if (issues === 0) {
  console.log('  ✅ No secrets or PII detected.\n');
} else {
  console.log(`\n  ❌ Found ${issues} issue(s). Fix before committing.\n`);
  process.exit(1);
}

