import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.AGENT_TOKEN = 'agent-test-token';
process.env.ADMIN_TOKEN = 'admin-test-token';

const { openDb } = await import('../src/db.js');
const { createStore } = await import('../src/store.js');
const { createApp } = await import('../src/server.js');
const { cleanWantText, cleanUrl, ftsQuery } = await import('../src/util.js');

let server;
let base;
let store;

before(async () => {
  store = createStore(openDb(':memory:'));
  server = createApp({ store }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

// A tiny client that keeps the cookie, like one browser.
function browser() {
  let cookie = '';
  return async function req(path, { method = 'GET', form, json, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let body;
    if (form) {
      h['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    if (json) {
      h['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const res = await fetch(base + path, { method, headers: h, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
}

test('util: cleanWantText removes a typed "I want"', () => {
  assert.equal(cleanWantText('I want a timer for tea.'), 'a timer for tea');
  assert.equal(cleanWantText('  i need   an app that does X  '), 'an app that does X');
  assert.equal(cleanWantText('A page that lists things'), 'a page that lists things');
  assert.equal(cleanWantText('Spotify stats per artist'), 'Spotify stats per artist');
});

test('util: cleanUrl accepts http(s) only', () => {
  assert.equal(cleanUrl('example.com/x'), 'https://example.com/x');
  assert.equal(cleanUrl('javascript:alert(1)'), undefined);
  assert.equal(cleanUrl(''), null);
  assert.equal(cleanUrl('localhost'), undefined);
});

test('util: ftsQuery quotes terms, so FTS syntax cannot break', () => {
  assert.equal(ftsQuery('the "recipe" AND list*'), '"recipe"* OR "list"*');
  assert.equal(ftsQuery('a an the'), null);
});

test('home page renders', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Say exactly what you want/);
  assert.match(text, /<link rel="canonical"/);
});

test('full flow: want, me too, answer, vote, confirm', async () => {
  const alice = browser();
  const bob = browser();
  await alice('/');
  await bob('/');

  // Alice posts a want.
  let res = await alice('/wants', { method: 'POST', form: { text: 'I want a page that turns a recipe link into a shopping list', done_when: 'I paste a link and get a list' } });
  assert.equal(res.status, 303);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/w\/\d+\/a-page-that-turns-a-recipe-link-into-a-shopping-list\?new=1$/);
  const id = Number(loc.split('/')[2]);
  let w = store.getWant(id);
  assert.equal(w.me_too, 1, 'the author counts as one me-too');
  assert.equal(w.status, 'open');

  // The page shows the want, escaped.
  res = await alice(loc);
  const page = await res.text();
  assert.match(page, /a page that turns a recipe link/);
  assert.match(page, /DiscussionForumPosting/);

  // Bob says me too, with JSON.
  res = await bob(`/w/${id}/metoo`, { method: 'POST', form: {}, headers: { 'x-ajax': '1' } });
  assert.deepEqual(await res.json(), { on: true, count: 2 });

  // Bob answers.
  res = await bob(`/w/${id}/answers`, { method: 'POST', form: { kind: 'built', title: 'Recipe2List', url: 'https://example.com/r2l', repo_url: 'github.com/bob/r2l', note: 'Works in the browser' } });
  assert.equal(res.status, 303);
  w = store.getWant(id);
  assert.equal(w.status, 'answered');
  const [answer] = store.answersFor(id);
  assert.equal(answer.repo_url, 'https://github.com/bob/r2l');
  assert.equal(answer.is_open_source, 1);

  // Bob cannot confirm for Alice.
  res = await bob(`/w/${id}/confirm`, { method: 'POST', form: { answer: String(answer.id) }, headers: { 'x-ajax': '1' } });
  assert.equal(res.status, 403);

  // Votes toggle.
  res = await bob(`/a/${answer.id}/vote`, { method: 'POST', form: { v: '1' }, headers: { 'x-ajax': '1' } });
  assert.deepEqual(await res.json(), { works: 1, nofit: 0, mine: 1 });
  res = await bob(`/a/${answer.id}/vote`, { method: 'POST', form: { v: '1' }, headers: { 'x-ajax': '1' } });
  assert.deepEqual(await res.json(), { works: 0, nofit: 0, mine: 0 });

  // Alice confirms. The want is fulfilled.
  res = await alice(`/w/${id}/confirm`, { method: 'POST', form: { answer: String(answer.id) }, headers: { 'x-ajax': '1' } });
  assert.deepEqual(await res.json(), { fulfilled: true });
  assert.equal(store.getWant(id).status, 'fulfilled');

  // The shelf lists the answer.
  res = await fetch(base + '/shelf?filter=fits');
  assert.match(await res.text(), /Recipe2List/);

  // The JSON API shows it.
  res = await fetch(`${base}/api/wants/${id}`);
  const data = await res.json();
  assert.equal(data.want.status, 'fulfilled');
  assert.equal(data.answers[0].title, 'Recipe2List');
});

test('three "works for me" votes fulfill a want without the wisher', async () => {
  const { id } = store.createWant({ text: 'a converter from celsius to kelvin with history', creator: 'x' });
  const answerId = store.addAnswer({ want_id: id, kind: 'built', title: 'K', url: 'https://k.example.com' });
  store.vote(answerId, 'v1', 1);
  store.vote(answerId, 'v2', 1);
  assert.equal(store.getWant(id).status, 'answered');
  store.vote(answerId, 'v3', 1);
  assert.equal(store.getWant(id).status, 'fulfilled');
  store.setHidden('answer', answerId, true);
  assert.equal(store.getWant(id).status, 'open');
});

test('cross-site form posts are refused', async () => {
  const res = await fetch(base + '/wants', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
    body: 'text=a+tool+that+does+something+useful',
    redirect: 'manual',
  });
  assert.equal(res.status, 403);
});

test('bad input is rejected', async () => {
  const b = browser();
  let res = await b('/wants', { method: 'POST', form: { text: 'hi' }, headers: { 'x-ajax': '1' } });
  assert.equal(res.status, 400);
  const { id } = store.createWant({ text: 'something to test bad answers with', creator: 'y' });
  res = await b(`/w/${id}/answers`, { method: 'POST', form: { title: 'X', url: 'javascript:alert(1)' }, headers: { 'x-ajax': '1' } });
  assert.equal(res.status, 400);
  res = await b(`/w/${id}/answers`, { method: 'POST', form: { title: 'X' }, headers: { 'x-ajax': '1' } });
  assert.equal(res.status, 400);
});

test('want text is escaped in HTML', async () => {
  const { id } = store.createWant({ text: 'a tool <script>alert(1)</script> that escapes', creator: 'z' });
  const w = store.getWant(id);
  const res = await fetch(`${base}/w/${id}/${w.slug}`);
  const text = await res.text();
  assert.ok(!text.includes('<script>alert(1)</script>'));
  assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('wrong slug redirects to the canonical URL', async () => {
  const { id } = store.createWant({ text: 'a canonical url test want', creator: 'c' });
  const res = await fetch(`${base}/w/${id}/wrong`, { redirect: 'manual' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `/w/${id}/a-canonical-url-test-want`);
});

test('agent API: auth, queue, claim, result, made page sandbox', async () => {
  let res = await fetch(base + '/api/agent/queue');
  assert.equal(res.status, 401);
  const auth = { authorization: 'Bearer agent-test-token' };
  const { id } = store.createWant({ text: 'a pomodoro timer that logs what I worked on', creator: 'p' });
  res = await fetch(base + '/api/agent/queue?limit=20', { headers: auth });
  const q = await res.json();
  assert.ok(q.wants.some((w) => w.id === id));

  res = await fetch(`${base}/api/agent/claim/${id}`, { method: 'POST', headers: auth });
  assert.deepEqual(await res.json(), { ok: true });
  res = await fetch(`${base}/api/agent/claim/${id}`, { method: 'POST', headers: auth });
  assert.deepEqual(await res.json(), { ok: false }, 'a second claim fails');

  const html = `<!doctype html><html><head><title>Pomo</title></head><body><h1>Pomo</h1>${'<p>x</p>'.repeat(40)}<script>document.title='ok'</script></body></html>`;
  res = await fetch(`${base}/api/agent/result/${id}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      state: 'done',
      note: 'Found one tool and made a page.',
      existing: [{ title: 'Pomofocus', url: 'https://pomofocus.io', note: 'Free web timer', is_free: true, is_open_source: false }, { title: 'Bad', url: 'javascript:x' }],
      made: { title: 'Pomodoro Log', summary: 'A timer that keeps a log.', html },
    }),
  });
  const r = await res.json();
  assert.equal(r.ok, true);
  assert.equal(r.answers.length, 2);
  const w = store.getWant(id);
  assert.equal(w.agent_state, 'done');
  assert.equal(w.status, 'answered');

  res = await fetch(`${base}/made/${r.made.slug}/raw`);
  assert.match(res.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.equal(await res.text(), html);
  res = await fetch(`${base}/made/${r.made.slug}`);
  assert.match(await res.text(), /WebApplication/);

  // A repository without an open-source license gets no "open source" tag.
  const unlicensed = store.addAnswer({ want_id: id, kind: 'existing', title: 'NoLicense', url: 'https://nl.example.com', repo_url: 'https://github.com/x/nl', by_agent: true, is_open_source: false });
  res = await fetch(`${base}/w/${id}/${w.slug}`);
  const pageHtml = await res.text();
  const card = pageHtml.slice(pageHtml.indexOf(`id="a${unlicensed}"`), pageHtml.indexOf('</article>', pageHtml.indexOf(`id="a${unlicensed}"`)));
  assert.ok(!card.includes('open source'));
});

test('agent import dedupes by source URL', async () => {
  const auth = { authorization: 'Bearer agent-test-token', 'content-type': 'application/json' };
  const body = JSON.stringify({ text: 'I wish there was a diff tool for spreadsheets', source: 'hn', source_url: 'https://news.ycombinator.com/item?id=1', author: 'pg' });
  let res = await fetch(base + '/api/agent/wants', { method: 'POST', headers: auth, body });
  assert.equal(res.status, 201);
  const first = await res.json();
  res = await fetch(base + '/api/agent/wants', { method: 'POST', headers: auth, body });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, first.id);
  assert.equal(store.getWant(first.id).text, 'a diff tool for spreadsheets');
  assert.equal(store.getWant(first.id).me_too, 1);
});

test('search, similar, sitemap, feed, robots, llms', async () => {
  let res = await fetch(base + '/wants?q=recipe');
  assert.match(await res.text(), /recipe link/);
  res = await fetch(base + '/api/similar?q=shopping+list+from+recipes');
  assert.ok((await res.json()).wants.length >= 1);
  res = await fetch(base + '/sitemap.xml');
  assert.match(await res.text(), /<urlset/);
  res = await fetch(base + '/feed.xml');
  assert.match(await res.text(), /<rss/);
  res = await fetch(base + '/robots.txt');
  assert.match(await res.text(), /Sitemap:/);
  res = await fetch(base + '/llms.txt');
  assert.match(await res.text(), /# I Want It Now/);
});

test('reports hide content after the limit', async () => {
  const { id } = store.createWant({ text: 'spam spam spam buy now cheap', creator: 's' });
  store.report('want', id, 'r1');
  store.report('want', id, 'r1');
  store.report('want', id, 'r2');
  assert.equal(store.getWant(id).hidden, 0);
  store.report('want', id, 'r3');
  assert.equal(store.getWant(id).hidden, 1);
  const res = await fetch(`${base}/w/${id}`);
  assert.equal(res.status, 404);
});

test('hot sort works (needs SQLite math functions)', () => {
  const rows = store.listWants({ sort: 'hot', limit: 5 });
  assert.ok(rows.length > 0);
});

test('og images render as PNG', async () => {
  let res = await fetch(base + '/og.png');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const { id } = store.createWant({ text: 'an og image test want with a fairly long sentence so that it wraps over more than one line', creator: 'o' });
  res = await fetch(`${base}/og/w/${id}.png`);
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
});

test('admin page needs the token', async () => {
  let res = await fetch(base + '/admin');
  assert.equal(res.status, 404);
  res = await fetch(base + '/admin?token=admin-test-token');
  assert.equal(res.status, 200);
});

test('topics: classify, pages, agent override', async () => {
  const { classify } = await import('../src/topics.js');
  assert.deepEqual(classify('a CI pipeline that runs my docker tests locally'), ['dev-tools']);
  assert.deepEqual(classify('zzz qqq'), ['other']);
  const { id } = store.createWant({ text: 'a recipe scaler for my grocery shopping', creator: 't' });
  assert.deepEqual(store.topicsFor(id), ['home-food']);
  let res = await fetch(base + '/topics');
  assert.match(await res.text(), /Home and food/);
  res = await fetch(base + '/topics/home-food');
  assert.match(await res.text(), /recipe scaler/);
  res = await fetch(base + '/topics/nope');
  assert.equal(res.status, 404);
  res = await fetch(`${base}/api/agent/result/${id}`, {
    method: 'POST',
    headers: { authorization: 'Bearer agent-test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ state: 'needs_human', topics: ['money', 'bogus'] }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(store.topicsFor(id), ['money']);
});

test('mine page lists wants from this browser only', async () => {
  const a = browser();
  const b = browser();
  await a('/');
  await b('/');
  await a('/wants', { method: 'POST', form: { text: 'a unique test want for the mine page' } });
  let res = await a('/mine');
  assert.match(await res.text(), /unique test want for the mine page/);
  res = await b('/mine');
  assert.ok(!(await res.text()).includes('unique test want for the mine page'));
});

test('want feed lists answers', async () => {
  const { id } = store.createWant({ text: 'a want with a feed of answers', creator: 'f' });
  store.addAnswer({ want_id: id, kind: 'built', title: 'FeedThing', url: 'https://feed.example.com' });
  const res = await fetch(`${base}/w/${id}/feed.xml`);
  assert.match(await res.text(), /Answer: FeedThing/);
});

test('agent queue puts site wants before imported wants', () => {
  store.db.prepare(`UPDATE wants SET agent_state = 'done'`).run();
  store.createWant({ text: 'an imported want from hacker news', source: 'hn', source_url: 'https://news.ycombinator.com/item?id=999' });
  const { id } = store.createWant({ text: 'a want from a real visitor on the site', creator: 'v' });
  assert.equal(store.agentQueue(1)[0].id, id);
});

test('migration strips the old attribution paragraph from details', async () => {
  const { id } = store.createWant({ text: 'an old import with attribution', details: 'Real context here.\n\nThe agent found this want in a public Hacker News comment by x. The link is below.', source: 'hn', source_url: 'https://news.ycombinator.com/item?id=4242', author: 'x (HN)' });
  const { migrate } = await import('../src/db.js');
  migrate(store.db);
  assert.equal(store.getWant(id).details, 'Real context here.');
  const res = await fetch(`${base}/w/${id}/${store.getWant(id).slug}`);
  assert.match(await res.text(), /public Hacker News comment by x\./);
});

test('similar wants need two shared keywords', () => {
  const a = store.createWant({ text: 'a wiki cycling map with safe bike routes', creator: 's1' }).id;
  const b = store.createWant({ text: 'a cycling route planner that avoids busy roads for bike commuters', creator: 's2' }).id;
  const c = store.createWant({ text: 'a browser extension that hides fake reviews on shopping sites', creator: 's3' }).id;
  const ids = store.similarWants('a wiki cycling map where cyclists review routes', { excludeId: a }).map((w) => w.id);
  assert.ok(ids.includes(b));
  assert.ok(!ids.includes(c));
});
