/**
 * PAI-DOTS Centralized Path Resolution
 *
 * Single source of truth for all directory locations.
 * Inspired by PAI's pai-paths.ts pattern.
 */

import { join } from 'path';
import { homedir } from 'os';

export const DOTS_DIR = process.env.DOTS_DIR || join(homedir(), '.claude');
export const HOOKS_DIR = join(DOTS_DIR, 'hooks');
export const SKILLS_DIR = join(DOTS_DIR, 'skills');
export const COMMANDS_DIR = join(DOTS_DIR, 'commands');
export const TASKS_DIR = join(DOTS_DIR, 'tasks');
export const TOOLS_DIR = join(DOTS_DIR, 'tools');
export const LOG_DIR = join(DOTS_DIR, 'logs');
export const LOG_FILE = join(LOG_DIR, 'hooks.log');
