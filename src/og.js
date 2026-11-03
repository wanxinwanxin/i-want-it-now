import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './html.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FONTS = [path.join(ROOT, 'assets/fonts/bricolage-800.ttf'), path.join(ROOT, 'assets/fonts/bricolage-500.ttf')];

let Resvg = null;
async function loadResvg() {
  if (!Resvg) ({ Resvg } = await import('@resvg/resvg-js'));
  return Resvg;
}

// Greedy line wrap. The width of a character is an estimate: 0.52 of the font size on average.
function wrap(text, fontSize, maxWidth, maxLines) {
  const perLine = Math.floor(maxWidth / (fontSize * 0.52));
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

function wantSvg(w) {
  const len = w.text.length;
  const size = len < 50 ? 76 : len < 90 ? 64 : len < 140 ? 54 : 46;
  const lines = wrap(w.text, size, 1040, 5);
  const lineH = Math.round(size * 1.12);
  const startY = 210;
  const status = w.status === 'fulfilled' ? 'Fulfilled' : w.status === 'answered' ? `${w.answer_count} answer${w.answer_count === 1 ? '' : 's'}` : 'Open: build it';
  const statusColor = w.status === 'fulfilled' ? '#1f9d55' : w.status === 'answered' ? '#2563eb' : '#ff5a1f';
  // The font has no triangle glyph, so the SVG draws it. The pill width follows the text length.
  const pill = `${w.me_too} want this`;
  const pillW = Math.round(60 + 26 + pill.length * 13.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fbf8f3"/>
  <rect x="0" y="0" width="1200" height="12" fill="#ff5a1f"/>
  <text x="80" y="140" font-family="Bricolage Grotesque" font-weight="800" font-size="44" fill="#ff5a1f">I want</text>
  ${lines.map((l, i) => `<text x="80" y="${startY + i * lineH}" font-family="Bricolage Grotesque" font-weight="800" font-size="${size}" fill="#1b1a17">${esc(l)}</text>`).join('\n  ')}
  <rect x="80" y="512" rx="28" ry="28" width="${pillW}" height="56" fill="#1b1a17"/>
  <polygon points="104,548 116,528 128,548" fill="#ff5a1f"/>
  <text x="140" y="550" font-family="Bricolage Grotesque" font-weight="800" font-size="30" fill="#fbf8f3">${esc(pill)}</text>
  <text x="${80 + pillW + 28}" y="550" font-family="Bricolage Grotesque" font-weight="800" font-size="30" fill="${statusColor}">${esc(status)}</text>
  <text x="1120" y="550" text-anchor="end" font-family="Bricolage Grotesque" font-weight="800" font-size="34" fill="#1b1a17">i want it <tspan fill="#ff5a1f">now</tspan></text>
</svg>`;
}

function siteSvg(stats) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fbf8f3"/>
  <rect x="0" y="0" width="1200" height="12" fill="#ff5a1f"/>
  <text x="80" y="170" font-family="Bricolage Grotesque" font-weight="800" font-size="56" fill="#1b1a17">i want it <tspan fill="#ff5a1f">now</tspan></text>
  <text x="80" y="300" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="#1b1a17">Say exactly what you want.</text>
  <text x="80" y="395" font-family="Bricolage Grotesque" font-weight="800" font-size="82" fill="#ff5a1f">Get it now.</text>
  <text x="80" y="500" font-family="Bricolage Grotesque" font-weight="500" font-size="34" fill="#5c574f">Builders and an AI agent answer with live demos, open-source code,</text>
  <text x="80" y="545" font-family="Bricolage Grotesque" font-weight="500" font-size="34" fill="#5c574f">or tools that already exist. ${stats && stats.wants >= 25 ? `${stats.wants} wants so far.` : ''}</text>
</svg>`;
}

const cache = new Map();

export async function renderOg({ kind, want, stats }) {
  const key = kind === 'want' ? `w:${want.id}:${want.me_too}:${want.status}:${want.answer_count}:${want.text}` : `site:${stats ? stats.wants : ''}`;
  if (cache.has(key)) return cache.get(key);
  const R = await loadResvg();
  const svg = kind === 'want' ? wantSvg(want) : siteSvg(stats);
  const png = new R(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Bricolage Grotesque' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(key, png);
  return png;
}
