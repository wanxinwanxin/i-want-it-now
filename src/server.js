import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hmac } from './config.js';
import { openDb } from './db.js';
import { createStore } from './store.js';
import * as views from './views.js';
import * as seo from './seo.js';
import { cleanWantText, cleanLine, cleanBlock, cleanUrl, isRepoUrl, slugify } from './util.js';
import { renderOg } from './og.js';
import { TOPICS, TOPIC_BY_SLUG, cleanTopics } from './topics.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python-requests|httpclient|headless/i;

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function wantsJson(req) {
  return req.get('x-ajax') === '1' || (req.get('accept') || '').includes('application/json');
}

function publicWant(w) {
  return {
    id: w.id,
    text: w.text,
    title: views.wantTitle(w),
    details: w.details,
    done_when: w.done_when,
    status: w.status,
    me_too: w.me_too,
    answers: w.answer_count,
    agent_state: w.agent_state,
    source: w.source,
    source_url: w.source_url,
    url: config.baseUrl + views.wantUrl(w),
    created_at: w.created_at,
    updated_at: w.updated_at,
  };
}

function publicAnswer(a) {
  return {
    id: a.id,
    kind: a.made_slug ? 'agent' : a.kind,
    title: a.title,
    url: a.made_slug ? `${config.baseUrl}/made/${a.made_slug}` : a.url,
    repo_url: a.repo_url,
    note: a.note,
    author: a.by_agent ? 'house agent' : a.author || null,
    is_free: a.is_free == null ? null : Boolean(a.is_free),
    is_open_source: a.is_open_source == null ? null : Boolean(a.is_open_source),
    works: a.works,
    not_a_fit: a.nofit,
    created_at: a.created_at,
  };
}

