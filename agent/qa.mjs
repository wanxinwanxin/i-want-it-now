#!/usr/bin/env node
// QA for agent-made tools on the live site.
// For each tool: load it in a sandboxed iframe at 375px and 1280px, click the first
// "example", "sample", "try", or "demo" button, and report errors and sideways scroll.
//
// Usage: node agent/qa.mjs [base-url]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = (process.argv[2] || process.env.IWIN_BASE || 'https://iwantitnow.up.railway.app').replace(/\/$/, '');

function findChromium() {
  const root = path.join(process.env.HOME, '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
    for (const sub of ['chrome-linux-arm64/chrome', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const p = path.join(root, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('no chromium found');
}

const SHELL = `<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups" style="width:100%;height:900px;border:0"></iframe></body></html>`;

async function check(browser, html, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource|Blocked autofocusing/i.test(m.text())) errors.push(m.text().slice(0, 160));
  });
  await page.setContent(SHELL);
  await page.$eval('#f', (el, src) => (el.srcdoc = src), html);
  await page.waitForTimeout(2000);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  let clicked = null;
  const btn = frame.getByRole('button', { name: /example|sample|try|demo/i }).first();
  if (await btn.count()) {
    clicked = (await btn.innerText()).trim().slice(0, 40);
    await btn.click({ timeout: 5000 }).catch((e) => errors.push(`click: ${e.message.slice(0, 120)}`));
    await page.waitForTimeout(3000);
  }
  const info = await frame.evaluate(() => ({ text: document.body.innerText.length, overflow: document.documentElement.scrollWidth - window.innerWidth }));
  await page.close();
  return { errors, clicked, text: info.text, overflow: info.overflow };
}

const { made } = await (await fetch(`${BASE}/api/made`)).json();
const browser = await chromium.launch({ executablePath: findChromium() });
let bad = 0;
for (const m of made) {
  const html = await (await fetch(`${BASE}/made/${m.slug}/raw`)).text();
  const phone = await check(browser, html, 375);
  const desk = await check(browser, html, 1280);
  const problems = [...new Set([...phone.errors, ...desk.errors])];
  if (phone.overflow > 8) problems.push(`scrolls sideways by ${phone.overflow}px at 375px`);
  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${m.slug.padEnd(32)} clicked=${JSON.stringify(desk.clicked)} text=${desk.text}${problems.length ? `\n     ${problems.join('\n     ')}` : ''}`);
}
await browser.close();
console.log(`${made.length} tools, ${bad} with problems`);
process.exit(bad ? 1 : 0);
