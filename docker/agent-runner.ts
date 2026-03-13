#!/usr/bin/env bun
/**
 * PAI-DOTS Agent Runner
 *
 * Container entrypoint for each named agent. Polls Redis for tasks,
 * executes via `claude -p`, writes results back, and updates agent memory.
 *
 * Environment:
 *   AGENT_NAME        — which agent this container runs (qa, reviewer, ops, etc.)
 *   ANTHROPIC_API_KEY — Claude API key
 *   REDIS_URL         — Redis connection string (default: redis://redis:6379)
 *   MAX_TURNS         — max agentic turns per task (default: 10)
 *   AGENT_TIMEOUT     — seconds before task times out (default: 300)
 *   ONE_SHOT          — if "true", run single task from TASK env var and exit
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createClient } from 'redis';

// --- Config ---

const AGENT_NAME = process.env.AGENT_NAME;
if (!AGENT_NAME) {
  console.error('AGENT_NAME environment variable is required');
  process.exit(1);
}

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '10', 10);
const AGENT_TIMEOUT = parseInt(process.env.AGENT_TIMEOUT || '300', 10);
// Always /workspace inside the container — WORKSPACE_PATH env var is for
// docker-compose volume mounts (host path), not for in-container use
const WORKSPACE = '/workspace';
const AGENTS_DIR = '/root/.claude/agents';
const AGENT_DIR = join(AGENTS_DIR, AGENT_NAME);

// Tool permissions per agent role
const TOOL_PERMISSIONS: Record<string, string[]> = {
  qa:         ['Bash', 'Read', 'Glob', 'Grep'],
  reviewer:   ['Read', 'Glob', 'Grep'],
  ops:        ['Bash', 'Read', 'Glob', 'Grep', 'Write', 'Edit'],
  hubspot:    ['Bash', 'Read', 'Glob', 'Grep', 'WebFetch'],
  scribe:     ['Read', 'Glob', 'Grep'],
  architect:  ['Read', 'Glob', 'Grep'],
  researcher: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
  codex:      ['Bash', 'Read', 'Glob', 'Grep', 'Write', 'Edit'],
};

// --- Volume Init ---
// Ensure agent dir and devlog exist on the Docker volume.
// Agent.md and memory.md are created as needed (memory on first learning,
// agent.md can be mounted or baked into the image).

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

function getTools(): string {
  const tools = TOOL_PERMISSIONS[AGENT_NAME] || ['Read', 'Glob', 'Grep'];
  return tools.join(',');
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
  const tools = getTools();

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

  const args = [
    '/usr/local/bin/claude',
    '-p', fullPrompt,
    '--allowedTools', tools,
    '--output-format', 'json',
    '--max-turns', String(MAX_TURNS),
  ];

  // Use Bun's native spawn with absolute path — Bun doesn't search PATH
  // for bare command names like Node's child_process does
  const proc = Bun.spawn(args, {
    cwd: WORKSPACE,
    env: {
      ...process.env,
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.bun/bin',
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
        result: `Agent exited with code ${exitCode}. stderr: ${stderr.slice(0, 500)}`,
        success: false,
      };
    }

    try {
      const parsed = JSON.parse(stdout);
      const result = parsed.result || stdout;

      // Extract and persist learnings
      const learningsMatch = result.match(/## Learnings\n([\s\S]*?)(?:\n## |$)/);
      if (learningsMatch) {
        appendLearnings(learningsMatch[1].trim());
      }

      return { result, success: true };
    } catch {
      return { result: stdout || stderr, success: stdout.length > 0 };
    }
  })();

  return Promise.race([taskPromise, timeoutPromise]);
}

const MAX_MEMORY_ENTRIES = 20; // Keep last N learning entries to prevent bloat

function appendLearnings(learnings: string): void {
  const memoryFile = join(AGENT_DIR, 'memory.md');
  mkdirSync(AGENT_DIR, { recursive: true });

  const existing = existsSync(memoryFile) ? readFileSync(memoryFile, 'utf-8') : '';
  const date = new Date().toISOString().slice(0, 10);
  const entry = `### ${date}\n${learnings}`;

  // Parse existing entries and append new one
  const entries = existing.split(/(?=^### \d{4}-\d{2}-\d{2})/m).filter(e => e.trim());
  const header = entries.length > 0 && !entries[0].startsWith('### ')
    ? entries.shift()!
    : `# ${AGENT_NAME} Agent Memory\n\n`;

  entries.push(entry);

  // Cap at MAX_MEMORY_ENTRIES — keep most recent
  const trimmed = entries.slice(-MAX_MEMORY_ENTRIES);

  writeFileSync(memoryFile, header + '\n' + trimmed.join('\n') + '\n');
}

// --- Main Loop ---

async function runOneShot(): Promise<void> {
  const task = process.env.TASK;
  if (!task) {
    console.error('ONE_SHOT mode requires TASK environment variable');
    process.exit(1);
  }

  console.log(`[${AGENT_NAME}] Running one-shot task...`);
  logDevlogEntry('FOCUS', `**Task:** ${task}\n**Mode:** one-shot`);

  const { result, success } = await executeTask(task);

  logDevlogEntry(success ? 'MILESTONE' : 'DEAD_END',
    success
      ? `**Completed:** ${task.slice(0, 100)}`
      : `**Failed:** ${task.slice(0, 100)}\n**Reason:** ${result.slice(0, 200)}`
  );

  // Output result to stdout for orchestrator to capture
  console.log(JSON.stringify({ agent: AGENT_NAME, success, result }));
}

async function connectRedis(): Promise<ReturnType<typeof createClient>> {
  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err: Error) => console.error(`[${AGENT_NAME}] Redis error:`, err.message));
  await redis.connect();
  console.log(`[${AGENT_NAME}] Connected to Redis at ${REDIS_URL}`);
  return redis;
}

async function runPolling(): Promise<void> {
  let redis = await connectRedis();
  console.log(`[${AGENT_NAME}] Polling for tasks...`);

  while (true) {
    try {
      // Blocking pop — waits up to 5s for a task
      const item = await redis.blPop(`tasks:${AGENT_NAME}`, 5);

      if (!item) continue; // Timeout, loop again

      const taskData = JSON.parse(item.element);
      const { taskId, task } = taskData;

      // Validate required fields
      if (!taskId || !task) {
        console.error(`[${AGENT_NAME}] Malformed task — missing taskId or task field, skipping`);
        continue;
      }

      console.log(`[${AGENT_NAME}] Received task ${taskId}: ${task.slice(0, 80)}...`);
      logDevlogEntry('FOCUS', `**Task:** ${task}\n**TaskId:** ${taskId}`);

      const { result, success } = await executeTask(task);

      logDevlogEntry(success ? 'MILESTONE' : 'DEAD_END',
        success
          ? `**Completed:** ${task.slice(0, 100)}`
          : `**Failed:** ${task.slice(0, 100)}\n**Reason:** ${result.slice(0, 200)}`
      );

      // Push result back
      await redis.lPush(`results:${taskId}`, JSON.stringify({
        agent: AGENT_NAME,
        taskId,
        success,
        result,
        timestamp: new Date().toISOString(),
      }));

      console.log(`[${AGENT_NAME}] Task ${taskId} complete (success=${success})`);
    } catch (err: any) {
      console.error(`[${AGENT_NAME}] Error:`, err.message);

      // Reconnect if the Redis connection is broken
      if (!redis.isOpen) {
        console.log(`[${AGENT_NAME}] Redis connection lost, reconnecting in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        try {
          // Destroy old client fully before creating a new one
          try { await redis.disconnect(); } catch { /* already broken */ }
          redis = await connectRedis();
          continue; // Skip the backoff below, start polling immediately
        } catch (reconnectErr: any) {
          console.error(`[${AGENT_NAME}] Reconnect failed:`, reconnectErr.message);
        }
      }

      await new Promise(r => setTimeout(r, 3000)); // Back off on error
    }
  }
}

// --- Entry ---

if (process.env.ONE_SHOT === 'true') {
  runOneShot().catch(console.error);
} else {
  runPolling().catch(console.error);
}
