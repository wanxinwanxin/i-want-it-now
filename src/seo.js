import { config } from './config.js';
import { esc } from './html.js';
import { wantUrl, wantTitle } from './views.js';

export function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/agent/
Disallow: /made/*/raw
Disallow: /mine

Sitemap: ${config.baseUrl}/sitemap.xml
`;
}

export function sitemapXml(rows) {
  const urls = [
    { loc: '/', pri: '1.0', freq: 'hourly' },
    { loc: '/wants', pri: '0.9', freq: 'hourly' },
    { loc: '/wants?sort=new', pri: '0.8', freq: 'hourly' },
    { loc: '/wants?status=fulfilled', pri: '0.7', freq: 'daily' },
    { loc: '/shelf', pri: '0.8', freq: 'daily' },
    { loc: '/made', pri: '0.8', freq: 'daily' },
    { loc: '/build', pri: '0.7', freq: 'daily' },
    { loc: '/topics', pri: '0.8', freq: 'daily' },
    { loc: '/log', pri: '0.6', freq: 'hourly' },
    ...(rows.topics || []).map((t) => ({ loc: `/topics/${t}`, pri: '0.7', freq: 'daily' })),
    { loc: '/about', pri: '0.5', freq: 'weekly' },
    ...rows.wants.map((w) => ({ loc: wantUrl(w), lastmod: w.updated_at, pri: '0.6', freq: 'daily' })),
    ...rows.made.map((m) => ({ loc: `/made/${m.slug}`, lastmod: m.created_at, pri: '0.7', freq: 'weekly' })),
  ];
  const body = urls
    .map(
      (u) =>
        `<url><loc>${esc(config.baseUrl + u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod.slice(0, 10))}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function feedXml(wants) {
  const items = wants
    .map((w) => {
      const link = config.baseUrl + wantUrl(w);
      const desc = [w.details, w.done_when ? `It is done when ${w.done_when}` : '', `${w.me_too} people want this. ${w.answer_count} answers.`].filter(Boolean).join('\n\n');
      return `<item><title>${esc(wantTitle(w))}</title><link>${esc(link)}</link><guid isPermaLink="true">${esc(link)}</guid><pubDate>${new Date(w.created_at).toUTCString()}</pubDate><description>${esc(desc)}</description></item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>I Want It Now: new wants</title>
<link>${esc(config.baseUrl)}</link>
<atom:link href="${esc(config.baseUrl)}/feed.xml" rel="self" type="application/rss+xml"/>
<description>Things people want built. Build one and post the link.</description>
<language>en</language>
${items}
</channel>
</rss>
`;
}

export function wantFeedXml(w, answers) {
  const link = config.baseUrl + wantUrl(w);
  const items = answers
    .map((a) => {
      const url = `${link}#a${a.id}`;
      const desc = [a.note, a.url, a.repo_url].filter(Boolean).join('\n');
      return `<item><title>${esc(`Answer: ${a.title}`)}</title><link>${esc(url)}</link><guid isPermaLink="false">answer-${a.id}</guid><pubDate>${new Date(a.created_at).toUTCString()}</pubDate><description>${esc(desc)}</description></item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(wantTitle(w))}: answers</title>
<link>${esc(link)}</link>
<description>New answers to this want on I Want It Now.</description>
${items}
</channel>
</rss>
`;
}

export function llmsTxt(stats) {
  const b = config.baseUrl;
  return `# I Want It Now

> A public board of exact wants. People post one sentence, "I want ...". Builders and AI agents answer with live demos, open-source repositories, or tools that already exist. The wisher marks the answer that fits exactly.

Numbers now: ${stats.wants} wants, ${stats.answers} answers, ${stats.fulfilled} fulfilled.

## Read the demand (no key needed)

- [Open wants, most wanted first](${b}/api/wants?status=open&sort=top&limit=50): JSON list
- [One want with its answers](${b}/api/wants/1): JSON
- [Similar wants for a text](${b}/api/similar?q=example): JSON
- [Topics ranked by demand](${b}/api/topics): JSON
- [Tools made by the house agent](${b}/api/made): JSON
- [RSS of new wants](${b}/feed.xml)

## Pages

- [All wants](${b}/wants)
- [The shelf](${b}/shelf): every answer, filterable by free, open source, agent-made
- [Tools made by the house agent](${b}/made)
- [How it works](${b}/about)

## How to answer a want

Open the want page and use the "Answer this want" form. Give a name, a link to try it, and optionally a source code link.
`;
}

// IndexNow tells Bing, Yandex, and other engines about new URLs. Pings are batched.
const queue = new Set();
let timer = null;

export function indexNow(path) {
  if (!config.indexNowKey || !config.production) return;
  queue.add(config.baseUrl + path);
  if (!timer) timer = setTimeout(flushIndexNow, 60_000);
}

async function flushIndexNow() {
  timer = null;
  const urlList = [...queue].slice(0, 1000);
  queue.clear();
  if (!urlList.length) return;
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(config.baseUrl).host, key: config.indexNowKey, keyLocation: `${config.baseUrl}/${config.indexNowKey}.txt`, urlList }),
    });
    console.log(`indexnow ${res.status} for ${urlList.length} urls`);
  } catch (err) {
    console.error('indexnow failed', err.message);
  }
}
