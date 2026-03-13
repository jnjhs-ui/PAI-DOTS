/**
 * PreCompact Hook — Preserves context through compaction
 *
 * When Claude's context window fills and messages get compressed,
 * this hook reads the current session state and outputs a compact
 * system-reminder that gets injected into post-compaction context.
 *
 * READ-ONLY: This hook never writes to any files.
 */

import * as path from 'path';
import {
  findDevlogDir,
  readFileSafe,
  logError,
  logInfo,
  getToday
} from './lib/devlog-utils';

const MAX_DEVLOG_LINES = 20;

function main(): void {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const devlogDir = findDevlogDir(projectDir);

    logInfo('pre-compact', `Firing for devlog: ${devlogDir}`);

    const parts: string[] = [];

    // 1. Read SESSION.md — the "where am I" pointer
    const sessionPath = path.join(devlogDir, 'SESSION.md');
    const sessionContent = readFileSafe(sessionPath);
    if (sessionContent?.trim()) {
      parts.push(sessionContent.trim());
    }

    // 2. Read tail of today's devlog — recent events
    const today = getToday();
    const todayPath = path.join(devlogDir, `${today}.md`);
    const todayContent = readFileSafe(todayPath);
    if (todayContent?.trim()) {
      const lines = todayContent.replace(/\r\n/g, '\n').split('\n');
      const tail = lines.slice(-MAX_DEVLOG_LINES).join('\n').trim();
      if (tail) {
        parts.push('## Recent DevLog\n' + tail);
      }
    }

    // 3. Output compact system-reminder if we have anything
    if (parts.length > 0) {
      const message = `<system-reminder>
COMPACTION RECOVERY — Context preserved by PreCompact hook

${parts.join('\n\n---\n\n')}

---
Continue from the FOCUS above. Do not re-ask the user what they were doing.
</system-reminder>`;

      console.log(message);
      console.error('[OK] PreCompact context preserved');
    }
  } catch (error: any) {
    logError('pre-compact', error.message);
    console.error('[ERROR] PreCompact hook:', error.message);
  }

  process.exit(0);
}

main();