export function createApp({ store }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const smallBody = [express.urlencoded({ extended: false, limit: '32kb' }), express.json({ limit: '32kb' })];
  const bigBody = express.json({ limit: '3mb' });

  // Security headers for every response. Agent-made pages get a stricter policy on their own route.
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!req.path.endsWith('/raw')) {
      res.set('X-Frame-Options', 'SAMEORIGIN');
      // The site itself loads only its own script. Agent-made pages get their own policy on the /raw route.
      res.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'",
      );
    }
    next();
  });

  app.use(
    express.static(path.join(ROOT, 'public'), {
      maxAge: config.production ? '7d' : 0,
      setHeaders(res, file) {
        if (file.endsWith('.css') || file.endsWith('.js')) res.set('Cache-Control', 'public, max-age=604800, immutable');
      },
    }),
  );

  // One random id per browser. The database stores only a keyed hash of it.
  app.use((req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    let uid = cookies.iwin;
    if (!uid || !/^[a-f0-9]{32}$/.test(uid)) {
      uid = crypto.randomBytes(16).toString('hex');
      res.cookie('iwin', uid, { httpOnly: true, sameSite: 'lax', secure: config.production, maxAge: 2 * 365 * 864e5, path: '/' });
      req.newVisitor = true;
    }
    req.voter = hmac(`u:${uid}`);
    req.ipKey = hmac(`ip:${req.ip}`);
    req.isBot = BOT_RE.test(req.get('user-agent') || '');
    next();
  });

  // Daily counters for page views and referrers. No personal data.
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !/\.(png|svg|ico|css|js|txt|xml)$/.test(req.path) && !req.path.endsWith('/raw')) {
      res.on('finish', () => {
        if (res.statusCode >= 400) return;
        try {
          const key = req.path.replace(/^\/w\/\d+.*/, '/w/:id').replace(/^\/made\/[^/]+$/, '/made/:slug');
          store.hit(req.isBot ? 'bot' : 'page', key);
          const ref = req.get('referer');
          if (!req.isBot && ref) {
            const host = new URL(ref).hostname.replace(/^www\./, '');
            if (host && host !== new URL(config.baseUrl).hostname) store.hit('ref', host);
          }
          const utm = req.query.utm_source || req.query.ref;
          if (!req.isBot && typeof utm === 'string') store.hit('utm', utm.slice(0, 60));
        } catch {
          /* counters never break a request */
        }
      });
    }
    next();
  });

  // Cross-site form posts are rejected. Same-site posts carry an Origin or Referer of this host.
  function sameOrigin(req, res, next) {
    const origin = req.get('origin') || req.get('referer');
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.get('host')) return next();
    } catch {
      /* fall through */
    }
    return res.status(403).json({ error: 'Cross-site request refused.' });
  }

  function limit(name, max, windowSec) {
    return (req, res, next) => {
      if (store.rateLimit(`${name}:${req.ipKey}`, max, windowSec)) return next();
      const msg = 'Too many requests. Wait a few minutes and try again.';
      if (wantsJson(req)) return res.status(429).json({ error: msg });
      const p = views.messagePage({ title: 'Slow down', message: msg, status: 429, back: req.get('referer') || '/' });
      return res.status(p.status).send(String(p.html));
    };
  }

  function fail(req, res, status, message, back) {
    if (wantsJson(req)) return res.status(status).json({ error: message });
    const p = views.messagePage({ title: status === 404 ? 'Not found' : 'That did not work', message, status, back: back || req.get('referer') || '/' });
    return res.status(p.status).send(String(p.html));
  }

  function bearer(token) {
    return (req, res, next) => {
      const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (token && got && got.length === token.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token))) return next();
      return res.status(401).json({ error: 'Unauthorized' });
    };
  }

  const myMeToos = (wants, voter) => new Set(wants.filter((w) => store.hasMeToo(w.id, voter)).map((w) => w.id));
  const send = (res, page) => res.type('html').send(String(page));

  // ---------- Pages ----------

  app.get('/', (req, res) => {
    const fresh = store.listWants({ sort: 'new', limit: 8 });
    const freshIds = new Set(fresh.map((w) => w.id));
    const top = store.listWants({ sort: 'top', status: 'open', limit: 16 }).filter((w) => !freshIds.has(w.id)).slice(0, 8);
    const shelf = store.shelf({ limit: 6 });
    send(res, views.homePage({ stats: store.stats(), fresh, top, shelf, mine: myMeToos([...fresh, ...top], req.voter) }));
  });

  app.get('/wants', (req, res) => {
    const sort = ['hot', 'new', 'top'].includes(req.query.sort) ? req.query.sort : 'hot';
    const status = ['open', 'answered', 'fulfilled'].includes(req.query.status) ? req.query.status : '';
    const q = cleanLine(req.query.q, 100);
    const page = Math.max(1, Math.min(200, Number(req.query.page) || 1));
    const per = 30;
    const rows = store.listWants({ sort: q && sort === 'hot' ? 'relevance' : sort, status: status || null, q: q || null, limit: per + 1, offset: (page - 1) * per });
    const wants = rows.slice(0, per);
    send(res, views.wantsPage({ wants, mine: myMeToos(wants, req.voter), sort, status, q, page, hasMore: rows.length > per }));
  });

  app.post('/wants', smallBody, sameOrigin, limit('want-h', 6, 3600), limit('want-d', 20, 86400), (req, res) => {
    if (req.body.website) return res.redirect(303, '/');
    const text = cleanWantText(req.body.text).slice(0, 200);
    if (text.length < 8 || text.split(' ').length < 2) return fail(req, res, 400, 'Say a little more. Finish the sentence “I want …” with at least a few words.');
    if ((text.match(/https?:\/\//g) || []).length > 1) return fail(req, res, 400, 'Put links in the details, not in the want itself.');
    const { id } = store.createWant({
      text,
      details: cleanBlock(req.body.details, 2000),
      done_when: cleanLine(req.body.done_when, 200).replace(/^it is done when\s*/i, ''),
      author: cleanLine(req.body.author, 40),
      creator: req.voter,
      ip: req.ipKey,
      source: 'site',
    });
    const w = store.getWant(id);
    seo.indexNow(views.wantUrl(w));
    if (wantsJson(req)) return res.status(201).json({ id, url: views.wantUrl(w) });
    res.redirect(303, `${views.wantUrl(w)}?new=1`);
  });

  // One RSS feed for each want, so that the wisher can follow new answers in a feed reader.
  app.get('/w/:id/feed.xml', (req, res) => {
    const w = store.getWant(Number(req.params.id));
    if (!w || w.hidden) return res.status(404).type('text').send('Not found');
    res.type('application/rss+xml').send(seo.wantFeedXml(w, store.answersFor(w.id)));
  });

  app.get('/w/:id{/:slug}', (req, res) => {
    const id = Number(req.params.id);
    const w = Number.isInteger(id) ? store.getWant(id) : null;
    if (!w || w.hidden) return fail(req, res, 404, 'This want does not exist, or a moderator hid it.', '/wants');
    if (req.params.slug !== w.slug) return res.redirect(301, views.wantUrl(w));
    const answers = store.answersFor(id);
    const related = store.similarWants(`${w.text} ${w.details}`, { excludeId: id, limit: 5 });
    send(
      res,
      views.wantPage({
        w,
        answers,
        myVotes: store.myVotes(id, req.voter),
        on: store.hasMeToo(id, req.voter),
        isCreator: Boolean(w.creator && w.creator === req.voter),
        related,
        created: req.query.new === '1',
        topics: store.topicsFor(id),
      }),
    );
  });


  function loadWant(req, res) {
    const w = store.getWant(Number(req.params.id));
    if (!w || w.hidden) {
      fail(req, res, 404, 'This want does not exist.');
      return null;
    }
    return w;
  }

  app.post('/w/:id/metoo', smallBody, sameOrigin, limit('metoo', 120, 3600), (req, res) => {
    const w = loadWant(req, res);
    if (!w) return;
    const r = store.toggleMeToo(w.id, req.voter);
    if (wantsJson(req)) return res.json(r);
    res.redirect(303, req.get('referer') || views.wantUrl(w));
  });

  app.post('/w/:id/answers', smallBody, sameOrigin, limit('answer-h', 10, 3600), limit('answer-d', 40, 86400), (req, res) => {
    const w = loadWant(req, res);
    if (!w) return;
    if (req.body.website) return res.redirect(303, views.wantUrl(w));
    const back = `${views.wantUrl(w)}#answer`;
    const url = cleanUrl(req.body.url);
    const repo = cleanUrl(req.body.repo_url);
    if (url === undefined || repo === undefined) return fail(req, res, 400, 'One of the links is not a valid web address. Use a full link that starts with https://', back);
    if (!url && !repo) return fail(req, res, 400, 'Add a link to try it, or a link to the source code.', back);
    const title = cleanLine(req.body.title, 80);
    if (title.length < 2) return fail(req, res, 400, 'Give the thing a name.', back);
    const kind = req.body.kind === 'existing' ? 'existing' : 'built';
    const repoUrl = repo || (url && isRepoUrl(url) ? url : null);
    const id = store.addAnswer({
      want_id: w.id,
      kind,
      title,
      url: url && url !== repoUrl ? url : null,
      repo_url: repoUrl,
      note: cleanBlock(req.body.note, 1000),
      author: cleanLine(req.body.author, 40),
      is_free: Boolean(req.body.is_free),
      is_open_source: Boolean(req.body.is_open_source) || Boolean(repoUrl),
      creator: req.voter,
      ip: req.ipKey,
    });
    if (wantsJson(req)) return res.status(201).json({ id });
    res.redirect(303, `${views.wantUrl(w)}#a${id}`);
  });

  app.post('/w/:id/confirm', smallBody, sameOrigin, limit('confirm', 60, 3600), (req, res) => {
    const w = loadWant(req, res);
    if (!w) return;
    const r = store.confirm(w.id, Number(req.body.answer), req.voter);
    if (r.error) return fail(req, res, 403, r.error, views.wantUrl(w));
    if (wantsJson(req)) return res.json(r);
    res.redirect(303, views.wantUrl(w));
  });

  app.post('/w/:id/report', smallBody, sameOrigin, limit('report', 30, 86400), (req, res) => {
    const w = loadWant(req, res);
    if (!w) return;
    store.report('want', w.id, req.voter);
    if (wantsJson(req)) return res.json({ ok: true });
    res.redirect(303, views.wantUrl(w));
  });

  app.post('/a/:id/vote', smallBody, sameOrigin, limit('vote', 120, 3600), (req, res) => {
    const a = store.getAnswer(Number(req.params.id));
    if (!a || a.hidden) return fail(req, res, 404, 'This answer does not exist.');
    const value = Number(req.body.v) === -1 ? -1 : 1;
    const r = store.vote(a.id, req.voter, value);
    if (wantsJson(req)) return res.json(r);
    const w = store.getWant(a.want_id);
    res.redirect(303, `${views.wantUrl(w)}#a${a.id}`);
  });

  app.post('/a/:id/report', smallBody, sameOrigin, limit('report', 30, 86400), (req, res) => {
    const a = store.getAnswer(Number(req.params.id));
    if (!a) return fail(req, res, 404, 'This answer does not exist.');
    store.report('answer', a.id, req.voter);
    if (wantsJson(req)) return res.json({ ok: true });
    const w = store.getWant(a.want_id);
    res.redirect(303, views.wantUrl(w));
  });

  app.get('/shelf', (req, res) => {
    const filter = ['fits', 'agent', 'open-source', 'existing', 'built'].includes(req.query.filter) ? req.query.filter : 'all';
    send(res, views.shelfPage({ items: store.shelf({ filter, limit: 120 }), filter }));
  });

  app.get('/made', (req, res) => send(res, views.madeIndexPage({ items: store.listMade({ limit: 200 }) })));

  app.get('/made/:slug', (req, res) => {
    const m = store.getMade(req.params.slug);
    if (!m) return fail(req, res, 404, 'This tool does not exist.', '/made');
    send(res, views.madePage({ m }));
  });

  // The agent-made page itself. The CSP sandbox gives it an opaque origin: no cookies, no same-origin API calls.
  app.get('/made/:slug/raw', (req, res) => {
    const m = store.getMade(req.params.slug);
    if (!m) return res.status(404).type('text').send('Not found');
    res.set(
      'Content-Security-Policy',
      "sandbox allow-scripts allow-forms allow-modals allow-downloads allow-popups; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com data:; img-src * data: blob:; media-src * data: blob:; connect-src https:; form-action 'none'; base-uri 'none'",
    );
    res.set('X-Robots-Tag', 'noindex');
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(m.html);
  });

  app.get('/made/:slug/source', (req, res) => {
    const m = store.getMade(req.params.slug);
    if (!m) return res.status(404).type('text').send('Not found');
    res.set('Content-Disposition', `inline; filename="${m.slug}.html"`);
    res.type('text/plain; charset=utf-8').send(`<!-- ${m.title}. Made by the I Want It Now agent for ${config.baseUrl}/w/${m.want_id}. License: MIT. -->\n${m.html}`);
  });

  app.get('/topics', (req, res) => {
    const topics = store.topicStats();
    const samples = {};
    for (const t of topics) samples[t.slug] = store.listWants({ sort: 'top', topic: t.slug, status: 'unfulfilled', limit: 3 });
    send(res, views.topicsPage({ topics, samples }));
  });

  app.get('/topics/:slug', (req, res) => {
    const topic = TOPIC_BY_SLUG.get(req.params.slug);
    if (!topic) return fail(req, res, 404, 'There is no topic with this name.', '/topics');
    const stats = store.topicStats().find((t) => t.slug === topic.slug) || { wants: 0, me_too: 0, answered: 0, fulfilled: 0 };
    const wants = store.listWants({ sort: 'top', topic: topic.slug, limit: 60 });
    send(res, views.topicPage({ topic, stats, wants, shelf: store.shelf({ topic: topic.slug, limit: 24 }), mine: myMeToos(wants, req.voter) }));
  });

  app.get('/mine', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    send(res, views.minePage({ created: store.listWants({ sort: 'new', creator: req.voter, limit: 100 }), metoo: store.listWants({ sort: 'new', meToo: req.voter, limit: 100 }) }));
  });

  app.get('/build', (req, res) => {
    const top = store.listWants({ sort: 'top', status: 'unfulfilled', limit: 20 });
    const human = store.listWants({ sort: 'top', status: 'unfulfilled', agent: 'needs_human', limit: 20 });
    send(res, views.buildPage({ top, human, mine: myMeToos([...top, ...human], req.voter) }));
  });

  app.get('/about', (req, res) => send(res, views.aboutPage({ stats: store.stats() })));

  // ---------- Public JSON API ----------

  const cors = (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    next();
  };

  app.get('/api/wants', cors, (req, res) => {
    const sort = ['hot', 'new', 'top'].includes(req.query.sort) ? req.query.sort : 'new';
    const status = ['open', 'answered', 'fulfilled', 'unfulfilled'].includes(req.query.status) ? req.query.status : null;
    const q = cleanLine(req.query.q, 100) || null;
    const topic = TOPIC_BY_SLUG.has(req.query.topic) ? req.query.topic : null;
    const wants = store.listWants({ sort, status, q, topic, limit: req.query.limit || 30, offset: req.query.offset || 0 });
    res.json({ wants: wants.map(publicWant) });
  });

  app.get('/api/wants/:id', cors, (req, res) => {
    const w = store.getWant(Number(req.params.id));
    if (!w || w.hidden) return res.status(404).json({ error: 'Not found' });
    res.json({ want: publicWant(w), answers: store.answersFor(w.id).map(publicAnswer) });
  });

  app.get('/api/similar', cors, (req, res) => {
    const q = cleanLine(req.query.q, 200);
    res.json({ wants: q.length < 4 ? [] : store.similarWants(q, { limit: 5 }).map(publicWant) });
  });

  app.get('/api/stats', cors, (req, res) => res.json(store.stats()));
  app.get('/api/topics', cors, (req, res) => res.json({ topics: store.topicStats().map(({ words, ...t }) => t) }));

  // ---------- Agent API (bearer token) ----------

  const agentAuth = bearer(config.agentToken);

  app.get('/api/agent/queue', agentAuth, (req, res) => {
    res.json({ wants: store.agentQueue(req.query.limit).map((w) => ({ ...publicWant(w), answers_list: store.answersFor(w.id).map(publicAnswer) })) });
  });

  app.post('/api/agent/claim/:id', agentAuth, (req, res) => {
    res.json({ ok: store.agentClaim(Number(req.params.id)) });
  });

  app.post('/api/agent/reset/:id', agentAuth, (req, res) => {
    store.resetAgent(Number(req.params.id));
    res.json({ ok: true });
  });

  // The agent posts its result: existing tools it found, an optional page it made, and a final state.
  app.post('/api/agent/result/:id', agentAuth, bigBody, (req, res) => {
    const w = store.getWant(Number(req.params.id));
    if (!w) return res.status(404).json({ error: 'Not found' });
    const body = req.body || {};
    const created = [];
    const seen = new Set(store.answersFor(w.id).map((a) => a.url || a.repo_url));
    for (const e of Array.isArray(body.existing) ? body.existing.slice(0, 5) : []) {
      const url = cleanUrl(e.url);
      const repo = cleanUrl(e.repo_url);
      if (!url && !repo) continue;
      if (seen.has(url || repo)) continue;
      seen.add(url || repo);
      created.push(
        store.addAnswer({
          want_id: w.id,
          kind: 'existing',
          title: cleanLine(e.title, 80) || 'Existing tool',
          url: url || null,
          repo_url: repo || null,
          note: cleanBlock(e.note, 1000),
          by_agent: true,
          is_free: e.is_free == null ? null : Boolean(e.is_free),
          is_open_source: e.is_open_source == null ? null : Boolean(e.is_open_source),
        }),
      );
    }
    let made = null;
    if (body.made && typeof body.made.html === 'string' && body.made.html.length > 200) {
      const title = cleanLine(body.made.title, 80) || 'Untitled tool';
      made = store.addMade({ want_id: w.id, title, summary: cleanLine(body.made.summary, 300), html: body.made.html.slice(0, 2_000_000) });
      created.push(
        store.addAnswer({
          want_id: w.id,
          kind: 'agent',
          title,
          note: cleanBlock(body.made.note || body.made.summary, 1000),
          by_agent: true,
          is_free: true,
          is_open_source: true,
          made_id: made.id,
        }),
      );
      seo.indexNow(`/made/${made.slug}`);
    }
    const topics = cleanTopics(body.topics);
    if (topics) store.setTopics(w.id, topics, true);
    const state = ['done', 'needs_human', 'skipped'].includes(body.state) ? body.state : 'done';
    store.agentFinish(w.id, state, cleanLine(body.note, 500));
    seo.indexNow(views.wantUrl(w));
    res.json({ ok: true, answers: created, made });
  });

  // The agent imports wants it found in public posts. Each import keeps the link to its source.
  app.post('/api/agent/wants', agentAuth, smallBody, (req, res) => {
    const text = cleanWantText(req.body.text).slice(0, 200);
    const source_url = cleanUrl(req.body.source_url);
    if (text.length < 8 || !source_url) return res.status(400).json({ error: 'text and source_url are required' });
    const r = store.createWant({
      text,
      details: cleanBlock(req.body.details, 2000),
      done_when: cleanLine(req.body.done_when, 200),
      author: cleanLine(req.body.author, 40),
      source: ['hn', 'agent'].includes(req.body.source) ? req.body.source : 'agent',
      source_url,
    });
    if (!r.duplicate) seo.indexNow(`/w/${r.id}/${slugify(text)}`);
    res.status(r.duplicate ? 200 : 201).json(r);
  });

  // ---------- Admin (token) ----------

  function adminOk(token) {
    return config.adminToken && token && token.length === config.adminToken.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.adminToken));
  }

  app.get('/admin', (req, res) => {
    const token = String(req.query.token || '');
    if (!adminOk(token)) return fail(req, res, 404, 'Not found.');
    const db = store.db;
    send(
      res,
      views.adminPage({
        token,
        stats: store.stats(),
        hits: store.hitsSummary(14),
        wants: db.prepare(`SELECT * FROM wants ORDER BY id DESC LIMIT 60`).all(),
        answers: db.prepare(`SELECT * FROM answers ORDER BY id DESC LIMIT 60`).all(),
      }),
    );
  });

  app.post('/admin/hide', smallBody, (req, res) => {
    const token = String(req.body.token || '');
    if (!adminOk(token)) return res.status(404).send('Not found');
    store.setHidden(req.body.kind, Number(req.body.id), req.body.hidden === '1');
    res.redirect(303, `/admin?token=${encodeURIComponent(token)}`);
  });

  app.get('/api/admin/stats', bearer(config.adminToken), (req, res) => res.json({ stats: store.stats(), hits: store.hitsSummary(Number(req.query.days) || 14) }));

  // ---------- SEO files ----------

  app.get('/robots.txt', (req, res) => res.type('text/plain').send(seo.robotsTxt()));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(seo.sitemapXml(store.sitemapRows())));
  app.get('/feed.xml', (req, res) => res.type('application/rss+xml').send(seo.feedXml(store.listWants({ sort: 'new', limit: 50 }))));
  app.get('/llms.txt', (req, res) => res.type('text/plain').send(seo.llmsTxt(store.stats())));
  if (config.indexNowKey) app.get(`/${config.indexNowKey}.txt`, (req, res) => res.type('text/plain').send(config.indexNowKey));

  app.get('/og.png', async (req, res, next) => {
    try {
      const png = await renderOg({ kind: 'site', stats: store.stats() });
      res.set('Cache-Control', 'public, max-age=3600').type('png').send(png);
    } catch (err) {
      next(err);
    }
  });

  app.get('/og/w/:file', async (req, res, next) => {
    const id = Number(String(req.params.file).replace(/\.png$/, ''));
    const w = store.getWant(id);
    if (!w || w.hidden) return res.status(404).end();
    try {
      const png = await renderOg({ kind: 'want', want: w });
      res.set('Cache-Control', 'public, max-age=600').type('png').send(png);
    } catch (err) {
      next(err);
    }
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use((req, res) => fail(req, res, 404, 'There is no page at this address.', '/'));

  app.use((err, req, res, _next) => {
    console.error(err);
    if (err.type === 'entity.too.large') return fail(req, res, 413, 'That is too long.');
    fail(req, res, 500, 'Something broke on our side. Try again in a minute.');
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (config.production && config.secret === 'dev-secret-change-me') {
    console.error('SECRET is not set. Refusing to start in production.');
    process.exit(1);
  }
  const db = openDb(config.dbPath);
  const store = createStore(db);
  const filled = store.backfillTopics();
  if (filled) console.log(`tagged ${filled} wants with topics`);
  setInterval(() => store.sweep(), 10 * 60_000).unref();
  const app = createApp({ store });
  app.listen(config.port, config.host, () => console.log(`i-want-it-now on ${config.host}:${config.port} (db ${config.dbPath})`));
}
