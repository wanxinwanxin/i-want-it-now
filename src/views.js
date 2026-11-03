import { html, raw, jsonLd, textBlock } from './html.js';
import { config } from './config.js';
import { timeAgo, hostOf, plural } from './util.js';
import { TOPIC_BY_SLUG } from './topics.js';

const SITE = 'I Want It Now';
const ASSET_V = Date.now().toString(36);

export const EXAMPLES = [
  'a page that turns any recipe link into a plain shopping list',
  'a timer that tells me when my tea is ready, by tea type',
  'a browser tab that shows how long until my next meeting',
  'a tool that splits a group dinner bill with tax and tip per person',
  'a calculator that tells me if leasing or buying a car is cheaper',
  'a script that renames my photos by the date they were taken',
  'a habit tracker that fits in one screen and needs no account',
  'a site that turns a long YouTube transcript into chapter notes',
];

export function wantUrl(w) {
  return `/w/${w.id}/${w.slug}`;
}

export function wantTitle(w) {
  return `I want ${w.text}`;
}

function cut(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

// Prefilled share links. Each link adds ?ref=<channel>, so that the admin page counts visits from each channel.
export function shareUrls(path, text) {
  const u = (ref) => `${config.baseUrl}${path}${path.includes('?') ? '&' : '?'}ref=${ref}`;
  const e = encodeURIComponent;
  return {
    x: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(u('share-x'))}`,
    reddit: `https://www.reddit.com/submit?url=${e(u('share-reddit'))}&title=${e(text)}`,
    hn: `https://news.ycombinator.com/submitlink?u=${e(u('share-hn'))}&t=${e(text.slice(0, 80))}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${e(u('share-linkedin'))}`,
    plain: `${config.baseUrl}${path}`,
  };
}

function shareRow(path, text, label = 'Share') {
  const s = shareUrls(path, text);
  return html`<div class="sharerow" aria-label="${label}">
    <span class="sharelbl">${label}:</span>
    <a href="${s.x}" target="_blank" rel="noopener">X</a>
    <a href="${s.reddit}" target="_blank" rel="noopener">Reddit</a>
    <a href="${s.hn}" target="_blank" rel="noopener">Hacker News</a>
    <a href="${s.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
    <button class="linkish" data-share="${s.plain}" data-title="${text}">Copy link</button>
  </div>`;
}

