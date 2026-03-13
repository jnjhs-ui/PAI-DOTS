#!/usr/bin/env bun
/**
 * PAI-DOTS Self-Test — Health check for the installation
 *
 * Verifies all core components are present and functional.
 * Run: bun ~/.claude/tools/self-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

const DOTS_DIR = process.env.DOTS_DIR || path.join(homedir(), '.claude');
let passed = 0;
let failed = 0;
let warnings = 0;

function check(label: string, test: () => boolean): void {
  try {
    if (test()) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}`);
      failed++;
    }
  } catch (err: any) {
    console.log(`  ❌ ${label} — ${err.message}`);
    failed++;
  }
}

function warn(label: string, test: () => boolean): void {
  try {
    if (test()) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ⚠️  ${label} (optional)`);
      warnings++;
    }
  } catch {
    console.log(`  ⚠️  ${label} (optional)`);
    warnings++;
  }
}

console.log('\n🔍 PAI-DOTS Self-Test\n');
console.log(`  DOTS_DIR: ${DOTS_DIR}\n`);

// 1. Directory Resolution
console.log('📁 Directory Resolution');
check('DOTS_DIR exists', () => fs.existsSync(DOTS_DIR));
check('hooks/ directory exists', () => fs.existsSync(path.join(DOTS_DIR, 'hooks')));
check('skills/ directory exists', () => fs.existsSync(path.join(DOTS_DIR, 'skills')));
check('commands/ directory exists', () => fs.existsSync(path.join(DOTS_DIR, 'commands')));

// 2. Hook Files
console.log('\n🪝 Hooks');
const requiredHooks = [
  'session-start.ts',
  'session-init.ts',
  'session-end.ts',
  'capture-tool-events.ts',
  'pre-compact.ts',
  'parse-intent.ts',
  'lib/devlog-utils.ts',
  'lib/paths.ts'
];
for (const hook of requiredHooks) {
  check(`hooks/${hook}`, () => fs.existsSync(path.join(DOTS_DIR, 'hooks', hook)));
}

// 3. CORE Skill
console.log('\n📚 CORE Skill');
check('skills/CORE/SKILL.md', () => fs.existsSync(path.join(DOTS_DIR, 'skills', 'CORE', 'SKILL.md')));
check('skills/CORE/CONSTITUTION.md', () => fs.existsSync(path.join(DOTS_DIR, 'skills', 'CORE', 'CONSTITUTION.md')));

// 4. Overwatch Skill
console.log('\n👁️ Overwatch');
check('skills/overwatch/skill.md', () => fs.existsSync(path.join(DOTS_DIR, 'skills', 'overwatch', 'skill.md')));
check('skills/overwatch/sweep.md', () => fs.existsSync(path.join(DOTS_DIR, 'skills', 'overwatch', 'sweep.md')));

// 5. Commands
console.log('\n⚡ Commands');
const requiredCommands = ['task.md', 'done.md', 'focus.md', 'today.md', 'buglist.md', 'featreq.md', 'update.md', 'init-devlog.md'];
for (const cmd of requiredCommands) {
  check(`commands/${cmd}`, () => fs.existsSync(path.join(DOTS_DIR, 'commands', cmd)));
}

// 6. Settings
console.log('\n⚙️ Settings');
check('settings.json exists', () => fs.existsSync(path.join(DOTS_DIR, 'settings.json')));
check('settings.json is valid JSON', () => {
  const content = fs.readFileSync(path.join(DOTS_DIR, 'settings.json'), 'utf-8');
  JSON.parse(content);
  return true;
});
check('settings.json has hooks configured', () => {
  const content = fs.readFileSync(path.join(DOTS_DIR, 'settings.json'), 'utf-8');
  const settings = JSON.parse(content);
  return settings.hooks && Object.keys(settings.hooks).length > 0;
});

// 7. Runtime
console.log('\n🔧 Runtime');
warn('Bun is available', () => {
  execFileSync('bun', ['--version'], { stdio: 'pipe' });
  return true;
});

// 8. Optional Components
console.log('\n📦 Optional Components');
warn('agents/ directory', () => fs.existsSync(path.join(DOTS_DIR, 'agents')));
warn('tasks/ directory', () => fs.existsSync(path.join(DOTS_DIR, 'tasks')));
warn('tools/ directory', () => fs.existsSync(path.join(DOTS_DIR, 'tools')));
warn('tools/init-devlog.ts', () => fs.existsSync(path.join(DOTS_DIR, 'tools', 'init-devlog.ts')));
warn('statusline.ts', () => fs.existsSync(path.join(DOTS_DIR, 'statusline.ts')));

// Summary
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ✅ Passed: ${passed}`);
if (failed > 0) console.log(`  ❌ Failed: ${failed}`);
if (warnings > 0) console.log(`  ⚠️  Warnings: ${warnings}`);

if (failed === 0) {
  console.log('\n  🎉 PAI-DOTS is healthy!\n');
} else {
  console.log('\n  🔧 Some checks failed. Review above.\n');
  process.exit(1);
}
