/**
 * Session Start Hook — Injects devlog context at session start
 *
 * Runs on SessionStart to:
 * 1. Read .devlog/SESSION.md (current focus/state)
 * 2. Read today's .devlog/YYYY-MM-DD.md (recent events)
 * 3. Inject as <system-reminder> so Claude has context
 */

import * as path from 'path';
import {
  findDevlogDir,
  readFileSafe,
  logError,
  logInfo,
  getToday
} from './lib/devlog-utils';

const MAX_RECENT_LINES = 50;

function main(): void {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const devlogDir = findDevlogDir(projectDir);

    logInfo('session-start', `Using devlog: ${devlogDir}`);

    const contextParts: string[] = [];

    // 1. Read SESSION.md (the "where was I" pointer)
    const sessionPath = path.join(devlogDir, 'SESSION.md');
    const sessionContent = readFileSafe(sessionPath);
    if (sessionContent?.trim()) {
      contextParts.push('## Current Session State\n' + sessionContent);
    }

    // 2. Read today's devlog
    const today = getToday();
    const todayLogPath = path.join(devlogDir, `${today}.md`);
    const todayContent = readFileSafe(todayLogPath);
    if (todayContent?.trim()) {
      const lines = todayContent.replace(/\r\n/g, '\n').split('\n');
      const recentLines = lines.slice(-MAX_RECENT_LINES).join('\n');
      contextParts.push('## Recent DevLog Events (Today)\n' + recentLines);
    }

    // 3. Read baton file if it exists (multi-agent coordination)
    const batonPath = path.join(projectDir, '.claude', 'baton.md');
    const batonContent = readFileSafe(batonPath);
    if (batonContent?.trim()) {
      contextParts.push('## Baton (Last Agent Handoff)\n' + batonContent);
    }

    // 4. If we have context, inject it
    if (contextParts.length > 0) {
      const message = `<system-reminder>
DEVLOG CONTEXT (Auto-loaded at Session Start)

${contextParts.join('\n\n---\n\n')}

---
If there's a FOCUS in the session state, confirm with the user before continuing that work.
If there's a Pending Resume, remind the user about the interrupted task.
</system-reminder>`;

      console.log(message);
      console.error(`[OK] DevLog context loaded from ${devlogDir}`);
    }

    process.exit(0);
  } catch (error: any) {
    logError('session-start', error.message);
    console.error('[ERROR] DevLog session-start hook:', error.message);
    process.exit(0);
  }
}

main();
