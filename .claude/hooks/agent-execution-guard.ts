#!/usr/bin/env bun
/**
 * AgentExecutionGuard — PreToolUse hook
 *
 * Warns when non-fast agents are spawned in foreground (blocking UI).
 * Injects a system-reminder suggesting run_in_background: true.
 *
 * Adapted from PAI v4.0.3 AgentExecutionGuard.hook.ts.
 *
 * TRIGGER: PreToolUse (matcher: Agent)
 *
 * DECISION LOGIC:
 *   run_in_background: true     → PASS
 *   model: "haiku"              → PASS (fast-tier)
 *   subagent_type: "Explore"    → PASS (quick lookup)
 *   Otherwise                   → WARNING (inject reminder)
 *
 * Non-blocking: warning only, never blocks execution.
 * Typical execution: <10ms
 */

interface HookInput {
  tool_name: string;
  tool_input: {
    run_in_background?: boolean;
    subagent_type?: string;
    description?: string;
    model?: string;
  };
}

const FAST_AGENT_TYPES = ['Explore'];
const FAST_MODELS = ['haiku'];

async function main() {
  try {
    const raw = await Promise.race([
      Bun.stdin.text(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 200)),
    ]);

    if (!raw?.trim()) {
      process.exit(0);
    }

    const data: HookInput = JSON.parse(raw);
    const toolInput = data.tool_input || {};

    // Already background — correct usage
    if (toolInput.run_in_background === true) {
      process.exit(0);
    }

    // Fast-tier agents don't need background
    if (FAST_AGENT_TYPES.includes(toolInput.subagent_type || '')) {
      process.exit(0);
    }

    // Haiku model = fast-tier
    if (FAST_MODELS.includes(toolInput.model || '')) {
      process.exit(0);
    }

    // Foreground non-fast agent — warn
    const desc = toolInput.description || toolInput.subagent_type || 'unknown';

    console.log(`<system-reminder>
NOTE: Foreground agent detected — "${desc}" (${toolInput.subagent_type || 'untyped'}).
Consider using run_in_background: true to avoid blocking the user interface.
Only Explore agents and haiku-model agents should run in foreground.
</system-reminder>`);

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
