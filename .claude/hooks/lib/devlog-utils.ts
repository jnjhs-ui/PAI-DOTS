/**
 * DevLog Utilities — Shared module for all hooks
 *
 * Provides:
 * - Unified project detection with global fallback
 * - Error logging
 * - Date/time helpers
 * - Atomic file operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { LOG_FILE } from './paths';

/** Global devlog location (fallback when no project devlog exists) */
export const GLOBAL_DEVLOG = path.join(homedir(), '.claude', 'devlog');

/**
 * Find the devlog directory for the current context.
 *
 * Strategy:
 * 1. Walk up from startDir looking for .devlog/ directory
 * 2. If not found, return global devlog (~/.claude/devlog/)
 * 3. Ensure the returned directory exists
 */
export function findDevlogDir(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 15; i++) {
    const devlog = path.join(dir, '.devlog');
    if (fs.existsSync(devlog)) {
      try {
        const stats = fs.statSync(devlog);
        if (stats.isDirectory()) return devlog;
      } catch {
        // Continue searching
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  ensureDir(GLOBAL_DEVLOG);
  return GLOBAL_DEVLOG;
}

/** Ensure a directory exists, creating it if necessary */
export function ensureDir(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err: any) {
    logError('ensureDir', `Failed to create ${dirPath}: ${err.message}`);
  }
}

/** Get today's date in YYYY-MM-DD format */
export function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Get current time in HH:MM format */
export function getTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Get ISO timestamp */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/** Log an error to the hooks log file */
export function logError(source: string, message: string): void {
  try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const entry = `[${getTimestamp()}] [${source}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, entry);
  } catch {
    // Can't log the error about logging — just continue
  }
}

/** Log info (only when DEBUG_HOOKS is set) */
export function logInfo(source: string, message: string): void {
  if (process.env.DEBUG_HOOKS) {
    logError(source, `[INFO] ${message}`);
  }
}

/** Read a file safely, returning null on any error */
export function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Write a file atomically using temp file + rename */
export function writeFileAtomic(filePath: string, content: string): boolean {
  const tempPath = filePath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err: any) {
    try { fs.unlinkSync(tempPath); } catch {}
    logError('writeFileAtomic', `Failed to write ${filePath}: ${err.message}`);
    return false;
  }
}

/** Append to a file safely */
export function appendFileSafe(filePath: string, content: string): boolean {
  try {
    fs.appendFileSync(filePath, content);
    return true;
  } catch (err: any) {
    logError('appendFileSafe', `Failed to append to ${filePath}: ${err.message}`);
    return false;
  }
}

/** Get the working directory from hook data or environment */
export function getWorkingDir(hookData: any): string {
  return hookData?.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/**
 * Detect the current project name.
 * Strategy: git remote origin URL → repo name, fallback to CWD basename.
 */
export function getProjectName(cwd: string): string {
  try {
    const { execFileSync } = require('child_process');
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd, stdio: 'pipe', encoding: 'utf-8'
    }).trim();
    const match = remote.match(/\/([^\/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {}
  return path.basename(cwd);
}

/** Create today's devlog file if it doesn't exist */
export function ensureTodayDevlog(devlogDir: string, projectName?: string): { created: boolean; path: string } {
  const today = getToday();
  const todayFile = path.join(devlogDir, `${today}.md`);

  if (!fs.existsSync(todayFile)) {
    const projectLine = projectName ? `**Project:** ${projectName}\n\n` : '';
    const template = `# DevLog: ${today}

${projectLine}## Goal
[awaiting user direction]

## Constraints
[none yet]

---

## Session Log

`;
    writeFileAtomic(todayFile, template);
    return { created: true, path: todayFile };
  }

  return { created: false, path: todayFile };
}
