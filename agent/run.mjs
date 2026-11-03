#!/usr/bin/env node
// House agent for I Want It Now.
//
// Usage:
//   node agent/run.mjs            run forever: answer queued wants, scan Hacker News every hour
//   node agent/run.mjs --once     answer one queued want, then stop
//   node agent/run.mjs --scan     scan Hacker News once, then stop
//   node agent/run.mjs --dry      do the work, but post nothing to the site
//   node agent/run.mjs --thread <hn-id> [max]   import wants from one HN thread
//   node agent/run.mjs --thumbs   add screenshots to agent pages that have none
//
// Safety: each Claude call runs with --restricted. The research step has only WebSearch and WebFetch.
// The build step and the triage step have no tools. No step can read files or run commands on this machine.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchPrompt, buildPrompt, fixPrompt, triagePrompt } from './prompts.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(DIR, '..', '.env.local'));

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const BASE = (process.env.IWIN_BASE || 'https://iwantitnow.up.railway.app').replace(/\/$/, '');
const TOKEN = process.env.AGENT_TOKEN;
const WORK = path.join(DIR, 'work');
const LOGS = path.join(DIR, 'logs');
const STATE_FILE = process.env.AGENT_STATE || path.join(DIR, 'state.json');
const CFG = {
  buildsPerDay: Number(process.env.AGENT_BUILDS_PER_DAY || 30),
  researchPerDay: Number(process.env.AGENT_RESEARCH_PER_DAY || 80),
  importsPerDay: Number(process.env.AGENT_IMPORTS_PER_DAY || 6),
  pollSec: Number(process.env.AGENT_POLL_SEC || 60),
  scanEveryMin: Number(process.env.AGENT_SCAN_EVERY_MIN || 90),
  modelResearch: process.env.AGENT_MODEL_RESEARCH || 'sonnet',
  modelBuild: process.env.AGENT_MODEL_BUILD || 'opus',
  modelTriage: process.env.AGENT_MODEL_TRIAGE || 'sonnet',
  // High effort made large builds run past the time limit. Medium keeps the quality and finishes in time.
  buildEffort: process.env.AGENT_BUILD_EFFORT || 'medium',
};

if (!TOKEN) {
  console.error('AGENT_TOKEN is not set. Put it in .env.local.');
  process.exit(1);
}
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(' ')}`;
  console.log(line);
  fs.appendFileSync(path.join(LOGS, 'agent.log'), `${line}\n`);
}

// ---------- State: daily counters and seen HN ids ----------

function loadState() {
  let s = {};
  try {
    s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    /* first run */
  }
  const today = new Date().toISOString().slice(0, 10);
  if (s.day !== today) Object.assign(s, { day: today, builds: 0, research: 0, imports: 0, cost: 0 });
  s.seenHn ||= [];
  s.failures ||= {};
  s.lastScan ||= 0;
  return s;
}

function saveState(s) {
  s.seenHn = s.seenHn.slice(-5000);
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
}

// ---------- Site API ----------

async function api(method, p, body) {
  if (DRY && method !== 'GET') {
    log('DRY', method, p, JSON.stringify(body || {}).slice(0, 400));
    return { ok: true, dry: true };
  }
  // A deploy restarts the site for a few seconds. Retry network errors and 5xx answers, so that finished work is not lost.
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(BASE + p, {
        method,
        headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (attempt < 6) {
        log(`api ${method} ${p}: ${err.message}, retry ${attempt}`);
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status >= 500 && attempt < 6) {
      log(`api ${method} ${p}: ${res.status}, retry ${attempt}`);
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${JSON.stringify(data)}`);
    return data;
  }
}

// ---------- Claude ----------

function claudeEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/TOKEN|SECRET|KEY/i.test(k) && k !== 'CLAUDE_CONFIG_DIR') delete env[k];
  return env;
}