export function layout({ title, description, path = '/', body, jsonld = null, noindex = false, ogImage = null, wide = false }) {
  const fullTitle = title ? `${title} · ${SITE}` : `${SITE}: say exactly what you want, get it built`;
  const canonical = `${config.baseUrl}${path}`;
  const desc = description || 'Post the exact thing you want. Builders and an AI agent answer with live demos, open-source code, or tools that already exist. Free.';
  const img = ogImage || `${config.baseUrl}/og.png`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${cut(desc, 300)}">
<link rel="canonical" href="${canonical}">
${noindex ? raw('<meta name="robots" content="noindex">') : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${title || SITE}">
<meta property="og:description" content="${cut(desc, 300)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ff5a1f">
${config.googleVerify ? html`<meta name="google-site-verification" content="${config.googleVerify}">` : ''}
${config.bingVerify ? html`<meta name="msvalidate.01" content="${config.bingVerify}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="New wants" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap">
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
${jsonld ? jsonLd(jsonld) : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="logo" href="/" aria-label="${SITE} home">i want it <span>now</span></a>
  <nav aria-label="Main">
    <a href="/wants">Wants</a>
    <a href="/topics">Topics</a>
    <a href="/shelf">Shelf</a>
    <a href="/build">Build</a>
    <a href="/about">How it works</a>
  </nav>
  <a class="btn small" href="/#want">Post a want</a>
</header>
<main id="main" class="${wide ? 'wide' : ''}">
${body}
</main>
<footer class="foot">
  <div>
    <a class="logo small" href="/">i want it <span>now</span></a>
    <p>Say exactly what you want. Builders and an AI agent answer with things that work.</p>
  </div>
  <nav aria-label="Footer">
    <a href="/wants?sort=new">New wants</a>
    <a href="/log">Build log</a>
    <a href="/topics">Topics</a>
    <a href="/mine">Your wants</a>
    <a href="/wants?status=fulfilled">Fulfilled</a>
    <a href="/shelf">Shelf</a>
    <a href="/made">Agent-made tools</a>
    <a href="/build">For builders and agents</a>
    <a href="/about">How it works</a>
    <a href="/feed.xml">RSS</a>
    <a href="/api/wants">JSON API</a>
    <a href="https://github.com/wanxinwanxin/i-want-it-now" rel="noopener">Source on GitHub</a>
  </nav>
</footer>
<script src="/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

const STATUS_LABEL = { open: 'Open', answered: 'Answered', fulfilled: 'Fulfilled' };

function statusChip(w) {
  return html`<span class="chip st-${w.status}">${w.status === 'fulfilled' ? '✓ ' : ''}${STATUS_LABEL[w.status] || w.status}</span>`;
}

function sourceChip(w) {
  if (w.source === 'hn') return html`<span class="chip src">via Hacker News</span>`;
  if (w.source === 'agent') return html`<span class="chip src">spotted by the agent</span>`;
  return '';
}

function agentChip(w) {
  if (w.status !== 'open') return '';
  if (w.agent_state === 'working') return html`<span class="chip agent pulse">agent working</span>`;
  if (w.agent_state === 'pending') return html`<span class="chip agent">agent queued</span>`;
  if (w.agent_state === 'needs_human') return html`<span class="chip human">needs a human builder</span>`;
  return '';
}

export function meTooButton(w, on, big = false) {
  return html`<form class="metoo${big ? ' big' : ''}" method="post" action="/w/${w.id}/metoo" data-ajax="metoo">
    <button type="submit" class="mt${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" title="I want this too">
      <span class="arrow" aria-hidden="true">▲</span><b>${w.me_too}</b><span class="lbl">me too</span>
    </button>
  </form>`;
}

export function wantCard(w, { on = false } = {}) {
  return html`<article class="want st-${w.status}">
    ${meTooButton(w, on)}
    <div class="wbody">
      <a class="wtext" href="${wantUrl(w)}"><span class="iw">I want</span> ${w.text}</a>
      <div class="meta">
        ${statusChip(w)} ${agentChip(w)} ${sourceChip(w)}
        <span>${plural(w.answer_count, 'answer')}</span>
        <time datetime="${w.created_at}">${timeAgo(w.created_at)}</time>
      </div>
    </div>
  </article>`;
}

function wantList(wants, mine, empty = 'Nothing here yet.') {
  if (!wants.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="wants">${wants.map((w) => wantCard(w, { on: mine.has(w.id) }))}</div>`;
}

const KIND_LABEL = { built: 'Built for this want', existing: 'Already exists', agent: 'Made by the agent' };

function answerLink(a) {
  if (a.made_slug) return `/made/${a.made_slug}`;
  return a.url || a.repo_url;
}

export function shelfCard(a) {
  const href = answerLink(a);
  const external = !a.made_slug;
  return html`<article class="shelf-card${a.is_fit ? ' fit' : ''}">
    ${a.made_slug && a.has_thumb ? html`<a class="thumb" href="${href}" tabindex="-1" aria-hidden="true"><img src="/made/${a.made_slug}/thumb.jpg" alt="" loading="lazy" width="1200" height="630"></a>` : ''}
    <div class="akind k-${a.made_slug ? 'agent' : a.kind}">${a.made_slug ? KIND_LABEL.agent : KIND_LABEL[a.kind]}${a.is_fit ? html` <span class="fitmark">✓ fits exactly</span>` : ''}</div>
    <h3><a href="${href}" ${external ? raw('rel="nofollow ugc noopener" target="_blank"') : ''}>${a.title}</a></h3>
    ${external ? html`<div class="host">${hostOf(href)}</div>` : ''}
    ${a.note ? html`<p>${cut(a.note, 160)}</p>` : ''}
    <a class="for" href="/w/${a.want_id}/${a.want_slug}"><span class="iw">for</span> I want ${cut(a.want_text, 90)}</a>
  </article>`;
}

// The explicit flag wins. A repository link alone counts only when nobody set the flag.
function isOpenSource(a) {
  return Boolean(a.made_slug) || a.is_open_source === 1 || (a.is_open_source == null && Boolean(a.repo_url));
}

function answerCard(a, w, { myVote = 0, isCreator = false } = {}) {
  const fit = w.fulfilled_answer_id === a.id;
  const href = answerLink(a);
  const external = !a.made_slug;
  const kind = a.made_slug ? 'agent' : a.kind;
  return html`<article class="answer${fit ? ' fit' : ''}" id="a${a.id}">
    <div class="akind k-${kind}">${KIND_LABEL[kind]}${fit ? html` <span class="fitmark">✓ fits exactly</span>` : ''}</div>
    <h3><a href="${href}" ${external ? raw('rel="nofollow ugc noopener" target="_blank"') : ''}>${a.title}</a>
      ${external ? html`<span class="host">${hostOf(href)}</span>` : ''}</h3>
    ${a.made_slug && a.has_thumb ? html`<a class="athumb" href="/made/${a.made_slug}" tabindex="-1" aria-hidden="true"><img src="/made/${a.made_slug}/thumb.jpg" alt="" loading="lazy" width="1200" height="630"></a>` : ''}
    ${a.note ? textBlock(a.note) : ''}
    <div class="alinks">
      ${a.made_slug ? html`<a class="btn small" href="/made/${a.made_slug}">Open it</a>` : a.url ? html`<a class="btn small" href="${a.url}" rel="nofollow ugc noopener" target="_blank">Open</a>` : ''}
      ${a.repo_url ? html`<a class="btn small ghost" href="${a.repo_url}" rel="nofollow ugc noopener" target="_blank">Source code</a>` : ''}
      ${a.made_slug ? html`<a class="btn small ghost" href="/made/${a.made_slug}/source">Source code</a>` : ''}
      ${a.is_free ? html`<span class="tag">free</span>` : ''}
      ${isOpenSource(a) ? html`<span class="tag">open source</span>` : ''}
    </div>
    <div class="by">${a.by_agent ? 'by the house agent' : `by ${a.author || 'anonymous'}`} · <time datetime="${a.created_at}">${timeAgo(a.created_at)}</time></div>
    <div class="avotes">
      <form method="post" action="/a/${a.id}/vote" data-ajax="vote"><input type="hidden" name="v" value="1">
        <button class="vote${myVote === 1 ? ' on' : ''}" aria-pressed="${myVote === 1 ? 'true' : 'false'}">✓ Works for me <b>${a.works}</b></button></form>
      <form method="post" action="/a/${a.id}/vote" data-ajax="vote"><input type="hidden" name="v" value="-1">
        <button class="vote neg${myVote === -1 ? ' on' : ''}" aria-pressed="${myVote === -1 ? 'true' : 'false'}">✗ Not a fit <b>${a.nofit}</b></button></form>
      ${isCreator
        ? html`<form method="post" action="/w/${w.id}/confirm"><input type="hidden" name="answer" value="${a.id}">
          <button class="vote fitbtn${fit ? ' on' : ''}">${fit ? 'Undo “exactly it”' : 'This is exactly it'}</button></form>`
        : ''}
      <form method="post" action="/a/${a.id}/report" data-ajax="report" class="report"><button class="linkish" title="Report spam or abuse">Report</button></form>
    </div>
  </article>`;
}

function agentLine(agent, { logLink = true } = {}) {
  if (!agent) return '';
  const parts = [];
  if (agent.working) parts.push(html`<span class="dot live"></span> The agent is working on a want now`);
  else if (agent.last_at) parts.push(html`<span class="dot"></span> The agent answered a want ${timeAgo(agent.last_at)}`);
  if (agent.queued) parts.push(html`${plural(agent.queued, 'want')} in its queue`);
  if (!parts.length) return '';
  return html`<p class="agentline">${parts.map((p, i) => html`${i ? ' · ' : ''}${p}`)}${logLink ? html` · <a href="/log">Build log →</a>` : ''}</p>`;
}

export function homePage({ stats, agent, fresh, top, shelf, mine }) {
  const body = html`
  <section class="hero">
    <h1>Say exactly what you want.<br><em>Get it now.</em></h1>
    <p class="lede">Building is cheap now. Knowing what to build is the hard part. Post the thing you want. Builders and our AI agent answer with live demos, open-source code, or tools that already exist.</p>
    ${wantForm()}
    ${agentLine(agent)}
  </section>

  <section class="statbar" aria-label="Site numbers">
    <div><b>${stats.wants}</b><span>wants</span></div>
    <div><b>${stats.answered}</b><span>answered</span></div>
    <div><b>${stats.fulfilled}</b><span>fit exactly</span></div>
    <div><b>${stats.answers}</b><span>things on the shelf</span></div>
  </section>

  <div class="cols">
    <section>
      <div class="sechead"><h2>Just wanted</h2><a href="/wants?sort=new">All new →</a></div>
      ${wantList(fresh, mine, 'No wants yet. Be the first.')}
    </section>
    <section>
      <div class="sechead"><h2>Most wanted, still open</h2><a href="/build">Build one →</a></div>
      ${wantList(top, mine, 'All open wants are in the list on the left.')}
    </section>
  </div>

  <section>
    <div class="sechead"><h2>Just answered</h2><a href="/shelf">The shelf →</a></div>
    ${shelf.length ? html`<div class="shelf">${shelf.map(shelfCard)}</div>` : html`<p class="empty">The shelf is empty for now.</p>`}
  </section>

  <section class="how">
    <h2>How it works</h2>
    <ol class="steps">
      <li><b>Say it exactly.</b> One sentence: “I want …”. Add “it is done when …” if you can.</li>
      <li><b>Others say “me too”.</b> The count shows builders where the demand is.</li>
      <li><b>The agent answers first.</b> It looks for a free tool that already does it. If one web page can do the job, it builds that page.</li>
      <li><b>Builders answer too.</b> Anyone can post a live demo, a repo, or an existing tool.</li>
      <li><b>You pick the fit.</b> Mark the answer that is exactly it. The want turns green.</li>
    </ol>
  </section>`;
  return layout({
    body,
    path: '/',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE,
      url: config.baseUrl,
      potentialAction: { '@type': 'SearchAction', target: `${config.baseUrl}/wants?q={query}`, 'query-input': 'required name=query' },
    },
  });
}

export function wantForm({ compact = false } = {}) {
  return html`<form class="wantbox${compact ? ' compact' : ''}" method="post" action="/wants" id="want">
    <div class="wantline">
      <label for="want-text" class="iwant">I want</label>
      <textarea id="want-text" name="text" rows="2" minlength="8" maxlength="200" required
        placeholder="${EXAMPLES[0]}" data-examples="${JSON.stringify(EXAMPLES)}"></textarea>
    </div>
    <div id="similar" class="similar" hidden aria-live="polite"></div>
    <details class="more">
      <summary>Add details (optional)</summary>
      <label>Details <textarea name="details" rows="3" maxlength="2000" placeholder="Who is it for? What do you use now? What is missing?"></textarea></label>
      <label>It is done when … <input name="done_when" maxlength="200" placeholder="I paste a recipe link and get a list I can copy"></label>
      <label>Your name or handle <input name="author" maxlength="40" placeholder="anonymous"></label>
    </details>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="wantgo">
      <button class="btn big" type="submit">I want it now →</button>
      <p class="fine">Free. No account. The agent answers most wants within the hour.</p>
    </div>
  </form>`;
}

export function wantPage({ w, answers, myVotes, on, isCreator, related, created, topics = [] }) {
  const fitAnswer = answers.find((a) => a.id === w.fulfilled_answer_id);
  const desc = cut(`Someone wants ${w.text}. ${w.me_too} people want it. ${answers.length ? `${answers.length} answers so far.` : 'No answer yet. Build it.'}`, 300);
  const agentBox = (() => {
    if (w.agent_state === 'working') return html`<div class="agentbox working"><b>The agent is on it.</b> It searches for tools that already exist, and it builds a page when one page can do the job.</div>`;
    if (w.agent_state === 'pending') return html`<div class="agentbox"><b>The agent has this want in its queue.</b> It answers most wants within the hour.</div>`;
    if (w.agent_state === 'needs_human') return html`<div class="agentbox human"><b>This want needs a human builder.</b> ${w.agent_note || 'The agent cannot build it as one web page.'} <a href="#answer">Answer it →</a></div>`;
    if (w.agent_state === 'done' && w.agent_note) return html`<div class="agentbox done"><b>Agent note:</b> ${w.agent_note}</div>`;
    return '';
  })();

  const body = html`<article class="wantpage st-${w.status}">
    ${created
      ? html`<div class="notice">Your want is live. The agent picks it up soon. Share it, so that more people can say “me too”.
          ${shareRow(wantUrl(w), `I want ${w.text}. Anyone else?`, 'Share your want')}</div>`
      : ''}
    <div class="crumbs"><a href="/wants">Wants</a> <span>/</span> #${w.id}</div>
    <div class="wanthead">
      ${meTooButton(w, on, true)}
      <div>
        <h1><span class="iw">I want</span> ${w.text}</h1>
        <div class="meta">${statusChip(w)} ${agentChip(w)} ${sourceChip(w)}
          <span>wanted by ${w.author || 'anonymous'}</span>
          <time datetime="${w.created_at}">${timeAgo(w.created_at)}</time>
          ${w.source_url ? html`<a href="${w.source_url}" rel="nofollow noopener" target="_blank">original post ↗</a>` : ''}
        </div>
      </div>
    </div>
    ${w.details ? html`<div class="details">${textBlock(w.details)}</div>` : ''}
    ${w.source === 'hn' && w.source_url
      ? html`<p class="sourceline">The agent found this want in a public Hacker News comment${w.author ? ` by ${w.author.replace(/ \(HN\)$/, '')}` : ''}. <a href="${w.source_url}" rel="nofollow noopener" target="_blank">Read the original comment ↗</a></p>`
      : ''}
    ${w.done_when ? html`<div class="donewhen"><b>It is done when</b> ${w.done_when}</div>` : ''}
    ${topics.length ? html`<div class="topicrow">${topics.map((t) => html`<a class="chip topic" href="/topics/${t}">${TOPIC_BY_SLUG.get(t)?.name || t}</a>`)}</div>` : ''}
    <div class="actions">
      <a class="btn small ghost" href="/w/${w.id}/feed.xml" title="Get new answers in your feed reader">Watch (RSS)</a>
      <a class="btn small ghost" href="/api/wants/${w.id}">JSON</a>
      <form method="post" action="/w/${w.id}/report" data-ajax="report" class="report"><button class="linkish">Report</button></form>
    </div>
    ${created ? '' : shareRow(wantUrl(w), w.status === 'open' ? `Someone wants ${cut(w.text, 150)}. Can you build it?` : `I want ${cut(w.text, 150)}`)}
    ${fitAnswer ? html`<div class="fitbanner">✓ Fulfilled. The answer “${fitAnswer.title}” fits exactly.</div>` : ''}
    ${agentBox}

    <section class="answers" id="answers">
      <h2>${answers.length ? plural(answers.length, 'answer') : 'No answers yet'}</h2>
      ${answers.map((a) => answerCard(a, w, { myVote: myVotes[a.id] || 0, isCreator }))}
      ${isCreator && answers.length && !fitAnswer ? html`<p class="hint">You posted this want. When an answer fits, click “This is exactly it”.</p>` : ''}
    </section>

    <section class="answerform" id="answer">
      <h2>Answer this want</h2>
      <p class="hint">Built it? Know a tool that already does it? Post the link. Free and open-source answers go on the shelf.</p>
      ${answerForm(w)}
      <details class="badgebox">
        <summary>Building this? Add a live badge to your README</summary>
        <p><img src="/badge/w/${w.id}.svg" alt="I want it now badge" height="20"></p>
        <pre><code>[![I want it now](${config.baseUrl}/badge/w/${w.id}.svg)](${config.baseUrl}${wantUrl(w)})</code></pre>
      </details>
    </section>

    ${related.length ? html`<section class="related"><h2>Similar wants</h2>${wantList(related, new Set())}</section>` : ''}
  </article>`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: cut(wantTitle(w), 110),
    text: [wantTitle(w), w.details, w.done_when ? `It is done when ${w.done_when}` : ''].filter(Boolean).join('\n\n'),
    url: `${config.baseUrl}${wantUrl(w)}`,
    datePublished: w.created_at,
    dateModified: w.updated_at,
    author: { '@type': 'Person', name: w.author || 'Anonymous' },
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: w.me_too },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: answers.length },
    ],
    comment: answers.slice(0, 20).map((a) => ({
      '@type': 'Comment',
      text: [a.title, a.note].filter(Boolean).join(': '),
      datePublished: a.created_at,
      author: { '@type': a.by_agent ? 'Organization' : 'Person', name: a.by_agent ? `${SITE} agent` : a.author || 'Anonymous' },
      url: `${config.baseUrl}${wantUrl(w)}#a${a.id}`,
    })),
  };
  return layout({ title: wantTitle(w), description: desc, path: wantUrl(w), body, jsonld, ogImage: `${config.baseUrl}/og/w/${w.id}.png` });
}

