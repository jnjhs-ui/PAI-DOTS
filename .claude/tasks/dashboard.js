#!/usr/bin/env node
/**
 * Task Dashboard — Zero-dependency local server for ~/.claude/tasks/
 *
 * Usage: node dashboard.js [--port 3847] [--no-open]
 *
 * Provides:
 *   GET  /              → HTML dashboard (full CRUD UI)
 *   GET  /api/tasks     → JSON array of all tasks
 *   POST /api/tasks     → Create new task (JSON body)
 *   PUT  /api/tasks/:slug → Update task (JSON body)
 *   DELETE /api/tasks/:slug → Delete task
 *
 * Security: Binds to 127.0.0.1 only. All rendered user data is escaped
 * via textContent assignment. No untrusted HTML is injected.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const TASKS_DIR = process.env.TASKS_DIR || path.join(require('os').homedir(), '.claude', 'tasks');
const DEFAULT_PORT = 3847;

// Detect devlog directory — check CWD first, then common project roots
function findDevlogDir() {
  const candidates = [
    path.join(process.cwd(), '.devlog'),
    process.env.DEVLOG_DIR
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}
const DEVLOG_DIR = findDevlogDir();
if (DEVLOG_DIR) console.log('DevLog detected:', DEVLOG_DIR);

function writeFocusEvent(task) {
  if (!DEVLOG_DIR) return false;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const logFile = path.join(DEVLOG_DIR, `${date}.md`);

  // Ensure today's devlog exists
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, `# DevLog: ${date}\n\n## Goal\n[awaiting user direction]\n\n## Constraints\n[none yet]\n\n---\n\n## Session Log\n\n`, 'utf-8');
  }

  // Parse first acceptance criterion from task body
  const { body } = parseFrontmatter(fs.readFileSync(path.join(TASKS_DIR, `${task.slug}.md`), 'utf-8'));
  const criterionMatch = body.match(/- \[ \] (.+)/);
  const success = criterionMatch ? criterionMatch[1] : `${task.title} marked done`;
  const desc = task.description || task.title;

  const event = `### ${time} FOCUS\n**Task:** ${task.title}\n**Intent:** ${desc}\n**File(s):** ~/.claude/tasks/${task.slug}.md\n**Success looks like:** ${success}\n\n`;
  fs.appendFileSync(logFile, event, 'utf-8');

  // Update SESSION.md
  const sessionFile = path.join(DEVLOG_DIR, 'SESSION.md');
  const sessionContent = `# Active Session\n\n**FOCUS:** ${task.title}\n**Intent:** ${desc}\n**File(s):** ~/.claude/tasks/${task.slug}.md\n**Success:** ${success}\n**Started:** ${time}\n\n## Pending Resume\n[none]\n\n## Quick Context\n- Task: ~/.claude/tasks/${task.slug}.md\n- Type: ${task.type || 'chore'} | Priority: ${task.priority || 'medium'} | Tags: ${(task.tags || []).join(', ') || 'none'}\n- ${success}\n`;
  fs.writeFileSync(sessionFile, sessionContent, 'utf-8');

  return true;
}

function writeMilestoneEvent(task) {
  if (!DEVLOG_DIR) return false;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const logFile = path.join(DEVLOG_DIR, `${date}.md`);

  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, `# DevLog: ${date}\n\n## Goal\n[awaiting user direction]\n\n## Constraints\n[none yet]\n\n---\n\n## Session Log\n\n`, 'utf-8');
  }

  const event = `### ${time} MILESTONE\n**Completed:** ${task.title}\n**Files:** ~/.claude/tasks/${task.slug}.md\n\n`;
  fs.appendFileSync(logFile, event, 'utf-8');

  // Clear SESSION.md focus if it matches this task
  const sessionFile = path.join(DEVLOG_DIR, 'SESSION.md');
  if (fs.existsSync(sessionFile)) {
    const session = fs.readFileSync(sessionFile, 'utf-8');
    if (session.includes(task.title)) {
      const sessionContent = `# Active Session\n\n**FOCUS:** Completed: ${task.title}\n**Intent:** [Waiting for next task]\n**File(s):** ~/.claude/tasks/${task.slug}.md\n**Success:** Done\n**Ended:** ${time}\n\n## Pending Resume\n[none]\n\n## Quick Context\n- Completed ${task.title} at ${time}\n`;
      fs.writeFileSync(sessionFile, sessionContent, 'utf-8');
    }
  }

  return true;
}

// --- YAML Frontmatter Parser/Writer ---

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].replace(/\r/g, '').split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val === 'null' || val === '') val = null;
    else if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    meta[m[1]] = val;
  }
  return { meta, body: match[2] };
}

function writeFrontmatter(meta, body) {
  const lines = ['---'];
  const order = ['title', 'status', 'type', 'priority', 'tags', 'project', 'attachments', 'created', 'due', 'done', 'context'];
  for (const key of order) {
    if (!(key in meta)) continue;
    const val = meta[key];
    if (val === null || val === undefined) { lines.push(`${key}: null`); continue; }
    if (Array.isArray(val)) { lines.push(`${key}: [${val.join(', ')}]`); continue; }
    if (typeof val === 'string' && (val.includes(':') || val.includes('#') || val.includes('"') || val.includes("'") || val === ''))
      lines.push(`${key}: "${val.replace(/"/g, '\\"')}"`);
    else lines.push(`${key}: ${val}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

// --- Task CRUD ---

function readAllTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8');
    const { meta, body } = parseFrontmatter(content);
    return { ...meta, slug: f.replace(/\.md$/, ''), filename: f, body };
  }).sort((a, b) => {
    const statusOrder = { active: 0, inprogress: 1, blocked: 2, open: 3, deferred: 4, done: 5 };
    const prioOrder = { high: 0, medium: 1, low: 2 };
    const s = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (s !== 0) return s;
    return (prioOrder[a.priority] ?? 3) - (prioOrder[b.priority] ?? 3);
  });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

function createTask(data) {
  const today = new Date().toISOString().slice(0, 10);
  const slug = `${today}-${slugify(data.title || 'untitled')}`;
  let filename = `${slug}.md`;
  let i = 2;
  while (fs.existsSync(path.join(TASKS_DIR, filename))) {
    filename = `${slug}-${i}.md`;
    i++;
  }
  const meta = {
    title: data.title || 'Untitled',
    status: data.status || 'open',
    type: data.type || 'chore',
    priority: data.priority || 'medium',
    tags: data.tags || [],
    project: data.project || '',
    attachments: data.attachments || [],
    created: today,
    due: data.due || null,
    done: null,
    context: data.context || ''
  };
  let criteriaText = '- [ ] To be defined';
  if (data.criteria && data.criteria.trim()) {
    criteriaText = data.criteria.split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(Boolean)
      .map(l => `- [ ] ${l}`)
      .join('\n');
  }
  const body = `## Description\n${data.description || data.title || ''}\n\n## Acceptance Criteria\n${criteriaText}\n\n## Notes\n- ${today}: Created\n`;
  fs.writeFileSync(path.join(TASKS_DIR, filename), writeFrontmatter(meta, body), 'utf-8');
  return { slug: filename.replace(/\.md$/, ''), filename };
}

function updateTask(slug, updates) {
  const filepath = path.join(TASKS_DIR, `${slug}.md`);
  if (!fs.existsSync(filepath)) return null;
  const content = fs.readFileSync(filepath, 'utf-8');
  const { meta, body } = parseFrontmatter(content);
  for (const [k, v] of Object.entries(updates)) {
    if (k === 'slug' || k === 'filename' || k === 'body') continue;
    meta[k] = v;
  }
  if (updates.status === 'done' && !meta.done) {
    meta.done = new Date().toISOString().slice(0, 10);
  }
  const newBody = updates.body !== undefined ? updates.body : body;
  fs.writeFileSync(filepath, writeFrontmatter(meta, newBody), 'utf-8');
  return { ...meta, slug, filename: `${slug}.md` };
}

function deleteTask(slug) {
  const filepath = path.join(TASKS_DIR, `${slug}.md`);
  if (!fs.existsSync(filepath)) return false;
  fs.unlinkSync(filepath);
  return true;
}

// --- Task Classifier (Heuristic + AI) ---

function classifyHeuristic(title) {
  const lower = title.toLowerCase();
  const result = { type: 'chore', priority: 'medium', tags: [], description: title, criteria: [] };

  // Type detection
  if (/\b(fix|bug|broken|crash|error|fail|issue|wrong|doesn't work|not working)\b/.test(lower)) {
    result.type = 'bug';
    result.priority = 'high';
  } else if (/\b(add|build|create|implement|new|feature|design|support)\b/.test(lower)) {
    result.type = 'feature';
  } else if (/\b(buy|pick up|grocery|errand|shop|order|mail|ship|deliver)\b/.test(lower)) {
    result.type = 'errand';
  } else if (/\b(email|message|call|reply|follow up|reach out|contact|send)\b/.test(lower)) {
    result.type = 'follow-up';
  } else if (/\b(remember|don't forget|remind|note to self)\b/.test(lower)) {
    result.type = 'reminder';
  } else if (/\b(refactor|clean|update|upgrade|migrate|rename|move|reorganize|test|setup|config)\b/.test(lower)) {
    result.type = 'chore';
  }

  // Priority boost
  if (/\b(urgent|asap|critical|emergency|blocker|immediately|now)\b/.test(lower)) {
    result.priority = 'high';
  } else if (/\b(low priority|nice to have|someday|eventually|whenever)\b/.test(lower)) {
    result.priority = 'low';
  }

  // Tag detection
  const tagMap = {
    api: /\b(api|endpoint|route|fetch|request|response|rest|graphql)\b/,
    ui: /\b(ui|button|page|component|style|css|layout|modal|form|design|theme|dark mode)\b/,
    db: /\b(database|db|sql|prisma|schema|migration|query|table|model)\b/,
    security: /\b(security|auth|token|password|encrypt|permission|role|secret|vulnerability)\b/,
    infra: /\b(infra|deploy|ci|cd|pipeline|docker|cloud|server|hosting|azure|aws)\b/,
    test: /\b(test|spec|coverage|jest|vitest|unit test|e2e|integration)\b/,
    docs: /\b(doc|readme|comment|guide|tutorial|changelog)\b/,
    config: /\b(config|env|setting|variable|flag|toggle)\b/,
    personal: /\b(personal|home|family|health|finance|grocery|errand)\b/,
  };
  for (const [tag, pattern] of Object.entries(tagMap)) {
    if (pattern.test(lower)) result.tags.push(tag);
  }

  return result;
}

function enhanceWithCLI(title) {
  return new Promise((resolve) => {
    const prompt = `Classify this task for a task manager. Return ONLY valid JSON, no markdown, no explanation.

Task: "${title}"

Return this exact JSON structure:
{"type":"bug|feature|errand|follow-up|reminder|chore","priority":"high|medium|low","tags":["tag1","tag2"],"description":"expanded 1-2 sentence description","criteria":["criterion 1","criterion 2","criterion 3"]}

Valid types: bug, feature, errand, follow-up, reminder, chore
Valid tags: api, ui, db, security, infra, test, docs, config, sync, installer, personal, health, finance, meeting, learning`;

    const child = require('child_process').exec(
      'claude -p --model haiku',
      { timeout: 30000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return resolve(null);
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.type && parsed.priority) return resolve(parsed);
        resolve(null);
      } catch { resolve(null); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Check if claude CLI is available
let claudeAvailable = false;
require('child_process').exec('claude --version', { timeout: 5000 }, (err) => {
  claudeAvailable = !err;
  if (claudeAvailable) console.log('Claude CLI detected — AI Enhance available');
});

// --- HTTP Server ---

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (url.pathname === '/api/tasks' && method === 'GET') {
    return json(res, readAllTasks());
  }
  if (url.pathname === '/api/tasks' && method === 'POST') {
    const body = await readBody(req);
    const result = createTask(body);
    return json(res, result, 201);
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(.+)$/);
  if (taskMatch && method === 'PUT') {
    const body = await readBody(req);
    const result = updateTask(decodeURIComponent(taskMatch[1]), body);
    return result ? json(res, result) : json(res, { error: 'Not found' }, 404);
  }
  if (taskMatch && method === 'DELETE') {
    const ok = deleteTask(decodeURIComponent(taskMatch[1]));
    return ok ? json(res, { ok: true }) : json(res, { error: 'Not found' }, 404);
  }

  // Classify/enhance endpoint
  if (url.pathname === '/api/classify' && method === 'POST') {
    const body = await readBody(req);
    const title = body.title || '';
    const heuristic = classifyHeuristic(title);
    return json(res, { ...heuristic, source: 'heuristic', aiAvailable: claudeAvailable });
  }
  if (url.pathname === '/api/enhance' && method === 'POST') {
    const body = await readBody(req);
    const title = body.title || '';
    const heuristic = classifyHeuristic(title);
    if (!claudeAvailable) {
      return json(res, { ...heuristic, source: 'heuristic', aiAvailable: false });
    }
    const aiResult = await enhanceWithCLI(title);
    if (aiResult) {
      return json(res, { ...aiResult, source: 'ai', aiAvailable: true });
    }
    return json(res, { ...heuristic, source: 'heuristic-fallback', aiAvailable: true });
  }

  // Focus endpoint — sets task active + writes devlog FOCUS event
  if (url.pathname === '/api/focus' && method === 'POST') {
    const body = await readBody(req);
    const slug = body.slug;
    if (!slug) return json(res, { error: 'slug required' }, 400);

    // Deactivate any currently active tasks
    const allTasks = readAllTasks();
    for (const t of allTasks) {
      if (t.status === 'active' && t.slug !== slug) {
        updateTask(t.slug, { status: 'open' });
      }
    }

    // Activate the target task
    const result = updateTask(slug, { status: 'active' });
    if (!result) return json(res, { error: 'Not found' }, 404);

    // Write devlog FOCUS event
    const devlogWritten = writeFocusEvent(result);
    return json(res, { ...result, devlogWritten });
  }

  // Done endpoint — marks task done + writes devlog MILESTONE event
  if (url.pathname === '/api/done' && method === 'POST') {
    const body = await readBody(req);
    const slug = body.slug;
    if (!slug) return json(res, { error: 'slug required' }, 400);

    const result = updateTask(slug, { status: 'done' });
    if (!result) return json(res, { error: 'Not found' }, 404);

    const devlogWritten = writeMilestoneEvent(result);
    return json(res, { ...result, devlogWritten });
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(DASHBOARD_HTML);
  }

  json(res, { error: 'Not found' }, 404);
});

// --- Dashboard HTML (static template — all dynamic content set via textContent/DOM APIs) ---

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tasks</title>
<style>
  :root {
    --bg: #0f0f0f; --surface: #1a1a1a; --surface2: #242424; --border: #333;
    --text: #e5e5e5; --text2: #999; --accent: #6366f1; --accent2: #818cf8;
    --green: #22c55e; --red: #ef4444; --amber: #f59e0b; --blue: #3b82f6;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .header h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
  .header .date { color: var(--text2); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); font-size: 13px; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
  .btn:hover { border-color: var(--accent); background: #1e1b4b; }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent2); }
  .btn-sm { padding: 3px 8px; font-size: 11px; }
  .btn-danger { border-color: var(--red); color: var(--red); }
  .btn-danger:hover { background: #3b1111; }
  .stats { display: flex; gap: 16px; padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .stat { font-size: 12px; color: var(--text2); }
  .stat strong { color: var(--text); font-size: 16px; margin-right: 4px; }
  .filters { padding: 12px 24px; display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { padding: 4px 12px; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text2); font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .chip.active { border-color: var(--accent); color: var(--accent); background: #1e1b4b; }
  .chip:hover { border-color: var(--accent); }
  .meta-search { padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); font-size: 12px; width: 120px; outline: none; transition: all 0.15s; }
  .meta-search:focus { border-color: var(--accent); width: 160px; }
  .meta-search::placeholder { color: var(--text2); }
  .meta-dropdown { position: absolute; top: 100%; left: 0; margin-top: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; min-width: 180px; max-height: 200px; overflow-y: auto; z-index: 20; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
  .meta-dd-item { padding: 6px 12px; font-size: 12px; cursor: pointer; color: var(--text2); transition: all 0.1s; }
  .meta-dd-item:hover { background: #1e1b4b; color: var(--accent2); }
  .meta-dd-item.active { color: var(--accent); font-weight: 600; }
  .tasks { padding: 12px 24px; display: flex; flex-direction: column; gap: 6px; }
  .task-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; cursor: pointer; transition: all 0.15s; }
  .task-card:hover { border-color: var(--accent); }
  .task-card.expanded { border-color: var(--accent); }
  .task-card.done { opacity: 0.5; }
  .task-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .task-title { flex: 1; font-size: 14px; font-weight: 500; min-width: 120px; }
  .task-card.done .task-title { text-decoration: line-through; color: var(--text2); }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  .badge-open { background: #1e3a5f; color: var(--blue); }
  .badge-active { background: #14532d; color: var(--green); }
  .badge-inprogress { background: #1e1b4b; color: var(--accent2); }
  .badge-done { background: #1a1a1a; color: var(--text2); }
  .badge-blocked { background: #451a03; color: var(--amber); }
  .badge-deferred { background: #1a1a1a; color: var(--text2); }
  .badge-high { background: #3b1111; color: var(--red); }
  .badge-medium { background: #422006; color: var(--amber); }
  .badge-low { background: #1a1a1a; color: var(--text2); }
  .badge-type { background: var(--surface2); color: var(--text2); }
  .tag { padding: 1px 6px; border-radius: 3px; font-size: 10px; background: var(--surface2); color: var(--text2); cursor: pointer; transition: all 0.15s; }
  .tag:hover { border-color: var(--accent); color: var(--accent); background: #1e1b4b; }
  .due { font-size: 11px; color: var(--text2); }
  .due.overdue { color: var(--red); font-weight: 600; }
  .task-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); display: none; }
  .task-card.expanded .task-detail { display: block; }
  .task-detail pre { background: var(--surface2); padding: 12px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; color: var(--text2); overflow-x: auto; max-height: 300px; overflow-y: auto; }
  .task-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; z-index: 100; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
  .modal h2 { font-size: 16px; margin-bottom: 16px; }
  .field { margin-bottom: 12px; }
  .field label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 4px; }
  .field input, .field select, .field textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); font-size: 13px; font-family: inherit; }
  .field textarea { min-height: 80px; resize: vertical; }
  .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--accent); }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .empty { text-align: center; padding: 60px 24px; color: var(--text2); }
  .empty p { margin-top: 8px; font-size: 14px; }
  .view-tabs { display: flex; gap: 4px; padding: 8px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
  .view-tab { padding: 5px 14px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text2); font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .view-tab.active { border-color: var(--accent); color: var(--accent); background: #1e1b4b; }
  .view-tab:hover { color: var(--text); }
  .kanban { padding: 12px 24px; display: flex; gap: 12px; overflow-x: auto; min-height: 300px; }
  .kanban-col { flex: 0 0 260px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; max-height: 70vh; }
  .kanban-col-header { padding: 10px 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); border-bottom: 1px solid var(--border); }
  .kanban-col-body { padding: 8px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1; }
  .kanban-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; cursor: pointer; transition: border-color 0.15s; font-size: 12px; }
  .kanban-card:hover { border-color: var(--accent); }
  .kanban-card-title { font-weight: 500; font-size: 13px; margin-bottom: 4px; }
  .kanban-card-meta { display: flex; gap: 4px; flex-wrap: wrap; }
  .calendar { padding: 12px 24px; }
  .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .cal-header h3 { font-size: 15px; font-weight: 500; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .cal-day-header { background: var(--surface); padding: 6px; font-size: 11px; text-align: center; color: var(--text2); font-weight: 600; }
  .cal-day { background: var(--surface); padding: 4px 6px; min-height: 80px; font-size: 11px; vertical-align: top; }
  .cal-day.other-month { opacity: 0.3; }
  .cal-day.today { background: #1e1b4b; }
  .cal-day-num { color: var(--text2); margin-bottom: 2px; }
  .cal-task { background: var(--surface2); border-radius: 3px; padding: 2px 4px; margin-bottom: 2px; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .cal-task:hover { background: var(--accent); color: #fff; }
  .cal-task.cal-due { border-left: 2px solid var(--amber); }
  .cal-task.cal-done { opacity: 0.4; text-decoration: line-through; }
  .add-criterion { display: flex; gap: 6px; margin-top: 6px; }
  .add-criterion input { flex: 1; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); font-size: 12px; font-family: inherit; }
  .add-criterion input:focus { outline: none; border-color: var(--accent); }
  @media (max-width: 600px) { .header, .stats, .filters, .tasks, .kanban, .calendar, .view-tabs { padding-left: 12px; padding-right: 12px; } .kanban-col { flex: 0 0 220px; } }
</style>
</head>
<body>
<div class="header">
  <div><h1>Tasks</h1><div class="date" id="today-date"></div></div>
  <button class="btn btn-primary" id="new-btn">+ New Task</button>
</div>
<div class="stats" id="stats"></div>
<div class="view-tabs" id="view-tabs">
  <button class="view-tab active" data-view="list">List</button>
  <button class="view-tab" data-view="kanban">Kanban</button>
  <button class="view-tab" data-view="calendar">Calendar</button>
</div>
<div class="filters" id="filters"></div>
<div class="tasks" id="task-list"></div>
<div class="kanban" id="kanban-view" style="display:none"></div>
<div class="calendar" id="calendar-view" style="display:none"></div>
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h2 id="modal-title">New Task</h2>
    <div id="nlp-form">
      <div class="field">
        <label>Describe your task</label>
        <textarea id="f-nlp" placeholder="e.g. Fix the login redirect bug by Friday, high priority" style="min-height:80px;resize:vertical"></textarea>
        <div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.6">Just type naturally. AI will auto-detect type, priority, tags, and generate acceptance criteria.<br>Try: &quot;Add dark mode support&quot; &middot; &quot;Fix crash on login, urgent&quot; &middot; &quot;Buy new monitor by next week&quot;</div>
        <div id="classify-status" style="font-size:11px;color:var(--accent2);margin-top:4px;display:none"></div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Create</button>
      </div>
    </div>
    <div id="edit-form" style="display:none">
      <div class="field"><label>Title</label><input id="f-title" placeholder="What needs to be done?"></div>
      <div style="display:flex;gap:12px">
        <div class="field" style="flex:1"><label>Type</label>
          <select id="f-type"><option>bug</option><option>feature</option><option>errand</option><option>follow-up</option><option>reminder</option><option selected>chore</option></select>
        </div>
        <div class="field" style="flex:1"><label>Priority</label>
          <select id="f-priority"><option>high</option><option selected>medium</option><option>low</option></select>
        </div>
      </div>
      <div style="display:flex;gap:12px">
        <div class="field" style="flex:1"><label>Due Date</label><input id="f-due" type="date"></div>
        <div class="field" style="flex:1"><label>Project</label><input id="f-project" placeholder="e.g. my-project"></div>
      </div>
      <div class="field"><label>Tags (comma-separated)</label><input id="f-tags" placeholder="e.g. api, security"></div>
      <div class="field"><label>Attachments (one path/URL per line)</label><textarea id="f-attachments" rows="3" placeholder="C:/path/to/file.pdf&#10;https://link.com/doc"></textarea></div>
      <div class="field"><label>Description</label><textarea id="f-desc" placeholder="Details..."></textarea></div>
      <div class="modal-actions">
        <button class="btn" id="edit-cancel">Cancel</button>
        <button class="btn btn-primary" id="edit-save">Save</button>
      </div>
    </div>
  </div>
</div>
<script>
// All dynamic content uses safe DOM APIs (createElement + textContent).
// No raw HTML string injection — user data is never interpreted as markup.

let tasks = [];
let filter = 'all';
let editingSlug = null;
let currentView = 'list';
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
const expandedSlugs = new Set();

const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return m + '/' + d + '/' + y;
}

async function fetchTasks() {
  const res = await fetch('/api/tasks');
  tasks = await res.json();
  renderCurrentView();
}

function renderCurrentView() {
  $('task-list').style.display = currentView === 'list' ? '' : 'none';
  $('kanban-view').style.display = currentView === 'kanban' ? '' : 'none';
  $('calendar-view').style.display = currentView === 'calendar' ? '' : 'none';
  $('filters').style.display = currentView === 'list' ? '' : 'none';
  if (currentView === 'list') render();
  else if (currentView === 'kanban') renderKanban();
  else if (currentView === 'calendar') renderCalendar();
}

function render() {
  const today = new Date().toISOString().slice(0, 10);
  $('today-date').textContent = formatDate(today);

  const filtered = filter === 'all' ? tasks :
    filter === 'overdue' ? tasks.filter(t => t.status !== 'done' && t.due && t.due < today) :
    filter === 'active' ? tasks.filter(t => t.status === 'active') :
    filter === 'inprogress' ? tasks.filter(t => t.status === 'inprogress') :
    filter.startsWith('tag:') ? tasks.filter(t => Array.isArray(t.tags) && t.tags.includes(filter.slice(4))) :
    filter.startsWith('project:') ? tasks.filter(t => t.project === filter.slice(8)) :
    tasks.filter(t => t.type === filter);

  // Stats
  const counts = { active: 0, inprogress: 0, open: 0, blocked: 0, done: 0, overdue: 0 };
  tasks.forEach(t => {
    if (t.status in counts) counts[t.status]++;
    if (t.status !== 'done' && t.due && t.due < today) counts.overdue++;
  });
  const statsEl = $('stats');
  statsEl.replaceChildren();
  for (const [key, val] of Object.entries(counts)) {
    if (key === 'overdue' && val === 0) continue;
    const div = el('div', 'stat');
    const strong = el('strong', null, String(val));
    div.appendChild(strong);
    div.appendChild(document.createTextNode(key));
    if (key === 'overdue') div.style.color = 'var(--red)';
    statsEl.appendChild(div);
  }

  // Filters
  const filtersEl = $('filters');
  filtersEl.replaceChildren();
  ['all','active','inprogress','overdue','bug','feature','errand','follow-up','reminder','chore'].forEach(f => {
    const btn = el('button', 'chip' + (filter === f ? ' active' : ''), f);
    btn.addEventListener('click', () => { filter = f; render(); });
    filtersEl.appendChild(btn);
  });
  // Dynamic meta: search box + 5 most-recent chips diversified by project
  const metaEntries = []; // { key, label, date, project }
  tasks.forEach(t => {
    const d = t.created || '2000-01-01';
    if (t.project) metaEntries.push({ key: 'project:' + t.project, label: t.project, date: d, project: t.project });
    if (Array.isArray(t.tags)) t.tags.forEach(tag => metaEntries.push({ key: 'tag:' + tag, label: '#' + tag, date: d, project: t.project || '' }));
  });
  // Dedupe keeping the most recent date per key
  const metaMap = {};
  metaEntries.forEach(e => {
    if (!metaMap[e.key] || e.date > metaMap[e.key].date) metaMap[e.key] = e;
  });
  // Sort by most recent, diversify across projects (pick from different projects first)
  const sorted = Object.values(metaMap).sort((a, b) => b.date.localeCompare(a.date));
  const picked = [];
  const seenProjects = new Set();
  // First pass: one per project
  for (const entry of sorted) {
    if (picked.length >= 5) break;
    if (!seenProjects.has(entry.project)) {
      picked.push(entry);
      seenProjects.add(entry.project);
    }
  }
  // Second pass: fill remaining slots
  for (const entry of sorted) {
    if (picked.length >= 5) break;
    if (!picked.includes(entry)) picked.push(entry);
  }

  if (sorted.length > 0) {
    const sep = el('span', null, '|');
    sep.style.cssText = 'color:var(--border);margin:0 2px;';
    filtersEl.appendChild(sep);
  }
  // Show the picked chips
  picked.forEach(entry => {
    const btn = el('button', 'chip' + (filter === entry.key ? ' active' : ''), entry.label);
    btn.addEventListener('click', () => { filter = entry.key; render(); });
    filtersEl.appendChild(btn);
  });
  // Search box for all tags/projects
  if (sorted.length > 5) {
    const searchWrap = el('span', 'meta-search-wrap');
    searchWrap.style.cssText = 'position:relative;display:inline-block;margin-left:4px;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'filter tags...';
    searchInput.className = 'meta-search';
    searchInput.value = '';
    searchInput.addEventListener('click', ev => ev.stopPropagation());
    const dropdown = el('div', 'meta-dropdown');
    dropdown.style.display = 'none';

    function showDropdown(query) {
      dropdown.replaceChildren();
      const q = query.toLowerCase();
      const matches = sorted.filter(e => e.label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
      if (matches.length === 0) {
        const empty = el('div', 'meta-dd-item', 'No matches');
        empty.style.cssText = 'color:var(--text2);font-style:italic;';
        dropdown.appendChild(empty);
      } else {
        matches.slice(0, 10).forEach(entry => {
          const item = el('div', 'meta-dd-item' + (filter === entry.key ? ' active' : ''), entry.label);
          item.addEventListener('click', ev => {
            ev.stopPropagation();
            filter = entry.key;
            dropdown.style.display = 'none';
            searchInput.value = '';
            render();
          });
          dropdown.appendChild(item);
        });
      }
      dropdown.style.display = '';
    }

    searchInput.addEventListener('focus', () => showDropdown(searchInput.value));
    searchInput.addEventListener('input', () => showDropdown(searchInput.value));
    searchInput.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
    searchInput.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { searchInput.blur(); dropdown.style.display = 'none'; }
    });
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(dropdown);
    filtersEl.appendChild(searchWrap);
  }

  // Task list
  const listEl = $('task-list');
  listEl.replaceChildren();

  if (filtered.length === 0) {
    const empty = el('div', 'empty');
    const p = el('p', null, filter !== 'all' ? 'No tasks matching "' + filter + '"' : 'No tasks');
    empty.appendChild(p);
    listEl.appendChild(empty);
    return;
  }

  filtered.forEach(t => {
    const isOverdue = t.status !== 'done' && t.due && t.due < today;
    const card = el('div', 'task-card' + (t.status === 'done' ? ' done' : ''));
    card.id = 'card-' + t.slug;

    // Row
    const row = el('div', 'task-row');
    row.appendChild(el('span', 'badge badge-' + t.status, t.status));
    row.appendChild(el('span', 'badge badge-' + t.priority, t.priority));
    row.appendChild(el('span', 'badge badge-type', t.type || ''));
    row.appendChild(el('span', 'task-title', t.title || t.slug));

    if (Array.isArray(t.tags)) {
      t.tags.forEach(tag => {
        const tagEl = el('span', 'tag', '#' + tag);
        tagEl.addEventListener('click', ev => { ev.stopPropagation(); filter = 'tag:' + tag; render(); });
        row.appendChild(tagEl);
      });
    }
    if (t.due) {
      const dueSpan = el('span', 'due' + (isOverdue ? ' overdue' : ''), (isOverdue ? 'OVERDUE ' : 'due ') + formatDate(t.due));
      row.appendChild(dueSpan);
    }
    if (t.project) {
      const projEl = el('span', 'tag', t.project);
      projEl.addEventListener('click', ev => { ev.stopPropagation(); filter = 'project:' + t.project; render(); });
      row.appendChild(projEl);
    }
    card.appendChild(row);

    // Detail (expandable)
    const detail = el('div', 'task-detail');

    // Parse body into sections: description, acceptance criteria, notes
    const bodyText = (t.body || '').replace(/\\r/g, '');
    const criteriaRegex = /^- \\[([ xX])\\] (.+)$/gm;
    const criteria = [];
    let m2;
    while ((m2 = criteriaRegex.exec(bodyText)) !== null) {
      criteria.push({ checked: m2[1] !== ' ', text: m2[2], index: m2.index });
    }
    const allChecked = criteria.length > 0 && criteria.every(c => c.checked);
    const hasCriteria = criteria.length > 0;

    // Render description (text before ## Acceptance Criteria)
    const descMatch = bodyText.match(/## Description\\n([\\s\\S]*?)(?=\\n## |$)/);
    if (descMatch && descMatch[1].trim()) {
      const descEl = el('div', 'task-desc');
      descEl.style.cssText = 'margin-bottom:10px;font-size:13px;color:var(--text2);';
      descEl.textContent = descMatch[1].trim();
      detail.appendChild(descEl);
    }

    // Render acceptance criteria as interactive checkboxes
    if (hasCriteria) {
      const acHeader = el('div', null);
      acHeader.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
      const acLabel = el('span', null, 'Acceptance Criteria');
      acLabel.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text2);letter-spacing:0.05em;';
      acHeader.appendChild(acLabel);

      if (criteria.length > 1) {
        const selAllBtn = el('button', 'btn btn-sm', allChecked ? 'Uncheck All' : 'Check All');
        selAllBtn.addEventListener('click', ev => {
          ev.stopPropagation();
          toggleAllCriteria(t.slug, t.body || '', !allChecked);
        });
        acHeader.appendChild(selAllBtn);
      }

      const progress = el('span', null, criteria.filter(c => c.checked).length + '/' + criteria.length);
      progress.style.cssText = 'font-size:11px;color:' + (allChecked ? 'var(--green)' : 'var(--text2)') + ';margin-left:auto;';
      acHeader.appendChild(progress);
      detail.appendChild(acHeader);

      const acList = el('div', 'ac-list');
      acList.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px;';
      criteria.forEach((c, i) => {
        const row = el('label', 'ac-row');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 8px;border-radius:4px;background:var(--surface2);';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = c.checked;
        cb.style.cssText = 'cursor:pointer;accent-color:var(--accent);';
        cb.addEventListener('click', ev => {
          ev.stopPropagation();
          toggleCriterion(t.slug, t.body || '', i, ev.target.checked);
        });
        row.appendChild(cb);
        const txt = el('span', null, c.text);
        if (c.checked) txt.style.cssText = 'text-decoration:line-through;color:var(--text2);';
        row.appendChild(txt);
        row.addEventListener('click', ev => ev.stopPropagation());
        acList.appendChild(row);
      });
      detail.appendChild(acList);
    }

    // Add criterion input (always show in expanded view)
    if (t.status !== 'done') {
      const addRow = el('div', 'add-criterion');
      const addInput = document.createElement('input');
      addInput.type = 'text';
      addInput.placeholder = 'Add checklist item...';
      addInput.addEventListener('click', ev => ev.stopPropagation());
      addInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && addInput.value.trim()) {
          ev.stopPropagation();
          addCriterion(t.slug, t.body || '', addInput.value.trim());
          addInput.value = '';
        }
      });
      addRow.appendChild(addInput);
      const addBtn = el('button', 'btn btn-sm', '+ Add');
      addBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        if (addInput.value.trim()) {
          addCriterion(t.slug, t.body || '', addInput.value.trim());
          addInput.value = '';
        }
      });
      addRow.appendChild(addBtn);
      addRow.addEventListener('click', ev => ev.stopPropagation());
      detail.appendChild(addRow);
    }

    // Render notes section
    const notesMatch = bodyText.match(/## Notes\\n([\\s\\S]*?)$/);
    if (notesMatch && notesMatch[1].trim()) {
      const notesLabel = el('div', null, 'Notes');
      notesLabel.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text2);letter-spacing:0.05em;margin-bottom:4px;';
      detail.appendChild(notesLabel);
      const notesEl = el('pre', null, notesMatch[1].trim());
      notesEl.style.cssText = 'background:var(--surface2);padding:8px;border-radius:6px;font-size:12px;white-space:pre-wrap;color:var(--text2);margin-bottom:10px;';
      detail.appendChild(notesEl);
    }

    // Render attachments
    if (Array.isArray(t.attachments) && t.attachments.length > 0) {
      const attLabel = el('div', null, 'Attachments');
      attLabel.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text2);letter-spacing:0.05em;margin-bottom:4px;';
      detail.appendChild(attLabel);
      const attList = el('div', 'att-list');
      attList.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:10px;';
      t.attachments.forEach(att => {
        const link = document.createElement('a');
        link.textContent = att.replace(/.*[\\\\/]/, '');
        link.href = att.startsWith('http') ? att : 'file:///' + att.replace(/\\\\/g, '/');
        link.target = '_blank';
        link.style.cssText = 'font-size:12px;color:var(--accent2);text-decoration:none;padding:3px 6px;border-radius:4px;background:var(--surface2);display:inline-block;';
        link.title = att;
        link.addEventListener('click', ev => ev.stopPropagation());
        attList.appendChild(link);
      });
      detail.appendChild(attList);
    }

    const actions = el('div', 'task-actions');
    if (t.status === 'done') {
      const reopenBtn = el('button', 'btn btn-sm', 'Reopen');
      reopenBtn.addEventListener('click', ev => { ev.stopPropagation(); reopenTask(t.slug); });
      actions.appendChild(reopenBtn);
    } else {
      const doneBtn = el('button', 'btn btn-sm', 'Mark Done');
      if (hasCriteria && !allChecked) {
        doneBtn.style.cssText = 'opacity:0.4;cursor:not-allowed;';
        doneBtn.title = 'Complete all acceptance criteria first';
        doneBtn.addEventListener('click', ev => { ev.stopPropagation(); });
      } else {
        doneBtn.addEventListener('click', ev => { ev.stopPropagation(); markDone(t.slug); });
      }
      actions.appendChild(doneBtn);
    }
    if (t.status === 'open' || t.status === 'blocked') {
      const progressBtn = el('button', 'btn btn-sm', 'Start');
      progressBtn.addEventListener('click', ev => { ev.stopPropagation(); setInProgress(t.slug); });
      actions.appendChild(progressBtn);
    }
    if (t.status === 'inprogress') {
      const focusBtn = el('button', 'btn btn-sm', 'Focus');
      focusBtn.addEventListener('click', ev => { ev.stopPropagation(); setFocus(t.slug); });
      actions.appendChild(focusBtn);
      const pauseBtn = el('button', 'btn btn-sm', 'Pause');
      pauseBtn.addEventListener('click', ev => { ev.stopPropagation(); unfocus(t.slug); });
      actions.appendChild(pauseBtn);
    }
    if (t.status === 'active') {
      const unfocusBtn = el('button', 'btn btn-sm', 'Unfocus');
      unfocusBtn.addEventListener('click', ev => { ev.stopPropagation(); unfocusToInProgress(t.slug); });
      actions.appendChild(unfocusBtn);
    }
    const editBtn = el('button', 'btn btn-sm', 'Edit');
    editBtn.addEventListener('click', ev => { ev.stopPropagation(); openEditModal(t.slug); });
    actions.appendChild(editBtn);
    const delBtn = el('button', 'btn btn-sm btn-danger', 'Delete');
    delBtn.addEventListener('click', ev => { ev.stopPropagation(); delTask(t.slug); });
    actions.appendChild(delBtn);

    detail.appendChild(actions);
    card.appendChild(detail);

    if (expandedSlugs.has(t.slug)) card.classList.add('expanded');
    card.addEventListener('click', () => {
      card.classList.toggle('expanded');
      if (card.classList.contains('expanded')) expandedSlugs.add(t.slug);
      else expandedSlugs.delete(t.slug);
    });
    listEl.appendChild(card);
  });
}

async function toggleCriterion(slug, body, index, checked) {
  let i = 0;
  const newBody = body.replace(/- \\[[ xX]\\] .+/g, (match) => {
    if (i++ === index) {
      return checked ? match.replace('- [ ]', '- [x]') : match.replace(/- \\[[xX]\\]/, '- [ ]');
    }
    return match;
  });
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: newBody })
  });
  await fetchTasks();
}

async function addCriterion(slug, body, text) {
  // Insert new criterion before ## Notes section, or at end of criteria
  let newBody;
  const notesIdx = body.indexOf('## Notes');
  const newLine = '- [ ] ' + text;
  if (notesIdx > 0) {
    newBody = body.slice(0, notesIdx).trimEnd() + '\\n' + newLine + '\\n\\n' + body.slice(notesIdx);
  } else {
    newBody = body.trimEnd() + '\\n' + newLine + '\\n';
  }
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: newBody })
  });
  await fetchTasks();
}

async function toggleAllCriteria(slug, body, checkAll) {
  const newBody = checkAll
    ? body.replace(/- \\[ \\]/g, '- [x]')
    : body.replace(/- \\[[xX]\\]/g, '- [ ]');
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: newBody })
  });
  await fetchTasks();
}

async function markDone(slug) {
  await fetch('/api/done', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug })
  });
  await fetchTasks();
}

async function reopenTask(slug) {
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'open', done: null })
  });
  await fetchTasks();
}

async function setFocus(slug) {
  await fetch('/api/focus', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug })
  });
  await fetchTasks();
}

async function setInProgress(slug) {
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'inprogress' })
  });
  await fetchTasks();
}

async function unfocus(slug) {
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'open' })
  });
  await fetchTasks();
}

async function unfocusToInProgress(slug) {
  await fetch('/api/tasks/' + encodeURIComponent(slug), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'inprogress' })
  });
  await fetchTasks();
}

async function delTask(slug) {
  if (!confirm('Delete this task?')) return;
  await fetch('/api/tasks/' + encodeURIComponent(slug), { method: 'DELETE' });
  await fetchTasks();
}

function openNewModal() {
  editingSlug = null;
  $('modal-title').textContent = 'New Task';
  $('nlp-form').style.display = '';
  $('edit-form').style.display = 'none';
  $('f-nlp').value = '';
  $('classify-status').style.display = 'none';
  $('modal').classList.add('show');
  setTimeout(() => $('f-nlp').focus(), 100);
}

function openEditModal(slug) {
  const t = tasks.find(x => x.slug === slug);
  if (!t) return;
  editingSlug = slug;
  $('modal-title').textContent = 'Edit Task';
  $('nlp-form').style.display = 'none';
  $('edit-form').style.display = '';
  $('f-title').value = t.title || '';
  $('f-type').value = t.type || 'chore';
  $('f-priority').value = t.priority || 'medium';
  $('f-due').value = t.due || '';
  $('f-project').value = t.project || '';
  $('f-tags').value = Array.isArray(t.tags) ? t.tags.join(', ') : '';
  $('f-attachments').value = Array.isArray(t.attachments) ? t.attachments.join('\\n') : '';
  $('f-desc').value = '';
  $('modal').classList.add('show');
  setTimeout(() => $('f-title').focus(), 100);
}

function closeModal() {
  $('modal').classList.remove('show');
  editingSlug = null;
}

async function saveTask() {
  if (editingSlug) {
    // Edit mode — read from full form
    const data = {
      title: $('f-title').value.trim(),
      type: $('f-type').value,
      priority: $('f-priority').value,
      due: $('f-due').value || null,
      project: $('f-project').value.trim(),
      tags: $('f-tags').value.split(',').map(s => s.trim()).filter(Boolean),
      attachments: $('f-attachments').value.split('\\n').map(s => s.trim()).filter(Boolean),
      description: $('f-desc').value.trim()
    };
    if (!data.title) { $('f-title').focus(); return; }
    await fetch('/api/tasks/' + encodeURIComponent(editingSlug), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } else {
    // New task — NLP mode: enhance then create
    const nlp = $('f-nlp').value.trim();
    if (!nlp) { $('f-nlp').focus(); return; }

    const status = $('classify-status');
    const saveBtn = $('modal-save');
    status.style.display = '';
    status.textContent = 'Classifying...';
    saveBtn.textContent = 'Creating...';
    saveBtn.disabled = true;

    try {
      const res = await fetch('/api/enhance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nlp })
      });
      const ai = await res.json();
      const data = {
        title: ai.description || nlp,
        type: ai.type || 'chore',
        priority: ai.priority || 'medium',
        tags: Array.isArray(ai.tags) ? ai.tags : [],
        description: nlp,
        criteria: Array.isArray(ai.criteria) ? ai.criteria.map(c => '- ' + c).join('\\n') : ''
      };
      status.textContent = ai.source === 'ai' ? 'Enhanced by Claude' : 'Classified';
      await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch {
      // Fallback: create with just the title
      await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nlp, type: 'chore', priority: 'medium', tags: [], description: nlp })
      });
    }
    saveBtn.textContent = 'Create';
    saveBtn.disabled = false;
  }
  closeModal();
  await fetchTasks();
}

// --- Kanban View ---

function renderKanban() {
  const today = new Date().toISOString().slice(0, 10);
  $('today-date').textContent = formatDate(today);

  // Stats
  const counts = { active: 0, inprogress: 0, open: 0, blocked: 0, done: 0 };
  tasks.forEach(t => { if (t.status in counts) counts[t.status]++; });
  const statsEl = $('stats');
  statsEl.replaceChildren();
  for (const [key, val] of Object.entries(counts)) {
    const div = el('div', 'stat');
    div.appendChild(el('strong', null, String(val)));
    div.appendChild(document.createTextNode(key));
    statsEl.appendChild(div);
  }

  const columns = [
    { id: 'active', label: 'Active', color: 'var(--green)' },
    { id: 'inprogress', label: 'In Progress', color: 'var(--accent2)' },
    { id: 'open', label: 'Open', color: 'var(--blue)' },
    { id: 'blocked', label: 'Blocked', color: 'var(--amber)' },
    { id: 'done', label: 'Done', color: 'var(--text2)' },
    { id: 'deferred', label: 'Deferred', color: 'var(--text2)' }
  ];

  const container = $('kanban-view');
  container.replaceChildren();

  columns.forEach(col => {
    const colTasks = tasks.filter(t => t.status === col.id);
    if (col.id === 'done' && colTasks.length === 0 && columns.some(c => c.id !== 'done')) return;
    if (col.id === 'deferred' && colTasks.length === 0) return;
    if (col.id === 'inprogress' && colTasks.length === 0) return;

    const colEl = el('div', 'kanban-col');
    const header = el('div', 'kanban-col-header', col.label + ' (' + colTasks.length + ')');
    header.style.borderLeft = '3px solid ' + col.color;
    colEl.appendChild(header);

    const body = el('div', 'kanban-col-body');
    colTasks.forEach(t => {
      const card = el('div', 'kanban-card');
      const title = el('div', 'kanban-card-title', t.title || t.slug);
      card.appendChild(title);

      const meta = el('div', 'kanban-card-meta');
      meta.appendChild(el('span', 'badge badge-' + t.priority, t.priority));
      meta.appendChild(el('span', 'badge badge-type', t.type || ''));
      if (t.due) meta.appendChild(el('span', 'due' + (t.due < today && t.status !== 'done' ? ' overdue' : ''), formatDate(t.due)));
      if (t.project) meta.appendChild(el('span', 'tag', t.project));
      card.appendChild(meta);

      card.addEventListener('click', () => {
        currentView = 'list';
        switchView('list');
        expandedSlugs.add(t.slug);
        renderCurrentView();
        setTimeout(() => {
          const cardEl = document.getElementById('card-' + t.slug);
          if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      });
      body.appendChild(card);
    });
    colEl.appendChild(body);
    container.appendChild(colEl);
  });
}

// --- Calendar View ---

function renderCalendar() {
  const today = new Date().toISOString().slice(0, 10);
  $('today-date').textContent = formatDate(today);

  // Stats
  const counts = { active: 0, inprogress: 0, open: 0, blocked: 0, done: 0 };
  tasks.forEach(t => { if (t.status in counts) counts[t.status]++; });
  const statsEl = $('stats');
  statsEl.replaceChildren();
  for (const [key, val] of Object.entries(counts)) {
    const div = el('div', 'stat');
    div.appendChild(el('strong', null, String(val)));
    div.appendChild(document.createTextNode(key));
    statsEl.appendChild(div);
  }

  const container = $('calendar-view');
  container.replaceChildren();

  // Month navigation
  const header = el('div', 'cal-header');
  const prevBtn = el('button', 'btn btn-sm', '<');
  prevBtn.addEventListener('click', () => { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); });
  const nextBtn = el('button', 'btn btn-sm', '>');
  nextBtn.addEventListener('click', () => { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); });
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const title = el('h3', null, monthNames[calendarMonth] + ' ' + calendarYear);
  header.appendChild(prevBtn);
  header.appendChild(title);
  header.appendChild(nextBtn);
  container.appendChild(header);

  // Calendar grid
  const grid = el('div', 'cal-grid');

  // Day headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    grid.appendChild(el('div', 'cal-day-header', d));
  });

  // Calculate days
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const daysInPrev = new Date(calendarYear, calendarMonth, 0).getDate();

  // Index tasks by date (created + due)
  const tasksByDate = {};
  tasks.forEach(t => {
    if (t.created) {
      if (!tasksByDate[t.created]) tasksByDate[t.created] = [];
      tasksByDate[t.created].push({ ...t, calType: 'created' });
    }
    if (t.due && t.due !== t.created) {
      if (!tasksByDate[t.due]) tasksByDate[t.due] = [];
      tasksByDate[t.due].push({ ...t, calType: 'due' });
    }
  });

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayEl = el('div', 'cal-day other-month');
    dayEl.appendChild(el('div', 'cal-day-num', String(daysInPrev - i)));
    grid.appendChild(dayEl);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isToday = dateStr === today;
    const dayEl = el('div', 'cal-day' + (isToday ? ' today' : ''));
    dayEl.appendChild(el('div', 'cal-day-num', String(d)));

    const dayTasks = tasksByDate[dateStr] || [];
    dayTasks.slice(0, 3).forEach(t => {
      const taskEl = el('div', 'cal-task' + (t.calType === 'due' ? ' cal-due' : '') + (t.status === 'done' ? ' cal-done' : ''));
      taskEl.textContent = t.title || t.slug;
      taskEl.title = (t.calType === 'due' ? 'Due: ' : 'Created: ') + t.title;
      taskEl.addEventListener('click', () => {
        currentView = 'list';
        switchView('list');
        expandedSlugs.add(t.slug);
        renderCurrentView();
      });
      dayEl.appendChild(taskEl);
    });
    if (dayTasks.length > 3) {
      dayEl.appendChild(el('div', 'cal-task', '+' + (dayTasks.length - 3) + ' more'));
    }
    grid.appendChild(dayEl);
  }

  // Next month padding
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const dayEl = el('div', 'cal-day other-month');
    dayEl.appendChild(el('div', 'cal-day-num', String(i)));
    grid.appendChild(dayEl);
  }

  container.appendChild(grid);
}

// --- View Switching ---

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  renderCurrentView();
}

// Event listeners
$('new-btn').addEventListener('click', openNewModal);
$('modal-cancel').addEventListener('click', closeModal);
$('edit-cancel').addEventListener('click', closeModal);
$('modal-save').addEventListener('click', saveTask);
$('edit-save').addEventListener('click', saveTask);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
$('f-nlp').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTask(); }
});
document.querySelectorAll('.view-tab').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) openNewModal();
});

setInterval(fetchTasks, 10000);
fetchTasks();
</script>
</body>
</html>`;

// --- Start ---

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : DEFAULT_PORT;
const noOpen = args.includes('--no-open');

if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

const host = args.includes('--host') ? args[args.indexOf('--host') + 1] : '127.0.0.1';

server.listen(port, host, () => {
  const url = 'http://' + host + ':' + port;
  console.log('Task dashboard running at ' + url);
  console.log('Tasks directory: ' + TASKS_DIR);
  console.log('Press Ctrl+C to stop\\n');

  if (!noOpen) {
    if (process.platform === 'win32') {
      execFile('cmd', ['/c', 'start', '', url], () => {});
    } else if (process.platform === 'darwin') {
      execFile('open', [url], () => {});
    } else {
      execFile('xdg-open', [url], () => {});
    }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + port + ' is in use. Try: node dashboard.js --port ' + (port + 1));
    process.exit(1);
  }
  throw err;
});
