/**
 * Session End Hook — Updates SESSION.md with session summary
 *
 * Runs on Stop to:
 * 1. Read the events captured during this session
 * 2. Update SESSION.md with what was accomplished
 * 3. Preserve any pending resume tasks
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  findDevlogDir,
  readFileSafe,
  writeFileAtomic,
  logError,
  logInfo,
  getToday,
  getTime,
  getProjectName
} from './lib/devlog-utils';

function main(): void {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const devlogDir = findDevlogDir(projectDir);
    const projectName = getProjectName(projectDir);

    logInfo('session-end', `Using devlog: ${devlogDir}`);

    const sessionPath = path.join(devlogDir, 'SESSION.md');
    const eventsDir = path.join(devlogDir, 'events');
    const today = getToday();
    const eventsFile = path.join(eventsDir, `${today}.jsonl`);

    // Read today's events to summarize
    const filesModified = new Set<string>();
    const commandsRun: string[] = [];

    const eventsContent = readFileSafe(eventsFile);
    if (eventsContent) {
      const lines = eventsContent.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.tool_input?.file_path) {
            filesModified.add(event.tool_input.file_path);
          }
          if (event.tool_name === 'Bash' && event.tool_input?.command) {
            commandsRun.push(event.tool_input.command);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // Read current SESSION.md to preserve Pending Resume
    let pendingResume = '';
    const currentSession = readFileSafe(sessionPath);
    if (currentSession) {
      const pendingMatch = currentSession.match(/##\s*Pending Resume\s*\n([\s\S]*?)(?=\n##|\s*$)/);
      if (pendingMatch?.[1]?.trim() &&
          !pendingMatch[1].includes('[empty if nothing paused') &&
          !pendingMatch[1].includes('[No pending tasks]')) {
        pendingResume = pendingMatch[1].trim();
      }
    }

    // Generate updated SESSION.md
    const filesArray = Array.from(filesModified).slice(0, 5);
    const commandsArray = commandsRun.slice(-3);
    const fileNames = filesArray.slice(0, 3).map(f => path.basename(f));

    const sessionContent = `# Active Session

**Project:** ${projectName}
**FOCUS:** Session ended at ${getTime()}
**Intent:** [Waiting for next task]
**File(s):** ${filesArray.length > 0 ? filesArray.join(', ') : 'None this session'}
**Success:** [Session completed]
**Ended:** ${getTime()}

## Pending Resume
${pendingResume || '[No pending tasks]'}

## Quick Context (Last Session)
${filesArray.length > 0 ? `- Modified ${filesArray.length} file(s): ${fileNames.join(', ')}` : '- No files modified'}
${commandsArray.length > 0 ? `- Last commands: ${commandsArray.map(c => c.slice(0, 40)).join('; ')}` : '- No commands run'}
`;

    writeFileAtomic(sessionPath, sessionContent);
    console.error(`[OK] SESSION.md updated at session end`);

  } catch (error: any) {
    logError('session-end', error.message);
    console.error('[ERROR] Session end hook:', error.message);
  }

  process.exit(0);
}

main();