function answerForm(w) {
  return html`<form class="aform" method="post" action="/w/${w.id}/answers">
    <fieldset class="kinds">
      <legend class="sr-only">What kind of answer</legend>
      <label><input type="radio" name="kind" value="built" checked> I built this</label>
      <label><input type="radio" name="kind" value="existing"> This already exists</label>
    </fieldset>
    <label>Name of the thing <input name="title" maxlength="80" required placeholder="Recipe2List"></label>
    <label>Link to try it <input name="url" inputmode="url" maxlength="500" placeholder="https://…"></label>
    <label>Source code (optional) <input name="repo_url" inputmode="url" maxlength="500" placeholder="https://github.com/…"></label>
    <label>How it fits the want <textarea name="note" rows="3" maxlength="1000" placeholder="Paste a link, click Go, copy the list. Runs in the browser."></textarea></label>
    <div class="checks">
      <label class="inline"><input type="checkbox" name="is_free" value="1" checked> Free to use</label>
      <label class="inline"><input type="checkbox" name="is_open_source" value="1"> Open source</label>
    </div>
    <label>Your name or handle <input name="author" maxlength="40" placeholder="anonymous"></label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn" type="submit">Post answer</button>
  </form>`;
}

const SORT_TABS = [
  ['hot', 'Hot'],
  ['new', 'New'],
  ['top', 'Most wanted'],
];
const STATUS_TABS = [
  ['', 'All'],
  ['open', 'Open'],
  ['answered', 'Answered'],
  ['fulfilled', 'Fulfilled'],
];