function claude(prompt, { tools = '', model, effort = null, timeoutMs = 10 * 60_000, tag = 'claude' }) {
  const jobDir = fs.mkdtempSync(path.join(WORK, `${tag}-`));
  const argv = ['-p', '--restricted', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json', '--model', model];
  if (effort) argv.push('--effort', effort);
  argv.push('--tools', tools);
  if (tools) argv.push('--allowedTools', ...tools.split(','));
  return new Promise((resolve, reject) => {
    const child = spawn('claude', argv, { cwd: jobDir, env: claudeEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${tag} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.rmSync(jobDir, { recursive: true, force: true });
      let data;
      try {
        data = JSON.parse(out);
      } catch {
        return reject(new Error(`${tag} exit ${code}: ${(err || out).slice(0, 500)}`));
      }
      if (data.is_error) return reject(new Error(`${tag} error: ${String(data.result).slice(0, 500)}`));
      resolve({ text: String(data.result || ''), cost: data.total_cost_usd || 0 });
    });
    child.stdin.end(prompt);
  });
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  const candidates = [fenced && fenced[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.search(/[[{]/);
    if (start < 0) continue;
    const open = c[start];
    const close = open === '{' ? '}' : ']';
    const end = c.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      /* try next */
    }
  }
  return null;
}

function extractHtml(text) {
  const m = text.match(/```html\s*([\s\S]*?)```/);
  const html = (m ? m[1] : text).trim();
  return /<html|<body|<!doctype/i.test(html) ? html : null;
}

// ---------- Smoke test: run the page in a sandboxed iframe, like the site does ----------

let chromiumPath = null;
function findChromium() {
  if (chromiumPath !== null) return chromiumPath;
  const root = path.join(process.env.HOME, '.cache/ms-playwright');
  chromiumPath = '';
  try {
    for (const d of fs.readdirSync(root).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
      for (const sub of ['chrome-linux-arm64/chrome', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return (chromiumPath = p);
      }
    }
  } catch {
    /* none */
  }
  return chromiumPath;
}

async function smokeTest(html) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    return { skipped: 'playwright-core is not installed', errors: [] };
  }
  const exe = findChromium();
  if (!exe) return { skipped: 'no chromium', errors: [] };
  const browser = await chromium.launch({ executablePath: exe });
  const errors = [];
  try {
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/favicon|Failed to load resource|Blocked autofocusing/i.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      const shell = `<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups" style="width:100%;height:800px;border:0"></iframe></body></html>`;
      await page.setContent(shell);
      await page.$eval('#f', (el, src) => (el.srcdoc = src), html);
      await page.waitForTimeout(2500);
      const frame = page.frames().find((f) => f !== page.mainFrame());
      const info = frame ? await frame.evaluate(() => ({ text: document.body ? document.body.innerText.length : 0, overflow: document.documentElement.scrollWidth - window.innerWidth })) : { text: 0, overflow: 0 };
      if (info.text < 40) errors.push(`page shows almost no text at width ${width}`);
      if (width === 375 && info.overflow > 8) errors.push(`page scrolls sideways by ${info.overflow}px at 375px width`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return { errors: [...new Set(errors)].slice(0, 10) };
}

// A 1200x630 JPEG of the page, for the shelf and for social previews.
async function thumbnail(html) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    return null;
  }
  const exe = findChromium();
  if (!exe) return null;
  const browser = await chromium.launch({ executablePath: exe });
  try {
    // 800x420 at 1.5x gives a 1200x630 image with larger content.
    const page = await browser.newPage({ viewport: { width: 800, height: 420 }, deviceScaleFactor: 1.5 });
    await page.setContent(`<!doctype html><html><body style="margin:0;overflow:hidden"><iframe id="f" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups" style="width:800px;height:420px;border:0;display:block"></iframe></body></html>`);
    await page.$eval('#f', (el, src) => (el.srcdoc = src), html);
    await page.waitForTimeout(3000);
    const buf = await page.screenshot({ type: 'jpeg', quality: 78 });
    return buf.length < 400_000 ? buf.toString('base64') : null;
  } catch (err) {
    log(`thumbnail failed: ${err.message}`);
    return null;
  } finally {
    await browser.close();
  }
}

// ---------- Work on one want ----------

async function work(w, state) {
  log(`want #${w.id}: I want ${w.text}`);
  const claimed = await api('POST', `/api/agent/claim/${w.id}`);
  if (!claimed.ok && !DRY) return log(`want #${w.id}: claim failed, skipping`);

  // 1. Research
  state.research++;
  let research = null;
  for (let attempt = 1; attempt <= 2 && !research; attempt++) {
    try {
      const r = await claude(researchPrompt(w), { tools: 'WebSearch,WebFetch', model: CFG.modelResearch, timeoutMs: 8 * 60_000, tag: `research-${w.id}` });
      state.cost += r.cost;
      research = extractJson(r.text);
      if (!research) log(`want #${w.id}: research returned no JSON: ${r.text.slice(0, 200)}`);
    } catch (err) {
      log(`want #${w.id}: research failed: ${err.message}`);
    }
  }
  if (!research) {
    state.failures[w.id] = (state.failures[w.id] || 0) + 1;
    if (state.failures[w.id] >= 3) await api('POST', `/api/agent/result/${w.id}`, { state: 'skipped', note: 'The agent could not finish this want. A human builder can still answer it.' });
    else await api('POST', `/api/agent/reset/${w.id}`);
    return;
  }
  if (research.safety === 'reject') {
    log(`want #${w.id}: rejected: ${research.reject_reason}`);
    return api('POST', `/api/agent/result/${w.id}`, { state: 'skipped', note: 'The agent does not work on this kind of want.' });
  }
  const existing = (research.existing || []).filter((e) => e && (e.url || e.repo_url)).slice(0, 3);
  log(`want #${w.id}: ${existing.length} existing, buildable=${research.buildable}: ${research.reason || ''}`);

  // 2. Build
  let made = null;
  if (research.buildable && state.builds < CFG.buildsPerDay) {
    state.builds++;
    try {
      const r = await claude(buildPrompt(w, research), { tools: '', model: CFG.modelBuild, effort: CFG.buildEffort, timeoutMs: 20 * 60_000, tag: `build-${w.id}` });
      state.cost += r.cost;
      const meta = extractJson(r.text) || {};
      let html = extractHtml(r.text.replace(/```json[\s\S]*?```/, ''));
      if (html) {
        let test = await smokeTest(html);
        if (test.errors.length) {
          log(`want #${w.id}: smoke errors: ${test.errors.join(' | ')}`);
          const fx = await claude(fixPrompt(w, html, test.errors), { tools: '', model: CFG.modelBuild, effort: CFG.buildEffort, timeoutMs: 20 * 60_000, tag: `fix-${w.id}` });
          state.cost += fx.cost;
          const fixed = extractHtml(fx.text);
          if (fixed) {
            html = fixed;
            test = await smokeTest(html);
          }
        }
        if (test.errors.length) log(`want #${w.id}: still has errors after fix, not posting the page: ${test.errors.join(' | ')}`);
        else
          made = {
            title: meta.title || 'Untitled tool',
            summary: meta.summary || '',
            note: meta.note || meta.summary || '',
            howto: Array.isArray(meta.howto) ? meta.howto : [],
            html,
            thumb_jpg: await thumbnail(html),
          };
        if (test.skipped) log(`want #${w.id}: smoke test skipped: ${test.skipped}`);
      } else log(`want #${w.id}: build returned no HTML`);
    } catch (err) {
      log(`want #${w.id}: build failed: ${err.message}`);
    }
  }

  // 3. Post
  const parts = [];
  if (existing.length) parts.push(`Found ${existing.length} existing tool${existing.length === 1 ? '' : 's'}.`);
  if (made) parts.push('Built a one-page version.');
  let stateOut = 'done';
  if (!research.buildable) {
    parts.push(research.reason ? `One web page cannot do this: ${research.reason}` : 'One web page cannot do this.');
    if (!existing.length) stateOut = 'needs_human';
  } else if (!made && !existing.length) stateOut = 'needs_human';
  const res = await api('POST', `/api/agent/result/${w.id}`, { state: stateOut, note: parts.join(' ').slice(0, 480), existing, made, topics: research.topics });
  log(`want #${w.id}: posted (${stateOut}) ${made ? `made=${res.made ? res.made.slug : '?'}` : ''}`);
}

// ---------- Scan Hacker News for wants ----------

const HN_PHRASES = ['i wish there was', 'i wish there were', 'someone should build', 'someone should make', 'i would pay for', "i'd pay for", 'is there a tool that', 'why is there no app', 'i wish someone would build', 'does anyone know a tool'];

function stripHtml(s) {
  return String(s || '')
    .replace(/<p>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .trim();
}

async function scanHn(state) {
  if (state.imports >= CFG.importsPerDay) return log('scan: daily import limit reached');
  const since = Math.floor(Date.now() / 1000) - 4 * 86400;
  const seen = new Set(state.seenHn);
  const candidates = [];
  for (const q of HN_PHRASES) {
    try {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(`"${q}"`)}&tags=comment&hitsPerPage=25&numericFilters=created_at_i>${since}`;
      const data = await (await fetch(url)).json();
      for (const h of data.hits || []) {
        if (seen.has(h.objectID)) continue;
        const text = stripHtml(h.comment_text);
        if (text.length < 60 || text.length > 2500 || !text.toLowerCase().includes(q.replace("i'd", 'i'))) continue;
        seen.add(h.objectID);
        candidates.push({ id: h.objectID, author: h.author, text });
      }
    } catch (err) {
      log(`scan: query "${q}" failed: ${err.message}`);
    }
  }
  state.seenHn.push(...candidates.map((c) => c.id));
  log(`scan: ${candidates.length} new candidate comments`);
  if (!candidates.length) return;
  let picks = [];
  try {
    const r = await claude(triagePrompt(candidates.slice(0, 40)), { tools: '', model: CFG.modelTriage, timeoutMs: 6 * 60_000, tag: 'triage' });
    state.cost += r.cost;
    picks = extractJson(r.text) || [];
  } catch (err) {
    return log(`scan: triage failed: ${err.message}`);
  }
  const byId = new Map(candidates.map((c) => [c.id, c]));
  for (const p of (Array.isArray(picks) ? picks : []).filter((p) => Number(p.quality) >= 7)) {
    if (state.imports >= CFG.importsPerDay) break;
    const c = byId.get(String(p.id));
    if (!c || !p.want) continue;
    try {
      const r = await api('POST', '/api/agent/wants', {
        text: p.want,
        details: p.details || '',
        done_when: p.done_when || '',
        author: `${c.author} (HN)`,
        source: 'hn',
        source_url: `https://news.ycombinator.com/item?id=${c.id}`,
      });
      if (!r.duplicate) state.imports++;
      log(`scan: imported HN ${c.id} -> #${r.id}: ${p.want}`);
    } catch (err) {
      log(`scan: import failed: ${err.message}`);
    }
  }
}

