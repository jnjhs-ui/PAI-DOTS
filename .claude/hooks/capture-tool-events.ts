/**
 * Capture Tool Events Hook — Logs tool calls to JSONL for analysis
 *
 * Runs on PostToolUse to capture:
 * - Tool name and inputs (sanitized)
 * - Timestamp
 * - Session ID
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  findDevlogDir,
  ensureDir,
  logError,
  logInfo
} from './lib/devlog-utils';

/** Tools to skip (read-only, high-frequency) */
const SKIP_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

/** Patterns to redact from bash commands */
const SECRET_PATTERNS = [
  /Bearer\s+\S+/gi,
  /Authorization:\s*\S+/gi,
  /-p['"]?[^'"\s]+['"]?/g,
  /password[=:]\S+/gi,
  /secret[=:]\S+/gi,
  /api[_-]?key[=:]\S+/gi,
  /token[=:]\S+/gi,
];

function getReadableTimestamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getEventsFilePath(devlogDir: string, now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const eventsDir = path.join(devlogDir, 'events');
  ensureDir(eventsDir);

  return path.join(eventsDir, `${year}-${month}-${day}.jsonl`);
}

function sanitizeCommand(cmd: string): string {
  if (!cmd || typeof cmd !== 'string') return '';
  let sanitized = cmd.slice(0, 200);
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    setTimeout(() => resolve(data), 2000);
  });
}

async function main(): Promise<void> {
  try {
    const stdinData = await readStdin();
    if (!stdinData?.trim()) {
      process.exit(0);
    }

    let hookData: any;
    try {
      hookData = JSON.parse(stdinData);
    } catch {
      process.exit(0);
    }

    if (!hookData || typeof hookData !== 'object') {
      process.exit(0);
    }

    const toolName: string = hookData.tool_name || 'unknown';

    if (SKIP_TOOLS.includes(toolName)) {
      process.exit(0);
    }

    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const devlogDir = findDevlogDir(projectDir);

    logInfo('capture-tool-events', `Using devlog: ${devlogDir}, tool: ${toolName}`);

    const now = new Date();

    const event: any = {
      timestamp: now.getTime(),
      timestamp_readable: getReadableTimestamp(now),
      session_id: hookData.session_id || 'unknown',
      tool_name: toolName,
      tool_input: {},
      description: hookData.description
    };

    const toolInput = hookData.tool_input || {};

    if (toolInput.file_path) {
      event.tool_input = {
        file_path: toolInput.file_path,
        action: toolName,
        content_length: toolInput.content?.length || toolInput.new_string?.length || 0
      };
    } else if (toolInput.command) {
      event.tool_input = {
        command: sanitizeCommand(toolInput.command)
      };
    } else if (toolInput.subagent_type) {
      event.tool_input = {
        subagent_type: toolInput.subagent_type,
        description: toolInput.description
      };
    }

    // Append to events file with fd for safe concurrent writes
    const eventsFile = getEventsFilePath(devlogDir, now);
    const jsonLine = JSON.stringify(event) + '\n';

    const fd = fs.openSync(eventsFile, 'a');
    try {
      fs.writeSync(fd, jsonLine);
    } finally {
      fs.closeSync(fd);
    }

  } catch (error: any) {
    logError('capture-tool-events', error.message);
    if (process.env.DEBUG) {
      console.error('[ERROR] Tool capture:', error.message);
    }
  }

  process.exit(0);
}

main();