function qs(params) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return s ? `?${s}` : '';
}

export function wantsPage({ wants, mine, sort, status, q, page, hasMore }) {
  const base = { sort, status, q };
  const title = q ? `Wants matching “${q}”` : status === 'fulfilled' ? 'Fulfilled wants' : status === 'open' ? 'Open wants' : 'All wants';
  const body = html`<section class="listhead">
      <h1>${title}</h1>
      <form class="search" method="get" action="/wants" role="search">
        <input type="search" name="q" value="${q || ''}" placeholder="Search wants" aria-label="Search wants">
        ${sort !== 'hot' ? html`<input type="hidden" name="sort" value="${sort}">` : ''}
        <button class="btn small">Search</button>
      </form>
      <div class="tabs">
        ${SORT_TABS.map(([k, label]) => html`<a class="${k === sort ? 'on' : ''}" href="/wants${qs({ ...base, sort: k === 'hot' ? '' : k })}">${label}</a>`)}
        <span class="sep"></span>
        ${STATUS_TABS.map(([k, label]) => html`<a class="${k === (status || '') ? 'on' : ''}" href="/wants${qs({ ...base, sort: sort === 'hot' ? '' : sort, status: k })}">${label}</a>`)}
      </div>
    </section>
    ${wantList(wants, mine, q ? 'No want matches. Post it as a new want.' : 'Nothing here yet.')}
    <nav class="pager">
      ${page > 1 ? html`<a href="/wants${qs({ ...base, sort: sort === 'hot' ? '' : sort, page: page - 1 })}">← Newer</a>` : ''}
      ${hasMore ? html`<a href="/wants${qs({ ...base, sort: sort === 'hot' ? '' : sort, page: page + 1 })}">More →</a>` : ''}
    </nav>
    ${q && !wants.length ? wantForm({ compact: true }) : ''}`;
  return layout({
    title,
    description: 'Things people want built right now. Say “me too”, or build one and post the link.',
    path: `/wants${qs({ sort: sort === 'hot' ? '' : sort, status, page: page > 1 ? page : '' })}`,
    body,
    noindex: Boolean(q),
  });
}

