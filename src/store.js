import { config } from './config.js';
import { slugify, ftsQuery } from './util.js';
import { classify, TOPICS } from './topics.js';

const WANT_COLS = `w.id, w.slug, w.text, w.details, w.done_when, w.author, w.source, w.source_url, w.status,
  w.me_too, w.answer_count, w.fulfilled_answer_id, w.fulfilled_at, w.agent_state, w.agent_note, w.agent_at,
  w.created_at, w.updated_at, w.hidden`;

const SORTS = {
  new: 'w.created_at DESC',
  top: 'w.me_too DESC, w.created_at DESC',
  // "hot" ranks demand with a time decay, like a news site.
  hot: `(w.me_too + 1.0) / pow((julianday('now') - julianday(w.created_at)) * 24 + 2, 1.5) DESC`,
  answered: 'w.updated_at DESC',
};

export function createStore(db) {
  const now = () => new Date().toISOString();

  const stmt = {
    insertWant: db.prepare(`INSERT INTO wants (slug, text, details, done_when, author, creator, ip, source, source_url, me_too)
      VALUES (@slug, @text, @details, @done_when, @author, @creator, @ip, @source, @source_url, @me_too)`),
    getWant: db.prepare(`SELECT ${WANT_COLS}, w.creator FROM wants w WHERE w.id = ?`),
    wantBySource: db.prepare(`SELECT id FROM wants WHERE source_url = ?`),
    addMeToo: db.prepare(`INSERT OR IGNORE INTO metoos (want_id, voter) VALUES (?, ?)`),
    delMeToo: db.prepare(`DELETE FROM metoos WHERE want_id = ? AND voter = ?`),
    hasMeToo: db.prepare(`SELECT 1 FROM metoos WHERE want_id = ? AND voter = ?`),
    countMeToo: db.prepare(`UPDATE wants SET me_too = (SELECT count(*) FROM metoos WHERE want_id = @id) + CASE WHEN source != 'site' THEN 1 ELSE 0 END WHERE id = @id`),
    insertAnswer: db.prepare(`INSERT INTO answers (want_id, kind, title, url, repo_url, note, author, by_agent, is_free, is_open_source, made_id, creator, ip)
      VALUES (@want_id, @kind, @title, @url, @repo_url, @note, @author, @by_agent, @is_free, @is_open_source, @made_id, @creator, @ip)`),
    getAnswer: db.prepare(`SELECT * FROM answers WHERE id = ?`),
    answersFor: db.prepare(`SELECT a.*, m.slug AS made_slug FROM answers a LEFT JOIN made m ON m.id = a.made_id
      WHERE a.want_id = ? AND a.hidden = 0 ORDER BY (a.id = (SELECT fulfilled_answer_id FROM wants WHERE id = a.want_id)) DESC, (a.works - a.nofit) DESC, a.created_at ASC`),
    countAnswers: db.prepare(`UPDATE wants SET answer_count = (SELECT count(*) FROM answers WHERE want_id = @id AND hidden = 0) WHERE id = @id`),
    getVote: db.prepare(`SELECT value FROM answer_votes WHERE answer_id = ? AND voter = ?`),
    setVote: db.prepare(`INSERT INTO answer_votes (answer_id, voter, value) VALUES (?, ?, ?)
      ON CONFLICT(answer_id, voter) DO UPDATE SET value = excluded.value`),
    delVote: db.prepare(`DELETE FROM answer_votes WHERE answer_id = ? AND voter = ?`),
    countVotes: db.prepare(`UPDATE answers SET
      works = (SELECT count(*) FROM answer_votes WHERE answer_id = @id AND value = 1),
      nofit = (SELECT count(*) FROM answer_votes WHERE answer_id = @id AND value = -1) WHERE id = @id`),
    myVotes: db.prepare(`SELECT v.answer_id, v.value FROM answer_votes v JOIN answers a ON a.id = v.answer_id WHERE a.want_id = ? AND v.voter = ?`),
    addReport: db.prepare(`INSERT OR IGNORE INTO reports (kind, target_id, voter) VALUES (?, ?, ?)`),
    insertMade: db.prepare(`INSERT INTO made (slug, want_id, title, summary, html) VALUES (@slug, @want_id, @title, @summary, @html)`),
    getMade: db.prepare(`SELECT m.*, w.text AS want_text, w.slug AS want_slug FROM made m LEFT JOIN wants w ON w.id = m.want_id WHERE m.slug = ? AND m.hidden = 0`),
    madeSlugTaken: db.prepare(`SELECT 1 FROM made WHERE slug = ?`),
  };

  function touch(id) {
    db.prepare(`UPDATE wants SET updated_at = ? WHERE id = ?`).run(now(), id);
  }

  function refreshStatus(wantId) {
    const w = stmt.getWant.get(wantId);
    if (!w) return;
    let status = w.status;
    let fulfilledId = w.fulfilled_answer_id;
    if (fulfilledId) {
      const a = stmt.getAnswer.get(fulfilledId);
      if (!a || a.hidden) fulfilledId = null;
    }
    if (!fulfilledId) {
      const best = db
        .prepare(`SELECT id FROM answers WHERE want_id = ? AND hidden = 0 AND works >= ? AND works > nofit ORDER BY works DESC LIMIT 1`)
        .get(wantId, config.fulfillVotes);
      if (best) fulfilledId = best.id;
    }
    if (fulfilledId) status = 'fulfilled';
    else if (w.answer_count > 0) status = 'answered';
    else status = 'open';
    const fulfilledAt = fulfilledId ? w.fulfilled_at || now() : null;
    db.prepare(`UPDATE wants SET status = ?, fulfilled_answer_id = ?, fulfilled_at = ? WHERE id = ?`).run(status, fulfilledId, fulfilledAt, wantId);
  }

  const api = {
    db,

    createWant({ text, details = '', done_when = '', author = '', creator = null, ip = null, source = 'site', source_url = null }) {
      return db.transaction(() => {
        if (source_url) {
          const existing = stmt.wantBySource.get(source_url);
          if (existing) return { id: existing.id, duplicate: true };
        }
        const info = stmt.insertWant.run({
          slug: slugify(text),
          text,
          details,
          done_when,
          author,
          creator,
          ip,
          source,
          source_url,
          me_too: source === 'site' ? 0 : 1,
        });
        const id = Number(info.lastInsertRowid);
        if (creator) stmt.addMeToo.run(id, creator);
        stmt.countMeToo.run({ id });
        api.setTopics(id, classify(`${text} ${details} ${done_when}`), false);
        return { id, duplicate: false };
      })();
    },

    getWant(id) {
      const w = stmt.getWant.get(id);
      return w || null;
    },

    listWants({ sort = 'hot', status = null, q = null, limit = 30, offset = 0, source = null, agent = null, topic = null, creator = null, meToo = null } = {}) {
      const where = ['w.hidden = 0'];
      const params = {};
      if (topic) {
        where.push('w.id IN (SELECT want_id FROM want_topics WHERE topic = @topic)');
        params.topic = topic;
      }
      if (creator) {
        where.push('w.creator = @creator');
        params.creator = creator;
      }
      if (meToo) {
        where.push('w.id IN (SELECT want_id FROM metoos WHERE voter = @meToo) AND (w.creator IS NULL OR w.creator != @meToo)');
        params.meToo = meToo;
      }
      if (status === 'open') where.push(`w.status = 'open'`);
      else if (status === 'unfulfilled') where.push(`w.status != 'fulfilled'`);
      else if (status) {
        where.push('w.status = @status');
        params.status = status;
      }
      if (source) {
        where.push('w.source = @source');
        params.source = source;
      }
      if (agent) {
        where.push('w.agent_state = @agent');
        params.agent = agent;
      }
      let from = 'wants w';
      let order = SORTS[sort] || SORTS.hot;
      if (q) {
        const fq = ftsQuery(q);
        if (!fq) return [];
        from = 'wants_fts f JOIN wants w ON w.id = f.rowid';
        where.push('wants_fts MATCH @fq');
        params.fq = fq;
        if (sort === 'relevance' || !SORTS[sort]) order = 'bm25(wants_fts) ASC';
      }
      params.limit = Math.min(Math.max(Number(limit) || 30, 1), 100);
      params.offset = Math.max(Number(offset) || 0, 0);
      return db.prepare(`SELECT ${WANT_COLS} FROM ${from} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT @limit OFFSET @offset`).all(params);
    },

    similarWants(text, { excludeId = 0, limit = 5 } = {}) {
      const fq = ftsQuery(text);
      if (!fq) return [];
      return db
        .prepare(
          `SELECT ${WANT_COLS}, bm25(wants_fts) AS score FROM wants_fts f JOIN wants w ON w.id = f.rowid
           WHERE wants_fts MATCH ? AND w.hidden = 0 AND w.id != ? ORDER BY score ASC LIMIT ?`,
        )
        .all(fq, excludeId, limit);
    },

    toggleMeToo(wantId, voter) {
      return db.transaction(() => {
        const has = stmt.hasMeToo.get(wantId, voter);
        if (has) stmt.delMeToo.run(wantId, voter);
        else stmt.addMeToo.run(wantId, voter);
        stmt.countMeToo.run({ id: wantId });
        return { on: !has, count: stmt.getWant.get(wantId).me_too };
      })();
    },

    hasMeToo(wantId, voter) {
      return Boolean(voter && stmt.hasMeToo.get(wantId, voter));
    },

    addAnswer(a) {
      return db.transaction(() => {
        const info = stmt.insertAnswer.run({
          want_id: a.want_id,
          kind: a.kind,
          title: a.title,
          url: a.url || null,
          repo_url: a.repo_url || null,
          note: a.note || '',
          author: a.author || '',
          by_agent: a.by_agent ? 1 : 0,
          is_free: a.is_free == null ? null : a.is_free ? 1 : 0,
          is_open_source: a.is_open_source == null ? null : a.is_open_source ? 1 : 0,
          made_id: a.made_id || null,
          creator: a.creator || null,
          ip: a.ip || null,
        });
        stmt.countAnswers.run({ id: a.want_id });
        touch(a.want_id);
        refreshStatus(a.want_id);
        return Number(info.lastInsertRowid);
      })();
    },

    answersFor(wantId) {
      return stmt.answersFor.all(wantId);
    },

    getAnswer(id) {
      return stmt.getAnswer.get(id) || null;
    },

    myVotes(wantId, voter) {
      const out = {};
      if (!voter) return out;
      for (const r of stmt.myVotes.all(wantId, voter)) out[r.answer_id] = r.value;
      return out;
    },

    vote(answerId, voter, value) {
      return db.transaction(() => {
        const a = stmt.getAnswer.get(answerId);
        if (!a || a.hidden) return null;
        const prev = stmt.getVote.get(answerId, voter);
        if (prev && prev.value === value) stmt.delVote.run(answerId, voter);
        else stmt.setVote.run(answerId, voter, value);
        stmt.countVotes.run({ id: answerId });
        refreshStatus(a.want_id);
        const after = stmt.getAnswer.get(answerId);
        const mine = stmt.getVote.get(answerId, voter);
        return { works: after.works, nofit: after.nofit, mine: mine ? mine.value : 0 };
      })();
    },

    // The wisher picks the answer that fits exactly. Pick the same answer again to undo.
    confirm(wantId, answerId, voter) {
      return db.transaction(() => {
        const w = stmt.getWant.get(wantId);
        if (!w || !w.creator || w.creator !== voter) return { error: 'Only the person who posted this want can confirm an answer.' };
        const a = stmt.getAnswer.get(answerId);
        if (!a || a.want_id !== wantId || a.hidden) return { error: 'Answer not found.' };
        const next = w.fulfilled_answer_id === answerId ? null : answerId;
        db.prepare(`UPDATE wants SET fulfilled_answer_id = ?, fulfilled_at = ? WHERE id = ?`).run(next, next ? now() : null, wantId);
        refreshStatus(wantId);
        touch(wantId);
        return { fulfilled: Boolean(next) };
      })();
    },

    report(kind, id, voter) {
      return db.transaction(() => {
        const info = stmt.addReport.run(kind, id, voter);
        if (!info.changes) return { ok: true };
        const table = kind === 'want' ? 'wants' : 'answers';
        db.prepare(`UPDATE ${table} SET reports = reports + 1 WHERE id = ?`).run(id);
        const row = db.prepare(`SELECT reports, ${kind === 'want' ? 'id AS want_id' : 'want_id'} FROM ${table} WHERE id = ?`).get(id);
        if (row && row.reports >= config.hideReports) api.setHidden(kind, id, true);
        return { ok: true };
      })();
    },

    setHidden(kind, id, hidden) {
      const flag = hidden ? 1 : 0;
      if (kind === 'want') {
        db.prepare(`UPDATE wants SET hidden = ? WHERE id = ?`).run(flag, id);
      } else if (kind === 'answer') {
        const a = stmt.getAnswer.get(id);
        if (!a) return;
        db.prepare(`UPDATE answers SET hidden = ? WHERE id = ?`).run(flag, id);
        if (a.made_id) db.prepare(`UPDATE made SET hidden = ? WHERE id = ?`).run(flag, a.made_id);
        stmt.countAnswers.run({ id: a.want_id });
        refreshStatus(a.want_id);
      } else if (kind === 'made') {
        db.prepare(`UPDATE made SET hidden = ? WHERE id = ?`).run(flag, id);
      }
    },

    addMade({ want_id, title, summary, html }) {
      let slug = slugify(title, 50);
      for (let i = 2; stmt.madeSlugTaken.get(slug); i++) slug = `${slugify(title, 46)}-${i}`;
      const info = stmt.insertMade.run({ slug, want_id, title, summary, html });
      return { id: Number(info.lastInsertRowid), slug };
    },

    getMade(slug) {
      return stmt.getMade.get(slug) || null;
    },

    listMade({ limit = 50 } = {}) {
      return db
        .prepare(`SELECT m.id, m.slug, m.title, m.summary, m.created_at, m.want_id, w.text AS want_text, w.slug AS want_slug
          FROM made m LEFT JOIN wants w ON w.id = m.want_id WHERE m.hidden = 0 ORDER BY m.created_at DESC LIMIT ?`)
        .all(limit);
    },

    // The shelf: every visible answer, newest first, with the want it answers.
    shelf({ filter = 'all', limit = 60, offset = 0, topic = null } = {}) {
      const where = ['a.hidden = 0', 'w.hidden = 0'];
      if (topic) where.push(`w.id IN (SELECT want_id FROM want_topics WHERE topic = '${topic.replace(/[^a-z-]/g, '')}')`);
      if (filter === 'agent') where.push('a.made_id IS NOT NULL');
      else if (filter === 'open-source') where.push('(a.made_id IS NOT NULL OR a.is_open_source = 1 OR (a.is_open_source IS NULL AND a.repo_url IS NOT NULL))');
      else if (filter === 'existing') where.push(`a.kind = 'existing'`);
      else if (filter === 'built') where.push(`a.kind = 'built'`);
      else if (filter === 'fits') where.push('w.fulfilled_answer_id = a.id');
      return db
        .prepare(
          `SELECT a.*, m.slug AS made_slug, w.text AS want_text, w.slug AS want_slug, w.me_too AS want_me_too,
             (w.fulfilled_answer_id = a.id) AS is_fit
           FROM answers a JOIN wants w ON w.id = a.want_id LEFT JOIN made m ON m.id = a.made_id
           WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(Math.min(limit, 200), offset);
    },

    stats() {
      return db
        .prepare(
          `SELECT
            (SELECT count(*) FROM wants WHERE hidden = 0) AS wants,
            (SELECT count(*) FROM wants WHERE hidden = 0 AND status != 'open') AS answered,
            (SELECT count(*) FROM wants WHERE hidden = 0 AND status = 'fulfilled') AS fulfilled,
            (SELECT count(*) FROM answers WHERE hidden = 0) AS answers,
            (SELECT count(*) FROM made WHERE hidden = 0) AS made,
            (SELECT coalesce(sum(me_too), 0) FROM wants WHERE hidden = 0) AS me_too`,
        )
        .get();
    },

    // ---- Topics (clusters of demand) ----

    setTopics(wantId, topics, byAgent) {
      db.transaction(() => {
        db.prepare(`DELETE FROM want_topics WHERE want_id = ?`).run(wantId);
        const ins = db.prepare(`INSERT OR IGNORE INTO want_topics (want_id, topic, by_agent) VALUES (?, ?, ?)`);
        for (const t of topics) ins.run(wantId, t, byAgent ? 1 : 0);
      })();
    },

    topicsFor(wantId) {
      return db.prepare(`SELECT topic FROM want_topics WHERE want_id = ? ORDER BY rowid`).all(wantId).map((r) => r.topic);
    },

    // Demand for each topic: number of wants, total me-too, and how many are answered or fulfilled.
    topicStats() {
      const rows = db
        .prepare(
          `SELECT t.topic, count(*) AS wants, sum(w.me_too) AS me_too,
             sum(w.status != 'open') AS answered, sum(w.status = 'fulfilled') AS fulfilled,
             sum(w.status != 'fulfilled' AND w.agent_state = 'needs_human') AS needs_human
           FROM want_topics t JOIN wants w ON w.id = t.want_id WHERE w.hidden = 0 GROUP BY t.topic`,
        )
        .all();
      const byTopic = new Map(rows.map((r) => [r.topic, r]));
      return TOPICS.map((t) => ({ ...t, ...(byTopic.get(t.slug) || { wants: 0, me_too: 0, answered: 0, fulfilled: 0, needs_human: 0 }) }))
        .filter((t) => t.wants > 0)
        .sort((a, b) => b.me_too - a.me_too || b.wants - a.wants);
    },

    backfillTopics() {
      const rows = db.prepare(`SELECT id, text, details, done_when FROM wants WHERE id NOT IN (SELECT want_id FROM want_topics)`).all();
      for (const r of rows) api.setTopics(r.id, classify(`${r.text} ${r.details} ${r.done_when}`), false);
      return rows.length;
    },

    // ---- Agent queue ----

    agentQueue(limit = 3) {
      // A "working" claim older than one hour is stale, so the agent can take it again.
      return db
        .prepare(
          `SELECT ${WANT_COLS} FROM wants w WHERE w.hidden = 0 AND (w.agent_state = 'pending'
             OR (w.agent_state = 'working' AND w.agent_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')))
           ORDER BY w.me_too DESC, w.created_at ASC LIMIT ?`,
        )
        .all(Math.min(Number(limit) || 3, 20));
    },

    agentClaim(id) {
      const info = db
        .prepare(
          `UPDATE wants SET agent_state = 'working', agent_at = ? WHERE id = ? AND hidden = 0 AND (agent_state = 'pending'
             OR (agent_state = 'working' AND agent_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')))`,
        )
        .run(now(), id);
      return info.changes === 1;
    },

    agentFinish(id, state, note) {
      db.prepare(`UPDATE wants SET agent_state = ?, agent_note = ?, agent_at = ? WHERE id = ?`).run(state, note || '', now(), id);
      touch(id);
    },

    resetAgent(id) {
      db.prepare(`UPDATE wants SET agent_state = 'pending', agent_at = NULL WHERE id = ?`).run(id);
    },

    // ---- Analytics: daily counters only, no personal data ----

    hit(kind, key) {
      const day = now().slice(0, 10);
      db.prepare(`INSERT INTO hits (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1`).run(day, kind, key.slice(0, 120));
    },

    hitsSummary(days = 14) {
      return db
        .prepare(`SELECT day, kind, key, n FROM hits WHERE day >= date('now', ?) ORDER BY day DESC, n DESC`)
        .all(`-${days} days`);
    },

    // ---- Rate limit: fixed window counters ----

    rateLimit(key, max, windowSec) {
      const t = Math.floor(Date.now() / 1000);
      return db.transaction(() => {
        const row = db.prepare(`SELECT n, reset_at FROM ratelimit WHERE key = ?`).get(key);
        if (!row || row.reset_at <= t) {
          db.prepare(`INSERT INTO ratelimit (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset_at = excluded.reset_at`).run(key, t + windowSec);
          return true;
        }
        if (row.n >= max) return false;
        db.prepare(`UPDATE ratelimit SET n = n + 1 WHERE key = ?`).run(key);
        return true;
      })();
    },

    sweep() {
      db.prepare(`DELETE FROM ratelimit WHERE reset_at < ?`).run(Math.floor(Date.now() / 1000));
    },

    sitemapRows() {
      return {
        wants: db.prepare(`SELECT id, slug, updated_at FROM wants WHERE hidden = 0 ORDER BY id DESC LIMIT 40000`).all(),
        made: db.prepare(`SELECT slug, created_at FROM made WHERE hidden = 0 ORDER BY id DESC LIMIT 10000`).all(),
        topics: db.prepare(`SELECT DISTINCT t.topic FROM want_topics t JOIN wants w ON w.id = t.want_id WHERE w.hidden = 0`).all().map((r) => r.topic),
      };
    },
  };
  return api;
}
