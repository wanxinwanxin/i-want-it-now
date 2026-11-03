export function slugify(text, max = 60) {
  const s = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= max) return s || 'want';
  return s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max);
}

// People often type "I want" in the box that already says "I want". Remove it.
// A common capitalized first word ("A", "The", "Something") becomes lowercase. Names and acronyms stay.
const LOWER_FIRST = /^(A|An|The|Some|Something|Software|Tool|App|Way|Simple|One|Website|Page|Site|Script|Browser|Bot)\b/;

export function cleanWantText(text) {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^i\s+(really\s+)?(want|need|wish (there was|there were|for|i had))\s*:?\s*/i, '');
  t = t.replace(/^someone (please )?(build|make)\s+/i, '');
  if (LOWER_FIRST.test(t)) t = t[0].toLowerCase() + t.slice(1);
  return t.replace(/[\s.]+$/, '');
}

export function cleanLine(text, max) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanBlock(text, max) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

export function cleanUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return undefined;
  if (!u.hostname.includes('.')) return undefined;
  if (s.length > 500) return undefined;
  return u.toString();
}

export function isRepoUrl(url) {
  return /^https:\/\/(www\.)?(github\.com|gitlab\.com|codeberg\.org|bitbucket\.org|sr\.ht|git\.sr\.ht)\//i.test(url || '');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

const STOP = new Set(
  'a an the and or of to for in on at by with from that this these those it its is are be was were i me my we our you your they them their can could would should will just want need wish there some something tool app apps website site thing way simple easy which what when where who how into than then also only like using use uses get gets lets let make makes so as if not no but all any each every more most other very one two'.split(
    ' ',
  ),
);

export function keywords(text, max = 12) {
  const words = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, max);
}

// Build a safe FTS5 query: each keyword becomes a quoted prefix term, joined with OR.
export function ftsQuery(text) {
  const words = keywords(text);
  if (!words.length) return null;
  return words.map((w) => `"${w}"*`).join(' OR ');
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
