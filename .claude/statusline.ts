#!/usr/bin/env bun

/**
 * Status Line Script for Claude Code
 * Displays: Model, Output Style, Directory, Git Branch, Context Usage
 */

import { execFileSync } from 'child_process';
import * as path from 'path';
import { homedir } from 'os';

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const statusLine = buildStatusLine(data);
    process.stdout.write(statusLine);
  } catch {
    process.stdout.write('Claude Code\n');
  }
});

function buildStatusLine(data: any): string {
  const parts: string[] = [];
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';

  const modelName = data.model?.display_name || 'Claude';
  parts.push(`${dim}${modelName}${reset}`);

  const outputStyle = data.output_style?.name;
  if (outputStyle && outputStyle !== 'default') {
    parts.push(`${dim}:${outputStyle}${reset}`);
  }

  const cwd: string = data.workspace?.current_dir || process.cwd();
  const projectDir: string | undefined = data.workspace?.project_dir;
  const home = homedir();

  let dirDisplay: string;
  if (projectDir && cwd.startsWith(projectDir) && cwd !== projectDir) {
    dirDisplay = '~/' + path.relative(projectDir, cwd).replace(/\\/g, '/');
  } else if (cwd.startsWith(home)) {
    dirDisplay = '~' + cwd.slice(home.length).replace(/\\/g, '/');
  } else {
    dirDisplay = cwd.replace(/\\/g, '/');
  }

  parts.push(`${dim} in ${dirDisplay}${reset}`);

  const gitInfo = getGitInfo(cwd);
  if (gitInfo) {
    parts.push(`${dim} ${gitInfo}${reset}`);
  }

  const contextInfo = getContextInfo(data.context_window);
  if (contextInfo) {
    parts.push(`${dim} ${contextInfo}${reset}`);
  }

  return parts.join('') + '\n';
}

function getGitInfo(cwd: string): string | null {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });

    const branch = execFileSync('git', ['--no-optional-locks', 'branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();

    if (!branch) return null;

    try {
      execFileSync('git', ['--no-optional-locks', 'diff-index', '--quiet', 'HEAD', '--'], {
        cwd,
        stdio: 'pipe'
      });
      return `(git:${branch})`;
    } catch {
      return `(git:${branch}*)`;
    }
  } catch {
    return null;
  }
}

function getContextInfo(contextWindow: any): string | null {
  if (!contextWindow?.current_usage) return null;

  const usage = contextWindow.current_usage;
  const current = (usage.input_tokens || 0) +
                  (usage.cache_creation_input_tokens || 0) +
                  (usage.cache_read_input_tokens || 0);
  const size = contextWindow.context_window_size;

  if (!size || size === 0) return null;

  const pct = Math.floor((current * 100) / size);
  return `[ctx:${pct}%]`;
}
