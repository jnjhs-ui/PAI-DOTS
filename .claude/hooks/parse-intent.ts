#!/usr/bin/env bun
/**
 * Overwatch — Intent Parser Hook
 *
 * Triggered on user-prompt-submit to capture and classify user intent.
 * Writes to .devlog/intents.jsonl and updates SESSION.md.
 * Detects completion signals and triggers sweep + QA reminders.
 */

import * as path from 'path';
import {
  findDevlogDir,
  getWorkingDir,
  appendFileSafe,
  readFileSafe,
  writeFileAtomic,
  logError,
  logInfo,
  getTime,
  getTimestamp,
  ensureTodayDevlog
} from './lib/devlog-utils';

interface Intent {
  type: string;
  parsed: string;
  scope: string;
  confidence: number;
}

interface IntentEntry {
  ts: string;
  type: string;
  raw: string;
  parsed: string;
  scope: string;
  confidence: number;
  id: string;
}

// Read hook data from stdin
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => inputData += chunk);
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(inputData);
    processIntent(hookData);
  } catch (err: any) {
    logError('parse-intent', `Failed to parse hook data: ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
});

function processIntent(hookData: any): void {
  try {
    const userMessage: string = hookData.user_prompt || hookData.message || '';

    if (!userMessage || userMessage.length < 3) {
      console.log(JSON.stringify({ continue: true }));
      return;
    }

    const cwd = getWorkingDir(hookData);
    const devlogDir = findDevlogDir(cwd);

    logInfo('parse-intent', `Using devlog: ${devlogDir}`);

    ensureTodayDevlog(devlogDir);

    const intent = classifyIntent(userMessage);

    const intentEntry: IntentEntry = {
      ts: getTimestamp(),
      type: intent.type,
      raw: userMessage.substring(0, 500),
      parsed: intent.parsed,
      scope: intent.scope,
      confidence: intent.confidence,
      id: `intent_${Date.now()}`
    };

    const intentsFile = path.join(devlogDir, 'intents.jsonl');
    if (appendFileSafe(intentsFile, JSON.stringify(intentEntry) + '\n')) {
      logInfo('parse-intent', `Captured intent: ${intent.type}`);
    }

    if (['NEW_INTENT', 'REFINEMENT', 'DEBUG_INTENT'].includes(intent.type)) {
      updateSessionFile(devlogDir, intentEntry);
    }

    if (intent.type === 'COMPLETION_SIGNAL') {
      emitSweepReminder();
    }

    console.log(JSON.stringify({ continue: true }));
  } catch (err: any) {
    logError('parse-intent', `processIntent failed: ${err.message}`);
    console.log(JSON.stringify({ continue: true }));
  }
}

function classifyIntent(message: string): Intent {
  const lower = message.toLowerCase().trim();

  if (/^(i want|can you|let's|let us|please|add|create|build|implement|make|write)/i.test(lower)) {
    return { type: 'NEW_INTENT', parsed: extractAction(message), scope: inferScope(message), confidence: 0.8 };
  }

  if (/^(actually|wait|no,|but|instead|rather|change that|modify)/i.test(lower)) {
    return { type: 'REFINEMENT', parsed: extractAction(message), scope: inferScope(message), confidence: 0.7 };
  }

  if (/^(why isn't|it's broken|not working|error|bug|fix|broken|failed|crash)/i.test(lower) ||
      /\?.*broken|\?.*work|\?.*error/i.test(lower)) {
    return { type: 'DEBUG_INTENT', parsed: `Debug: ${extractProblem(message)}`, scope: inferScope(message), confidence: 0.75 };
  }

  if (/^(what|how|where|when|why|explain|show me|tell me)/i.test(lower) && lower.includes('?')) {
    return { type: 'RESEARCH', parsed: extractQuestion(message), scope: inferScope(message), confidence: 0.7 };
  }

  // COMPLETION_SIGNAL — must come before CONFIRMATION
  if (/^(commit|ship it|done|merge|manage the pr|push it|ready to commit|let's commit|that's it|wrap it up|lgtm)/i.test(lower) ||
      /\b(commit this|ship this|merge this|manage the pr|ready to (push|commit|merge|ship))\b/i.test(lower)) {
    return { type: 'COMPLETION_SIGNAL', parsed: `Completion: ${message.substring(0, 100).trim()}`, scope: 'other', confidence: 0.85 };
  }

  if (/^(yes|yeah|yep|ok|okay|sure|do it|go ahead|proceed|sounds good|perfect|great|approved)/i.test(lower)) {
    return { type: 'CONFIRMATION', parsed: 'User approved', scope: 'other', confidence: 0.9 };
  }

  if (/^(no|nope|stop|don't|cancel|never mind|abort|wait stop)/i.test(lower)) {
    return { type: 'REJECTION', parsed: 'User rejected', scope: 'other', confidence: 0.9 };
  }

  if (/^[1-9]$|^(first|second|third|option [1-9]|choice [1-9])/i.test(lower)) {
    return { type: 'CHOICE', parsed: `Selected: ${message.trim()}`, scope: 'other', confidence: 0.85 };
  }

  return { type: 'OTHER', parsed: message.substring(0, 100), scope: inferScope(message), confidence: 0.3 };
}

function emitSweepReminder(): void {
  const reminder = `<system-reminder>
OVERWATCH SWEEP REQUIRED

Before committing, run an impact sweep on changed files.

Launch a Task agent (feature-dev:code-reviewer or general-purpose) with this focus:
1. Run \`git diff --name-only\` to identify all modified files
2. For each modified file: grep for all importers/consumers across the codebase
3. Check if any changed exports, props, or type signatures are wired through ALL call sites
4. Look for dangling imports, missing type updates, or untested new code paths
5. Report findings — if issues found, fix before committing
6. If sweep passes and a qa-agent skill is installed (~/.claude/skills/qa-agent/ exists), suggest: "Sweep passed. Run a QA smoke test? (tests, type-check, critical user flows)"

This is the verification step. Do not skip it.
</system-reminder>`;

  console.log(reminder);
}

function extractAction(message: string): string {
  return message
    .replace(/^(i want to|can you|let's|let us|please|i need to|we should|we need to)\s*/i, '')
    .substring(0, 100)
    .trim();
}

function extractProblem(message: string): string {
  return message.replace(/^(why isn't|it's|the)\s*/i, '').substring(0, 100).trim();
}

function extractQuestion(message: string): string {
  return message.substring(0, 100).trim();
}

function inferScope(message: string): string {
  const lower = message.toLowerCase();
  if (/\b(api|endpoint|route|fetch|request|response)\b/.test(lower)) return 'api';
  if (/\b(database|db|sql|prisma|schema|migration)\b/.test(lower)) return 'db';
  if (/\b(ui|button|page|component|style|css|layout|modal)\b/.test(lower)) return 'ui';
  if (/\b(config|env|setting|variable)\b/.test(lower)) return 'config';
  if (/\b(test|spec|coverage|jest|vitest)\b/.test(lower)) return 'test';
  if (/\b(doc|readme|comment|explain)\b/.test(lower)) return 'docs';
  return 'other';
}

function updateSessionFile(devlogDir: string, intent: IntentEntry): void {
  try {
    const sessionFile = path.join(devlogDir, 'SESSION.md');
    const timeStr = getTime();

    let content = readFileSafe(sessionFile) || '';

    const intentsHeader = '## Current Intents';

    if (content.includes(intentsHeader)) {
      const start = content.indexOf(intentsHeader);
      const nextSection = content.indexOf('\n## ', start + 1);
      const end = nextSection > 0 ? nextSection : content.length;

      let intentsSection = content.substring(start, end);
      const newIntent = `\n1. [ACTIVE] ${intent.parsed}\n   - Started: ${timeStr}\n   - Scope: ${intent.scope}\n`;

      intentsSection = intentsSection.replace(/^(\d+)\./gm, (_match, num) => `${parseInt(num) + 1}.`);
      intentsSection = intentsHeader + newIntent + intentsSection.substring(intentsHeader.length);

      content = content.substring(0, start) + intentsSection + content.substring(end);
    } else {
      const newSection = `\n${intentsHeader}\n1. [ACTIVE] ${intent.parsed}\n   - Started: ${timeStr}\n   - Scope: ${intent.scope}\n`;

      if (content.includes('# Active Session')) {
        content = content.replace('# Active Session', '# Active Session' + newSection);
      } else {
        content = `# Active Session\n${newSection}\n${content}`;
      }
    }

    writeFileAtomic(sessionFile, content);
  } catch (err: any) {
    logError('parse-intent', `updateSessionFile failed: ${err.message}`);
  }
}
