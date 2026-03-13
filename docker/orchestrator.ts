#!/usr/bin/env bun
/**
 * PAI-DOTS Orchestrator
 *
 * Dispatches tasks to named agent containers via Redis.
 * Supports single-agent, multi-agent parallel, and broadcast modes.
 *
 * Usage:
 *   bun docker/orchestrator.ts --agent qa --task "Run tests"
 *   bun docker/orchestrator.ts --parallel --agent qa --task "Run tests" --agent reviewer --task "Review auth"
 *   bun docker/orchestrator.ts --broadcast "Prepare for deploy"
 *   echo "Run tests" | bun docker/orchestrator.ts --agent qa
 *
 * Environment:
 *   REDIS_URL       — Redis connection (default: redis://localhost:6379)
 *   AGENT_TIMEOUT   — seconds to wait for result (default: 300)
 */

import { createClient } from 'redis';
import { randomUUID } from 'crypto';

// --- Config ---

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const AGENT_TIMEOUT = parseInt(process.env.AGENT_TIMEOUT || '300', 10);

const KNOWN_AGENTS = ['qa', 'reviewer', 'ops', 'hubspot', 'scribe', 'architect', 'researcher', 'codex'];

interface TaskAssignment {
  agent: string;
  task: string;
  taskId: string;
}

interface TaskResult {
  agent: string;
  taskId: string;
  success: boolean;
  result: string;
  timestamp: string;
}

// --- Argument Parsing ---

function parseArgs(): { assignments: TaskAssignment[]; broadcast: string | null } {
  const args = process.argv.slice(2);
  const assignments: TaskAssignment[] = [];
  let broadcast: string | null = null;
  let currentAgent: string | null = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--agent':
        currentAgent = args[++i];
        if (!KNOWN_AGENTS.includes(currentAgent)) {
          console.error(`Unknown agent: ${currentAgent}. Known agents: ${KNOWN_AGENTS.join(', ')}`);
          process.exit(1);
        }
        break;

      case '--task':
        if (!currentAgent) {
          console.error('--task requires a preceding --agent');
          process.exit(1);
        }
        assignments.push({
          agent: currentAgent,
          task: args[++i],
          taskId: randomUUID(),
        });
        currentAgent = null; // Reset for next pair
        break;

      case '--broadcast':
        broadcast = args[++i];
        break;

      case '--parallel':
        // Flag only — parallel is default when multiple assignments exist
        break;

      case '--list':
        console.log('Available agents:');
        KNOWN_AGENTS.forEach(a => console.log(`  - ${a}`));
        process.exit(0);

      case '--help':
        printHelp();
        process.exit(0);

      default:
        // If we have a current agent and no --task flag, treat bare arg as task
        if (currentAgent) {
          assignments.push({
            agent: currentAgent,
            task: args[i],
            taskId: randomUUID(),
          });
          currentAgent = null;
        }
    }
  }

  // Handle piped stdin for single agent
  if (currentAgent && assignments.length === 0) {
    const stdin = readStdin();
    if (stdin) {
      assignments.push({ agent: currentAgent, task: stdin, taskId: randomUUID() });
    }
  }

  // Broadcast creates one assignment per agent
  if (broadcast) {
    for (const agent of KNOWN_AGENTS) {
      assignments.push({ agent, task: broadcast, taskId: randomUUID() });
    }
  }

  return { assignments, broadcast };
}

function readStdin(): string | null {
  try {
    // Non-blocking stdin check
    const buf = Buffer.alloc(65536);
    const fd = require('fs').openSync('/dev/stdin', 'r');
    const bytesRead = require('fs').readSync(fd, buf, 0, buf.length, null);
    require('fs').closeSync(fd);
    return bytesRead > 0 ? buf.slice(0, bytesRead).toString('utf-8').trim() : null;
  } catch {
    return null;
  }
}

function printHelp(): void {
  console.log(`
PAI-DOTS Orchestrator — dispatch tasks to containerized agents

Usage:
  bun docker/orchestrator.ts --agent <name> --task "<description>"
  bun docker/orchestrator.ts --parallel --agent qa --task "Run tests" --agent reviewer --task "Review code"
  bun docker/orchestrator.ts --broadcast "Prepare for deploy"
  bun docker/orchestrator.ts --list

Options:
  --agent <name>     Target agent (${KNOWN_AGENTS.join(', ')})
  --task <desc>      Task to dispatch
  --parallel         Run multiple agent/task pairs concurrently (default when multiple given)
  --broadcast <desc> Send the same task to all agents
  --list             List available agents
  --help             Show this help

Environment:
  REDIS_URL          Redis connection string (default: redis://localhost:6379)
  AGENT_TIMEOUT      Seconds to wait for results (default: 300)
`);
}

// --- Redis Operations ---

async function dispatch(
  redis: ReturnType<typeof createClient>,
  assignments: TaskAssignment[]
): Promise<TaskResult[]> {
  // Push all tasks
  for (const { agent, task, taskId } of assignments) {
    await redis.lPush(`tasks:${agent}`, JSON.stringify({ taskId, task }));
    console.log(`[orchestrator] Dispatched to ${agent}: ${task.slice(0, 80)}... (${taskId.slice(0, 8)})`);
  }

  // Collect results (parallel wait)
  const results: TaskResult[] = [];
  const pending = new Map(assignments.map(a => [a.taskId, a]));

  const deadline = Date.now() + AGENT_TIMEOUT * 1000;

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [taskId] of pending) {
      const item = await redis.rPop(`results:${taskId}`);
      if (item) {
        const result: TaskResult = JSON.parse(item);
        results.push(result);
        pending.delete(taskId);
        console.log(`[orchestrator] Result from ${result.agent}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      }
    }

    if (pending.size > 0) {
      await new Promise(r => setTimeout(r, 1000)); // Poll every second
    }
  }

  // Report timeouts
  for (const [taskId, assignment] of pending) {
    results.push({
      agent: assignment.agent,
      taskId,
      success: false,
      result: `Timed out after ${AGENT_TIMEOUT}s`,
      timestamp: new Date().toISOString(),
    });
    console.log(`[orchestrator] TIMEOUT: ${assignment.agent} (${taskId.slice(0, 8)})`);
  }

  return results;
}

// --- Output ---

function formatResults(results: TaskResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(`\n${status} ${r.agent.toUpperCase()}`);
    console.log('-'.repeat(40));

    // Truncate long results for terminal output
    const preview = r.result.length > 500 ? r.result.slice(0, 500) + '\n... (truncated)' : r.result;
    console.log(preview);
  }

  console.log('\n' + '='.repeat(60));
  const passed = results.filter(r => r.success).length;
  console.log(`Summary: ${passed}/${results.length} succeeded`);
}

// --- Main ---

async function main(): Promise<void> {
  const { assignments } = parseArgs();

  if (assignments.length === 0) {
    console.error('No tasks to dispatch. Use --help for usage.');
    process.exit(1);
  }

  const redis = createClient({ url: REDIS_URL });
  redis.on('error', (err: Error) => console.error('[orchestrator] Redis error:', err.message));

  await redis.connect();
  console.log(`[orchestrator] Connected to Redis at ${REDIS_URL}`);
  console.log(`[orchestrator] Dispatching ${assignments.length} task(s)...\n`);

  const results = await dispatch(redis, assignments);
  formatResults(results);

  await redis.quit();
  process.exit(results.every(r => r.success) ? 0 : 1);
}

main().catch((err) => {
  console.error('[orchestrator] Fatal:', err.message);
  process.exit(1);
});
