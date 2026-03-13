#!/usr/bin/env bun
/**
 * SecurityValidator — PreToolUse hook
 *
 * Validates Bash commands and file operations against security patterns
 * before execution. Prevents accidental destructive operations and
 * blocks access to sensitive paths.
 *
 * Adapted from PAI v4.0.3 SecurityValidator.hook.ts.
 * Simplified for PAI-DOTS: uses inline patterns (no YAML config dependency).
 *
 * TRIGGER: PreToolUse (matcher: Bash, Edit, Write, Read)
 *
 * OUTPUT:
 *   {"continue": true}           → Allow
 *   {"decision": "block", ...}   → Hard block (exit 2)
 *   exit(0) with continue:true   → Default pass
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// --- Paths ---

const DOTS_DIR = process.env.DOTS_DIR || join(homedir(), '.claude');
const LOG_DIR = join(DOTS_DIR, 'logs', 'security');

// --- Patterns ---

const BLOCKED_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/, reason: 'Destructive: rm on root filesystem' },
  { pattern: /rm\s+-[a-zA-Z]*rf?\s+~\/?$/, reason: 'Destructive: rm on home directory' },
  { pattern: /mkfs\b/, reason: 'Destructive: filesystem format' },
  { pattern: /dd\s+.*of=\/dev\/[sh]d/, reason: 'Destructive: raw disk write' },
  { pattern: /:(){ :\|:& };:/, reason: 'Fork bomb' },
  { pattern: />\s*\/dev\/[sh]d/, reason: 'Destructive: redirect to raw device' },
  { pattern: /chmod\s+(-[a-zA-Z]*\s+)?777\s+\//, reason: 'Dangerous: world-writable root path' },
];

const CONFIRM_COMMANDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /git\s+push\s+.*--force/, reason: 'Force push can overwrite remote history' },
  { pattern: /git\s+reset\s+--hard/, reason: 'Hard reset discards uncommitted changes' },
  { pattern: /git\s+clean\s+-[a-zA-Z]*f/, reason: 'git clean deletes untracked files' },
  { pattern: /drop\s+(table|database)\b/i, reason: 'SQL drop statement detected' },
  { pattern: /truncate\s+table\b/i, reason: 'SQL truncate statement detected' },
];

const ZERO_ACCESS_PATHS: string[] = [
  '~/.ssh',
  '~/.gnupg',
  '~/.aws/credentials',
  '~/.config/gcloud',
  '~/.kube/config',
];

const READ_ONLY_PATHS: string[] = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/hosts',
];

// --- Helpers ---

function expandPath(p: string): string {
  if (p.startsWith('~')) return p.replace('~', homedir());
  return p;
}

function matchesPathList(filePath: string, patterns: string[]): boolean {
  const expanded = expandPath(filePath);
  for (const p of patterns) {
    const ep = expandPath(p);
    if (expanded === ep || expanded.startsWith(ep.endsWith('/') ? ep : ep + '/')) {
      return true;
    }
  }
  return false;
}

function stripEnvVarPrefix(command: string): string {
  return command.replace(
    /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+)*/,
    ''
  );
}

function logEvent(event: Record<string, unknown>): void {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 19).replace(/:/g, '');
    const filename = `${date}-${time}-${event.event_type}.jsonl`;
    writeFileSync(join(LOG_DIR, filename), JSON.stringify(event) + '\n');
  } catch {
    // Logging failure must not block operations
  }
}

// --- Handlers ---

interface HookInput {
  session_id?: string;
  tool_name: string;
  tool_input: Record<string, unknown> | string;
}

function handleBash(input: HookInput): void {
  const rawCommand = typeof input.tool_input === 'string'
    ? input.tool_input
    : (input.tool_input?.command as string) || '';

  if (!rawCommand) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  const command = stripEnvVarPrefix(rawCommand);

  // Check blocked
  for (const { pattern, reason } of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      logEvent({
        timestamp: new Date().toISOString(),
        event_type: 'block',
        tool: 'Bash',
        target: command.slice(0, 500),
        reason,
      });
      console.error(`[SECURITY] BLOCKED: ${reason}`);
      console.error(`Command: ${command.slice(0, 100)}`);
      process.exit(2);
    }
  }

  // Check confirm
  for (const { pattern, reason } of CONFIRM_COMMANDS) {
    if (pattern.test(command)) {
      logEvent({
        timestamp: new Date().toISOString(),
        event_type: 'confirm',
        tool: 'Bash',
        target: command.slice(0, 500),
        reason,
      });
      console.log(JSON.stringify({
        decision: 'ask',
        message: `[SECURITY] ${reason}\n\nCommand: ${command.slice(0, 200)}\n\nProceed?`,
      }));
      return;
    }
  }

  console.log(JSON.stringify({ continue: true }));
}

function handleFileOp(input: HookInput, action: 'read' | 'write'): void {
  const filePath = typeof input.tool_input === 'string'
    ? input.tool_input
    : (input.tool_input?.file_path as string) || '';

  if (!filePath) {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  // Zero access — block reads and writes
  if (matchesPathList(filePath, ZERO_ACCESS_PATHS)) {
    logEvent({
      timestamp: new Date().toISOString(),
      event_type: 'block',
      tool: input.tool_name,
      target: filePath,
      reason: 'Zero access path',
    });
    console.error(`[SECURITY] BLOCKED: Access denied to ${filePath}`);
    process.exit(2);
  }

  // Read-only — block writes
  if (action === 'write' && matchesPathList(filePath, READ_ONLY_PATHS)) {
    logEvent({
      timestamp: new Date().toISOString(),
      event_type: 'block',
      tool: input.tool_name,
      target: filePath,
      reason: 'Read-only system path',
    });
    console.error(`[SECURITY] BLOCKED: Cannot write to ${filePath}`);
    process.exit(2);
  }

  console.log(JSON.stringify({ continue: true }));
}

// --- Main ---

async function main(): Promise<void> {
  let input: HookInput;

  try {
    const raw = await Promise.race([
      Bun.stdin.text(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 200)),
    ]);

    if (!raw?.trim()) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    input = JSON.parse(raw);
  } catch {
    console.log(JSON.stringify({ continue: true }));
    return;
  }

  switch (input.tool_name) {
    case 'Bash':
      handleBash(input);
      break;
    case 'Edit':
    case 'Write':
      handleFileOp(input, 'write');
      break;
    case 'Read':
      handleFileOp(input, 'read');
      break;
    default:
      console.log(JSON.stringify({ continue: true }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({ continue: true }));
});