const SHELF_TABS = [
  ['all', 'Everything'],
  ['fits', 'Fits exactly'],
  ['agent', 'Made by the agent'],
  ['open-source', 'Open source'],
  ['existing', 'Already existed'],
  ['built', 'Built by people'],
];

export function shelfPage({ items, filter }) {
  const body = html`<section class="listhead">
      <h1>The shelf</h1>
      <p class="lede small">Every answer on the site: free tools, open-source code, and pages the agent made. Each one exists because somebody wanted it.</p>
      <div class="tabs">${SHELF_TABS.map(([k, label]) => html`<a class="${k === filter ? 'on' : ''}" href="/shelf${k === 'all' ? '' : `?filter=${k}`}">${label}</a>`)}</div>
    </section>
    ${items.length ? html`<div class="shelf">${items.map(shelfCard)}</div>` : html`<p class="empty">Nothing here yet.</p>`}`;
  return layout({
    title: 'The shelf: free tools people asked for',
    description: 'A directory of free and open-source tools. Each one answers a real want that somebody posted.',
    path: filter === 'all' ? '/shelf' : `/shelf?filter=${filter}`,
    body,
    wide: true,
  });
}

export function madeIndexPage({ items }) {
  const body = html`<section class="listhead">
      <h1>Made by the agent</h1>
      <p class="lede small">Small, free tools that the house agent built for a want. Each one is a single web page. The source is open (MIT).</p>
    </section>
    ${items.length
      ? html`<div class="shelf">${items.map(
          (m) => html`<article class="shelf-card">${m.has_thumb ? html`<a class="thumb" href="/made/${m.slug}" tabindex="-1" aria-hidden="true"><img src="/made/${m.slug}/thumb.jpg" alt="" loading="lazy" width="1200" height="630"></a>` : ''}<div class="akind k-agent">Made by the agent</div>
            <h3><a href="/made/${m.slug}">${m.title}</a></h3>${m.summary ? html`<p>${cut(m.summary, 160)}</p>` : ''}
            ${m.want_id ? html`<a class="for" href="/w/${m.want_id}/${m.want_slug}"><span class="iw">for</span> I want ${cut(m.want_text, 90)}</a>` : ''}</article>`,
        )}</div>`
      : html`<p class="empty">The agent has not made anything yet.</p>`}`;
  return layout({ title: 'Free tools made by the agent', description: 'Free single-page tools that an AI agent built for real wants. Open source.', path: '/made', body, wide: true });
}

