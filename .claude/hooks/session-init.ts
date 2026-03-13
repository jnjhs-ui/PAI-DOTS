#!/usr/bin/env bun
/**
 * Overwatch — Session Initializer
 *
 * Run at session start to:
 * 1. Check if today's devlog exists, create if not
 * 2. Check if SESSION.md is stale (from previous day)
 * 3. Carry over active intents from yesterday
 * 4. Output context for main agent
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  findDevlogDir,
  getWorkingDir,
  readFileSafe,
  writeFileAtomic,
  appendFileSafe,
  logError,
  logInfo,
  getToday,
  getTimestamp,
  ensureTodayDevlog,
  getProjectName
} from './lib/devlog-utils';

interface SessionContext {
  hasDevlog: boolean;
  devlogDir?: string;
  today?: string;
  isNewDay?: boolean;
  createdDevlog?: boolean;
  sessionStale?: boolean;
  sessionFromDate?: string;
  activeIntents?: string[];
  pendingIntents?: string[];
  yesterdayCarryover?: string[];
  recentIntents?: any[];
  error?: string;
}

// Read hook data from stdin
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => inputData += chunk);
process.stdin.on('end', () => {
  try {
    const hookData = inputData ? JSON.parse(inputData) : {};
    initSession(hookData);
  } catch (err: any) {
    logError('session-init', `Failed to parse hook data: ${err.message}`);
    initSession({});
  }
});

function initSession(hookData: any): void {
  try {
    const cwd = getWorkingDir(hookData);
    const devlogDir = findDevlogDir(cwd);

    logInfo('session-init', `Using devlog: ${devlogDir}`);

    const today = getToday();
    const todayFile = path.join(devlogDir, `${today}.md`);
    const sessionFile = path.join(devlogDir, 'SESSION.md');
    const intentsFile = path.join(devlogDir, 'intents.jsonl');

    const context: SessionContext = {
      hasDevlog: true,
      devlogDir,
      today,
      isNewDay: !fs.existsSync(todayFile),
      sessionStale: false,
      activeIntents: [],
      pendingIntents: [],
      yesterdayCarryover: []
    };

    // Ensure today's devlog exists
    const projectName = getProjectName(cwd);
    const result = ensureTodayDevlog(devlogDir, projectName);
    context.createdDevlog = result.created;

    // Check SESSION.md staleness
    if (fs.existsSync(sessionFile)) {
      const sessionContent = readFileSafe(sessionFile) || '';
      const sessionStat = fs.statSync(sessionFile);
      const sessionDate = sessionStat.mtime.toISOString().split('T')[0];

      if (sessionDate !== today) {
        context.sessionStale = true;
        context.sessionFromDate = sessionDate;

        const activeIntents = extractActiveIntents(sessionContent);
        if (activeIntents.length > 0) {
          context.yesterdayCarryover = activeIntents;

          const carryoverEntries = activeIntents.map(intent => ({
            ts: getTimestamp(),
            type: 'CARRIED_OVER',
            raw: intent,
            parsed: intent,
            scope: 'other',
            fromDate: sessionDate
          }));

          carryoverEntries.forEach(entry => {
            appendFileSafe(intentsFile, JSON.stringify(entry) + '\n');
          });

          const newSession = `# Active Session

**Date:** ${today}
**Status:** New day - confirming priorities

## Carried Over from ${sessionDate}
${activeIntents.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

## Current Intents
[awaiting user direction]

## Quick Context
- Previous session: ${sessionDate}
- ${activeIntents.length} intent(s) carried over
`;
          writeFileAtomic(sessionFile, newSession);
        }
      } else {
        context.activeIntents = extractActiveIntents(sessionContent);
      }
    }

    // Read recent intents from today
    const intentsContent = readFileSafe(intentsFile);
    if (intentsContent) {
      const lines = intentsContent.split('\n').filter(Boolean);
      const todayIntents = lines
        .map(line => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter((i: any) => i && i.ts && i.ts.startsWith(today))
        .slice(-10);

      context.recentIntents = todayIntents;
    }

    outputContext(context);
  } catch (err: any) {
    logError('session-init', `initSession failed: ${err.message}`);
    outputContext({ hasDevlog: false, error: err.message });
  }
}

function extractActiveIntents(sessionContent: string): string[] {
  const intents: string[] = [];
  const lines = sessionContent.split('\n');

  for (const line of lines) {
    const match = line.match(/^\d+\.\s*\[ACTIVE\]\s*(.+)/);
    if (match) {
      intents.push(match[1].trim());
    }
  }

  return intents;
}

function outputContext(context: SessionContext): void {
  let output = '<system-reminder>\nOVERWATCH SESSION INIT\n\n';

  if (!context.hasDevlog) {
    output += `No devlog found. Using global fallback.\n`;
    if (context.error) {
      output += `Error: ${context.error}\n`;
    }
  } else {
    output += `Date: ${context.today}\n`;
    output += `DevLog: ${context.devlogDir}\n`;

    if (context.isNewDay || context.createdDevlog) {
      output += `Status: NEW DAY - Created ${context.today}.md\n`;
    }

    if (context.sessionStale) {
      output += `\nSESSION.md was stale (from ${context.sessionFromDate})\n`;
    }

    if (context.yesterdayCarryover?.length) {
      output += `\nCarried over from yesterday:\n`;
      context.yesterdayCarryover.forEach((intent, i) => {
        output += `  ${i + 1}. ${intent}\n`;
      });
      output += `\nConfirm with user: "Continuing these from yesterday, or new focus?"\n`;
    }

    if (context.activeIntents?.length) {
      output += `\nActive intents:\n`;
      context.activeIntents.forEach((intent, i) => {
        output += `  ${i + 1}. ${intent}\n`;
      });
    }

    if (context.recentIntents?.length) {
      output += `\nRecent intent history (today):\n`;
      context.recentIntents.slice(-5).forEach((intent: any) => {
        output += `  - [${intent.type}] ${intent.parsed}\n`;
      });
    }
  }

  output += '</system-reminder>';
  console.log(output);
}
