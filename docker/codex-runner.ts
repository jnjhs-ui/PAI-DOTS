#!/usr/bin/env bun
/**
 * PAI-DOTS Codex Runner
 *
 * Container/host entrypoint for the Codex agent. Polls Redis for tasks,
 * executes via an environment-driven Codex CLI command, writes results
 * back, and updates agent memory.
 *
 * Environment:
 *   CODEX_CMD         — full Codex CLI command (required, e.g. "codex --non-interactive")
 *   REDIS_URL         — Redis connection string (default: redis://redis:6379)
 *   WORKSPACE_PATH    — working directory for Codex (default: /workspace)
 *   AGENT_TIMEOUT     — seconds before task times out (default: 300)
 *   MAX_TURNS         — passthrough to Codex CLI if supported (optional)
 *   ONE_SHOT          — if "true", run single task from TASK env var and exit
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createClient } from 'redis';

// --- Config ---

const AGENT_NAME = 'codex';

const CODEX_CMD = process.env.CODEX_CMD;
if (!CODEX_CMD) {
  console.error('[codex] CODEX_CMD environment variable is required (e.g. "codex --non-interactive")');
  process.exit(1);
}

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const WORKSPACE = process.env.WORKSPACE_PATH || '/workspace';
const AGENT_TIMEOUT = parseInt(process.env.AGENT_TIMEOUT || '300', 10);
const MAX_TURNS = process.env.MAX_TURNS;
const AGENTS_DIR = '/root/.claude/agents';
const AGENT_DIR = join(AGENTS_DIR, AGENT_NAME);

// --- Volume Init ---

mkdirSync(join(AGENT_DIR, '.devlog'), { recursive: true });

// --- Helpers ---

function loadAgentContext(): string {
  const agentMd = join(AGENT_DIR, 'agent.md');
  const memoryMd = join(AGENT_DIR, 'memory.md');

  let context = '';

  if (existsSync(agentMd)) {
    context += readFileSync(agentMd, 'utf-8') + '\n\n';
  }

  if (existsSync(memoryMd)) {
    const memory = readFileSync(memoryMd, 'utf-8').trim();
    if (memory) {
      context += '## Your Memory (from previous tasks)\n\n' + memory + '\n\n';
    }
  }

  return context;
}

function ensureDevlog(): void {
  const devlogDir = join(AGENT_DIR, '.devlog');
  if (!existsSync(devlogDir)) {
    mkdirSync(devlogDir, { recursive: true });
  }
}

function logDevlogEntry(type: string, content: string): void {
  ensureDevlog();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const logFile = join(AGENT_DIR, '.devlog', `${date}.md`);

  if (!existsSync(logFile)) {
    writeFileSync(logFile, `# ${AGENT_NAME} Agent DevLog: ${date}\n\n---\n\n`);
  }

  const entry = `### ${time} ${type}\n${content}\n\n`;
  appendFileSync(logFile, entry);
}

async function executeTask(task: string): Promise<{ result: string; success: boolean }> {
  const context = loadAgentContext();

  const fullPrompt = [
    context,
    '---',
    '',
    '## Current Task',
    '',
    task,
    '',
    '---',
    '',
    'After completing the task, summarize what you learned that should be remembered for future tasks.',
    'Format learnings as a section starting with "## Learnings" at the end of your response.',
  ].join('\n');

  // Build command args from CODEX_CMD + prompt
  const cmdParts = CODEX_CMD.split(/\s+/);
  const execArgs = [...cmdParts.slice(1), fullPrompt];

  // Append MAX_TURNS if set and CLI supports it
  if (MAX_TURNS) {
    execArgs.push('--max-turns', MAX_TURNS);
  }

  // Resolve executable: on Windows, Bun.spawn can't run .cmd/.sh wrappers,
  // so resolve npm packages to their node.js entry point
  let executable = cmdParts[0];
  if (process.platform === 'win32') {
    try {
      const npmPrefix = process.env.npm_config_prefix || join(process.env.APPDATA || '', 'npm');
      const resolved = require.resolve(`@openai/codex/bin/codex.js`, { paths: [npmPrefix] });
      execArgs.unshift(resolved.replace(/\\/g, '/'));
      // Use node.exe (which Bun.spawn can find) to run the JS entry point
      executable = 'node';
    } catch {
      // Fall back to raw command — will work in containers
    }
  }

  const proc = Bun.spawn([executable, ...execArgs], {
    cwd: WORKSPACE,
    env: {
      ...process.env,
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.bun/bin',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Race between task completion and timeout
  const timeoutPromise = new Promise<{ result: string; success: boolean }>((resolve) => {
    setTimeout(() => {
      proc.kill();
      resolve({ result: `Task timed out after ${AGENT_TIMEOUT}s`, success: false });
    }, AGENT_TIMEOUT * 1000);
  });

  const taskPromise = (async (): Promise<{ result: string; success: boolean }> => {
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        result: `Codex exited with code ${exitCode}. stderr: ${stderr.slice(0, 500)}`,
        success: false,
      };
    }

    // Attempt JSON parse but fall back to raw stdout
    let result: string;
    try {
      const parsed = JSON.parse(stdout);
      result = parsed.result || parsed.output || stdout;
    } catch {
      result = stdout || stderr;
    }

    // Extract and persist learnings
    const learningsMatch = result.match(/## Learnings\n([\s\S]*?)(?:\n## |$)/);
    if (learningsMatch) {
      appendLearnings(learningsMatch[1].trim());
    }

    return { result, success: (stdout.length > 0 || stderr.length === 0) };
  })();

  return Promise.race([taskPromise, timeoutPromise]);
}

const MAX_MEMORY_ENTRIES = 20;

function appendLearnings(learnings: string): void {
  const memoryFile = join(AGENT_DIR, 'memory.md');
  mkdirSync(AGENT_DIR, { recursive: true });

  const existing = existsSync(memoryFile) ? readFileSync(memoryFile, 'utf-8') : '';
  const date = new Date().toISOString().slice(0, 10);
  const entry = `### ${date}\n${learnings}`;

  const entries = existing.split(/(?=^### \d{4}-\d{2}-\d{2})/m).filter(e => e.trim());
  const header = entries.length > 0 && !entries[0].startsWith('### ')
    ? entries.shift()!
    : `# ${AGENT_NAME} Agent Memory\n\n`;

  entries.push(entry);

  const trimmed = entries.slice(-MAX_MEMORY_ENTRIES);

  writeFileSync(memoryFile, header + '\n' + trimmed.join('\n') + '\n');
}

// --- Main Loop ---

async function runOneShot(): Promise<void> {
  const task = process.env.TASK;
  if (!task) {
    console.error('[codex] ONE_SHOT mode requires TASK environment variable');
    process.exit(1);
  }

  console.log(`[codex] Running one-shot task...`);
  logDevlogEntry('FOCUS', `**Task:** ${task}\n**Mode:** one-shot`);

  const { result, success } = await executeTask(task);

  logDevlogEntry(success ? 'MILESTONE' : 'DEAD_END',
    success
      ? `**Completed:** ${task.slice(0, 100)}`
      : `**Failed:** ${task.slice(0, 100)}\n**Reason:** ${result.slice(0, 200)}`
  );

  console.log(JSON.stringify({ agent: AGENT_NAME, success, result }));
}

async function connectRedis(): Promise<ReturnType<typeof createClient>> {
  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err: Error) => console.error(`[codex] Redis error:`, err.message));
  await redis.connect();
  console.log(`[codex] Connected to Redis at ${REDIS_URL}`);
  return redis;
}

async function runPolling(): Promise<void> {
  let redis = await connectRedis();
  console.log(`[codex] Polling for tasks on queue tasks:codex ...`);

  while (true) {
    try {
      const item = await redis.blPop(`tasks:${AGENT_NAME}`, 5);

      if (!item) continue;

      const taskData = JSON.parse(item.element);
      const { taskId, task } = taskData;

      if (!taskId || !task) {
        console.error(`[codex] Malformed task — missing taskId or task field, skipping`);
        continue;
      }

      console.log(`[codex] Received task ${taskId}: ${task.slice(0, 80)}...`);
      logDevlogEntry('FOCUS', `**Task:** ${task}\n**TaskId:** ${taskId}`);

      const { result, success } = await executeTask(task);

      logDevlogEntry(success ? 'MILESTONE' : 'DEAD_END',
        success
          ? `**Completed:** ${task.slice(0, 100)}`
          : `**Failed:** ${task.slice(0, 100)}\n**Reason:** ${result.slice(0, 200)}`
      );

      await redis.lPush(`results:${taskId}`, JSON.stringify({
        agent: AGENT_NAME,
        taskId,
        success,
        result,
        timestamp: new Date().toISOString(),
      }));

      console.log(`[codex] Task ${taskId} complete (success=${success})`);
    } catch (err: any) {
      console.error(`[codex] Error:`, err.message);

      if (!redis.isOpen) {
        console.log(`[codex] Redis connection lost, reconnecting in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        try {
          try { await redis.disconnect(); } catch { /* already broken */ }
          redis = await connectRedis();
          continue;
        } catch (reconnectErr: any) {
          console.error(`[codex] Reconnect failed:`, reconnectErr.message);
        }
      }

      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// --- Entry ---

if (process.env.ONE_SHOT === 'true') {
  runOneShot().catch(console.error);
} else {
  runPolling().catch(console.error);
}