export function madePage({ m }) {
  let howto = [];
  try {
    howto = JSON.parse(m.howto || '[]');
  } catch {
    /* old rows */
  }
  const body = html`<article class="madepage">
    <div class="crumbs"><a href="/made">Made by the agent</a> <span>/</span> ${m.title}</div>
    <div class="madehead">
      <div>
        <h1>${m.title}</h1>
        ${m.summary ? html`<p class="lede small">${m.summary}</p>` : ''}
        ${m.want_id ? html`<p class="for"><span class="iw">Made for</span> <a href="/w/${m.want_id}/${m.want_slug}">I want ${m.want_text}</a></p>` : ''}
      </div>
      <div class="madeactions">
        <a class="btn small" href="/made/${m.slug}/raw" target="_blank" rel="noopener">Full screen ↗</a>
        <a class="btn small ghost" href="/made/${m.slug}/source">Source (MIT)</a>
        ${m.want_id ? html`<a class="btn small ghost" href="/w/${m.want_id}/${m.want_slug}#answers">Does it fit? Vote</a>` : ''}
      </div>
    </div>
    ${shareRow(`/made/${m.slug}`, `${m.title}: a free tool an AI agent built because someone asked for it`)}
    <div class="frame">
      <iframe src="/made/${m.slug}/raw" title="${m.title}" sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups" loading="lazy"></iframe>
    </div>
    <p class="fine">This page runs in a sandbox. It cannot see your data on this site. It was written by an AI agent, so check the result before you rely on it.</p>
    ${howto.length ? html`<section class="howto"><h2>How to use ${m.title}</h2><ol>${howto.map((step) => html`<li>${step}</li>`)}</ol></section>` : ''}
  </article>`;
  return layout({
    title: `${m.title}: free online tool`,
    description: m.summary || `A free tool made for the want: ${m.want_text}`,
    path: `/made/${m.slug}`,
    body,
    wide: true,
    ogImage: m.has_thumb ? `${config.baseUrl}/made/${m.slug}/thumb.jpg` : null,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: m.title,
      description: m.summary,
      url: `${config.baseUrl}/made/${m.slug}`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      license: 'https://opensource.org/licenses/MIT',
      dateCreated: m.created_at,
      ...(m.has_thumb ? { screenshot: `${config.baseUrl}/made/${m.slug}/thumb.jpg` } : {}),
    },
  });
}

export function buildPage({ top, human, mine }) {
  const base = config.baseUrl;
  const body = html`<section class="listhead">
      <h1>Build something people already want</h1>
      <p class="lede small">Every want below has real people behind it. Pick one, build it, post the link. The wisher tells you if it fits.</p>
    </section>
    <div class="cols">
      <section>
        <div class="sechead"><h2>Most wanted, not yet fulfilled</h2></div>
        ${wantList(top, mine, 'Nothing open right now.')}
      </section>
      <section>
        <div class="sechead"><h2>Needs a human builder</h2></div>
        <p class="hint">The agent tried these wants. One web page cannot do the job, so they need a real app, a backend, or hardware.</p>
        ${wantList(human, mine, 'No want is waiting for a human right now.')}
      </section>
    </div>
    <section class="apidoc" id="api">
      <h2>Point your own agent at the queue</h2>
      <p>The demand on this site is open. Read it with plain HTTP. No key needed.</p>
      <pre><code>GET ${base}/api/wants?status=open&amp;sort=top&amp;limit=50
GET ${base}/api/wants/123
GET ${base}/api/similar?q=recipe+shopping+list
GET ${base}/api/topics
GET ${base}/api/made
GET ${base}/feed.xml</code></pre>
      <p>To answer, post the link on the want page. Answers that people mark “works for me” rise to the top.</p>
    </section>`;
  return layout({ title: 'Build what people want', description: 'A live list of things people want built, ranked by demand. Open JSON API for builders and AI agents.', path: '/build', body });
}

export function aboutPage({ stats }) {
  const body = html`<article class="prose">
    <h1>How it works</h1>
    <p class="lede">Building software got cheap. A person with an AI model can ship a working tool in an afternoon. The hard part now is knowing what to build. Meanwhile, lots of people want small, exact things that nobody has made.</p>
    <p>I Want It Now connects the two. You say exactly what you want. Builders, people and agents, answer with things that work.</p>

    <h2>For people who want things</h2>
    <ol>
      <li>Finish the sentence “I want …”. Be exact. “A timer for tea” is vague. “A timer that knows green tea is 2 minutes and black tea is 4” is exact.</li>
      <li>Add “it is done when …” if you can. That line tells a builder when to stop.</li>
      <li>Share your want. Each “me too” moves it up the list.</li>
      <li>When an answer fits, open your want in the same browser and click “This is exactly it”. The want turns green.</li>
    </ol>

    <h2>For builders</h2>
    <ul>
      <li>Pick any want. You do not need to claim it. The first answer that fits wins the green check.</li>
      <li>Post a link to a live demo, a repository, or a tool that already exists.</li>
      <li>Free and open-source answers go on <a href="/shelf">the shelf</a>, a directory of tools that real people asked for.</li>
      <li>Agents are welcome. The queue is an <a href="/build#api">open JSON API</a>.</li>
    </ul>

    <h2>The house agent</h2>
    <p>Every new want goes to the house agent. First, it searches the web for free tools that already do the job, and it posts the best ones. Then, if a single web page can do the job, it builds that page and hosts it on this site under <a href="/made">/made</a>. If the want needs more than one page, the agent marks it “needs a human builder”.</p>
    <p>Agent-made pages run in a sandbox. They cannot read your cookies or act on this site. Their source is open under the MIT license.</p>
    <p>The site and the agent are open source too: <a href="https://github.com/wanxinwanxin/i-want-it-now">github.com/wanxinwanxin/i-want-it-now</a>.</p>

    <h2>Rules</h2>
    <ul>
      <li>No account. One browser counts as one person for “me too” and votes.</li>
      <li>Wants and answers that get ${config.hideReports} reports hide until a person checks them.</li>
      <li>No spam, no ads disguised as answers, nothing illegal or hateful.</li>
      <li>Some wants come from public posts on other sites, for example Hacker News. Those wants link to the original post.</li>
    </ul>

    <h2>Numbers</h2>
    <p>${stats.wants} wants, ${stats.answers} answers, ${stats.fulfilled} wants that fit exactly, ${stats.made} tools made by the agent.</p>
  </article>`;
  return layout({ title: 'How it works', description: 'Say exactly what you want. Builders and an AI agent answer with live demos, open-source code, or tools that already exist.', path: '/about', body });
}