// ---------- Import wants from one "what do you wish existed" thread ----------

async function importThread(id, state, maxImports) {
  const item = await (await fetch(`https://hn.algolia.com/api/v1/items/${id}`)).json();
  const seen = new Set(state.seenHn);
  const candidates = (item.children || [])
    .filter((c) => c.text && c.author && !seen.has(String(c.id)))
    .map((c) => ({ id: String(c.id), author: c.author, text: stripHtml(c.text), points: c.points || 0 }))
    .filter((c) => c.text.length >= 40 && c.text.length <= 3000);
  log(`thread ${id} "${item.title}": ${candidates.length} new top-level comments`);
  let imported = 0;
  for (let i = 0; i < candidates.length && imported < maxImports; i += 40) {
    const batch = candidates.slice(i, i + 40);
    state.seenHn.push(...batch.map((c) => c.id));
    let picks = [];
    try {
      const r = await claude(triagePrompt(batch, 8), { tools: '', model: CFG.modelTriage, timeoutMs: 6 * 60_000, tag: 'triage' });
      state.cost += r.cost;
      picks = extractJson(r.text) || [];
    } catch (err) {
      log(`thread ${id}: triage failed: ${err.message}`);
      continue;
    }
    const byId = new Map(batch.map((c) => [c.id, c]));
    for (const p of (Array.isArray(picks) ? picks : []).filter((p) => Number(p.quality) >= 7)) {
      if (imported >= maxImports) break;
      const c = byId.get(String(p.id));
      if (!c || !p.want) continue;
      try {
        const r = await api('POST', '/api/agent/wants', {
          text: p.want,
          details: p.details || '',
          done_when: p.done_when || '',
          author: `${c.author} (HN)`,
          source: 'hn',
          source_url: `https://news.ycombinator.com/item?id=${c.id}`,
        });
        if (!r.duplicate) imported++;
        log(`thread ${id}: imported ${c.id} -> #${r.id}: ${p.want}`);
      } catch (err) {
        log(`thread ${id}: import failed: ${err.message}`);
      }
    }
  }
  return imported;
}