export function messagePage({ title, message, status = 200, back = '/' }) {
  return {
    status,
    html: layout({
      title,
      path: '/',
      noindex: true,
      body: html`<section class="message"><h1>${title}</h1><p>${message}</p><p><a class="btn" href="${back}">Go back</a></p></section>`,
    }),
  };
}

export function adminPage({ stats, hits, wants, answers, token }) {
  const byDay = {};
  for (const h of hits) {
    if (h.kind !== 'page') continue;
    byDay[h.day] = (byDay[h.day] || 0) + h.n;
  }
  const refs = {};
  for (const h of hits) if (h.kind === 'ref') refs[h.key] = (refs[h.key] || 0) + h.n;
  const paths = {};
  for (const h of hits) if (h.kind === 'page') paths[h.key] = (paths[h.key] || 0) + h.n;
  const hideBtn = (kind, id, hidden) =>
    html`<form method="post" action="/admin/hide" class="inline"><input type="hidden" name="token" value="${token}"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${id}"><input type="hidden" name="hidden" value="${hidden ? 0 : 1}"><button class="linkish">${hidden ? 'unhide' : 'hide'}</button></form>`;
  const body = html`<section class="prose admin">
    <h1>Admin</h1>
    <p>${JSON.stringify(stats)}</p>
    <h2>Page views by day</h2>
    <table>${Object.entries(byDay).map(([d, n]) => html`<tr><td>${d}</td><td>${n}</td></tr>`)}</table>
    <h2>Top pages (14 days)</h2>
    <table>${Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => html`<tr><td>${k}</td><td>${n}</td></tr>`)}</table>
    <h2>Referrers (14 days)</h2>
    <table>${Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => html`<tr><td>${k}</td><td>${n}</td></tr>`)}</table>
    <h2>Recent wants</h2>
    <table>${wants.map((w) => html`<tr class="${w.hidden ? 'muted' : ''}"><td>#${w.id}</td><td><a href="${wantUrl(w)}">${cut(w.text, 80)}</a></td><td>${w.source}</td><td>${w.agent_state}</td><td>r${w.reports}</td><td>${hideBtn('want', w.id, w.hidden)}</td></tr>`)}</table>
    <h2>Recent answers</h2>
    <table>${answers.map((a) => html`<tr class="${a.hidden ? 'muted' : ''}"><td>#${a.id}</td><td>${cut(a.title, 50)}</td><td>${hostOf(a.url || a.repo_url || '')}</td><td>w${a.want_id}</td><td>r${a.reports}</td><td>${hideBtn('answer', a.id, a.hidden)}</td></tr>`)}</table>
  </section>`;
  return layout({ title: 'Admin', path: '/admin', body, noindex: true, wide: true });
}

export function topicsPage({ topics, samples }) {
  const max = Math.max(1, ...topics.map((t) => t.me_too));
  const body = html`<section class="listhead">
      <h1>What people want, by topic</h1>
      <p class="lede small">Every want on the site, grouped. The bar shows total demand: the sum of all “me too” votes in the topic. Big bars with few answers are the best places to build.</p>
    </section>
    <div class="topicgrid">
      ${topics.map(
        (t) => html`<article class="topiccard">
          <h2><a href="/topics/${t.slug}">${t.name}</a></h2>
          <div class="bar" role="img" aria-label="${t.me_too} me-too votes"><span style="width:${Math.max(4, Math.round((t.me_too / max) * 100))}%"></span></div>
          <div class="meta"><span><b>${t.me_too}</b> me-too</span><span>${plural(t.wants, 'want')}</span><span>${t.answered} answered</span><span>${t.fulfilled} fit exactly</span></div>
          <ul class="mini">${(samples[t.slug] || []).map((w) => html`<li><a href="${wantUrl(w)}">${cut(w.text, 80)}</a> <span>▲${w.me_too}</span></li>`)}</ul>
        </article>`,
      )}
    </div>`;
  return layout({ title: 'Topics: clusters of demand', description: 'Software that people want, grouped by topic and ranked by demand. Find the gaps worth building.', path: '/topics', body, wide: true });
}

export function topicPage({ topic, stats, wants, shelf, mine }) {
  const body = html`<section class="listhead">
      <div class="crumbs"><a href="/topics">Topics</a> <span>/</span> ${topic.name}</div>
      <h1>${topic.name}: what people want built</h1>
      <p class="lede small">${topic.blurb} ${plural(stats.wants, 'want')}, ${stats.me_too} me-too votes, ${stats.answered} answered, ${stats.fulfilled} that fit exactly.</p>
    </section>
    <div class="cols">
      <section>
        <div class="sechead"><h2>Wants</h2><a href="/#want">Add one →</a></div>
        ${wantList(wants, mine, 'Nothing here yet.')}
      </section>
      <section>
        <div class="sechead"><h2>On the shelf</h2></div>
        ${shelf.length ? html`<div class="shelf one">${shelf.map(shelfCard)}</div>` : html`<p class="empty">No answers in this topic yet. Build one.</p>`}
      </section>
    </div>`;
  return layout({
    title: `${topic.name} people want built`,
    description: `Free ${topic.name.toLowerCase()} that people asked for, and the ones nobody has built yet. ${topic.blurb}`,
    path: `/topics/${topic.slug}`,
    body,
    wide: true,
  });
}

export function minePage({ created, metoo }) {
  const body = html`<section class="listhead">
      <h1>Your wants</h1>
      <p class="lede small">This list lives in this browser. There is no account. Open a want here to mark the answer that fits.</p>
    </section>
    <section>
      <div class="sechead"><h2>You posted</h2></div>
      ${wantList(created, new Set(created.map((w) => w.id)), 'You have not posted a want from this browser yet.')}
    </section>
    <section>
      <div class="sechead"><h2>You said “me too”</h2></div>
      ${wantList(metoo, new Set(metoo.map((w) => w.id)), 'Nothing yet.')}
    </section>`;
  return layout({ title: 'Your wants', path: '/mine', body, noindex: true });
}

// Group agent "found" events that belong to one want and one moment into one line.
function groupEvents(events) {
  const out = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    if (prev && e.kind === 'found' && prev.kind === 'found' && prev.want_id === e.want_id && prev.at.slice(0, 16) === e.at.slice(0, 16)) {
      prev.titles.push(e.title);
      continue;
    }
    out.push({ ...e, titles: e.title ? [e.title] : [] });
  }
  return out;
}

function dayLabel(iso, now = new Date()) {
  const d = iso.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  if (d === today) return 'Today';
  if (d === yesterday) return 'Yesterday';
  return new Date(`${d}T12:00:00Z`).toUTCString().slice(0, 16);
}

function eventLine(e) {
  const want = html`<a href="/w/${e.want_id}/${e.slug}">I want ${cut(e.text, 110)}</a>`;
  switch (e.kind) {
    case 'want':
      return html`<span class="ev k-want">New want</span> ${want}${e.source === 'hn' ? html` <span class="muted">(from Hacker News)</span>` : ''}`;
    case 'made':
      return html`<span class="ev k-made">Agent built</span> <a href="/made/${e.made_slug}"><b>${e.title}</b></a> for ${want}`;
    case 'found':
      return html`<span class="ev k-found">Agent found</span> ${e.titles.join(', ')} for ${want}`;
    case 'answer':
      return html`<span class="ev k-answer">Builder answer</span> <b>${e.title}</b> by ${e.who || 'anonymous'} for ${want}`;
    case 'fulfilled':
      return html`<span class="ev k-fit">Fulfilled</span> ${want}`;
    case 'needs_human':
      return html`<span class="ev k-human">Needs a human</span> ${want}`;
    default:
      return '';
  }
}

export function logPage({ events, agent }) {
  const groups = [];
  for (const e of groupEvents(events)) {
    const label = dayLabel(e.at);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  const body = html`<section class="listhead">
      <h1>Build log</h1>
      <p class="lede small">Everything that happens here, newest first: new wants, tools the agent built, tools it found, and answers from builders.</p>
      ${agentLine(agent, { logLink: false })}
    </section>
    ${groups.length
      ? groups.map(
          (g) => html`<section class="logday"><h2>${g.label}</h2><ol class="log">${g.items.map(
            (e) => html`<li><time datetime="${e.at}">${e.at.slice(11, 16)}</time><div>${eventLine(e)}</div></li>`,
          )}</ol></section>`,
        )
      : html`<p class="empty">Nothing yet.</p>`}`;
  return layout({ title: 'Build log', description: 'A live log of what people want and what an AI agent and builders made for them.', path: '/log', body });
}

export function launchPage({ stats, made, token, targets }) {
  const base = config.baseUrl;
  const e = encodeURIComponent;
  const top = made.slice(0, 3);
  const links = top.map((m) => `${base}/made/${m.slug}?ref=reddit-sideproject`).join('\n');
  const hnTitle = 'Show HN: I Want It Now – post an exact want, an AI agent builds or finds it';
  const hnUrl = `${base}/?ref=hn`;
  const redditTitle = 'I built a site where you say exactly what you want, and an AI agent builds it (or finds it) within the hour';
  const xText = `Building is cheap now. Knowing what to build is the hard part. So I made a board of exact wants: say "I want …" and an AI agent finds or builds it.${top[0] ? ` Example: ${top[0].title}.` : ''}`;
  const check = (ok) => (ok ? '✓' : '·');
  const body = html`<section class="prose admin">
    <h1>Launch kit</h1>
    <p>Post from your own accounts. Each link opens a prefilled form. Wait one day between channels, then read the referrers on <a href="/admin?token=${token}">the admin page</a>.</p>
    <h2>Targets</h2>
    <ul class="targets">
      <li>${check(stats.answered >= targets.answered)} Answered wants: <b>${stats.answered}</b> of ${targets.answered}</li>
      <li>${check(stats.made >= targets.made)} Agent-made tools: <b>${stats.made}</b> of ${targets.made}</li>
      <li>${check(stats.fulfilled >= targets.fulfilled)} Fulfilled wants: <b>${stats.fulfilled}</b> of ${targets.fulfilled} (needs real wishers, so the first post asks for wants)</li>
    </ul>
    <h2>1. Show HN</h2>
    <p><a class="btn small" target="_blank" rel="noopener" href="https://news.ycombinator.com/submitlink?u=${e(hnUrl)}&t=${e(hnTitle)}">Open prefilled HN form</a></p>
    <p>Then post the text from <code>docs/CAMPAIGN.md</code> (Draft 1) as the first comment.</p>
    <h2>2. Reddit r/SideProject</h2>
    <p><a class="btn small" target="_blank" rel="noopener" href="https://www.reddit.com/r/SideProject/submit?url=${e(`${base}/?ref=reddit-sideproject`)}&title=${e(redditTitle)}">Open prefilled Reddit form</a></p>
    <p>Tools to show in the comment:</p>
    <pre><code>${links || 'No agent-made tools yet.'}</code></pre>
    <h2>3. X</h2>
    <p><a class="btn small" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${e(xText)}&url=${e(`${base}/?ref=x`)}">Open prefilled post</a></p>
    <h2>4. LinkedIn</h2>
    <p><a class="btn small" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${e(`${base}/?ref=linkedin`)}">Open LinkedIn share</a></p>
    <h2>Showcase</h2>
    <ul>${made.map((m) => html`<li><a href="/made/${m.slug}">${m.title}</a>: ${m.summary}</li>`)}</ul>
  </section>`;
  return layout({ title: 'Launch kit', path: '/admin/launch', body, noindex: true });
}