// ---------- Main loop ----------

async function tick() {
  const state = loadState();
  try {
    if (args.has('--scan') || (!args.has('--once') && Date.now() - state.lastScan > CFG.scanEveryMin * 60_000)) {
      state.lastScan = Date.now();
      saveState(state);
      await scanHn(state);
      saveState(state);
      if (args.has('--scan')) return false;
    }
    if (state.research >= CFG.researchPerDay) {
      log('daily research limit reached');
      return true;
    }
    const { wants } = await api('GET', '/api/agent/queue?limit=1');
    if (!wants || !wants.length) return true;
    await work(wants[0], state);
    return !args.has('--once');
  } catch (err) {
    log(`tick failed: ${err.message}`);
    return !args.has('--once');
  } finally {
    saveState(state);
  }
}

log(`agent start: base=${BASE} dry=${DRY} limits=${JSON.stringify(CFG)}`);
if (args.has('--thumbs')) {
  const { made } = await api('GET', '/api/made');
  for (const m of made.filter((x) => !x.thumb)) {
    const html = await (await fetch(`${BASE}/made/${m.slug}/raw`)).text();
    const thumb = await thumbnail(html);
    if (thumb) await api('POST', `/api/agent/made/${m.slug}/thumb`, { thumb_jpg: thumb });
    log(`thumb ${m.slug}: ${thumb ? 'ok' : 'failed'}`);
  }
  process.exit(0);
}
const threadArg = process.argv.indexOf('--thread');
if (threadArg > 0) {
  const state = loadState();
  const max = Number(process.argv[threadArg + 2]) || 10;
  const n = await importThread(process.argv[threadArg + 1], state, max);
  saveState(state);
  log(`thread import done: ${n} wants`);
  process.exit(0);
}
for (;;) {
  const keepGoing = await tick();
  if (!keepGoing || args.has('--once') || args.has('--scan')) break;
  await new Promise((r) => setTimeout(r, CFG.pollSec * 1000));
}
log('agent stop');
