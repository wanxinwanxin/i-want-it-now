# I Want It Now: plan

## The idea after the survey

"I Want It Now" is a public board of wants. Each want gets an answer fast.

1. A person writes one sentence: "I want ...". The person can add details and an "it is done when ..." line.
2. Other people click "me too". This count is the demand signal.
3. The house agent answers each new want. The agent does two things:
   - It searches for free or open-source tools that already do the job, and it posts them as answers.
   - When a single web page can do the job, the agent builds that page. The site hosts the page in a sandbox at `/made/<slug>`.
4. Any person can also answer with a live demo link, a repository link, or a link to an existing tool.
5. The wisher marks the answer that fits exactly. Three "works for me" votes also mark the want as fulfilled.
6. The site groups similar wants into topics. The site also keeps a shelf of all free and open-source answers.
7. The want queue is an open JSON API, so other people can point their own agents at it.

## Why this version

- The house agent solves the cold start problem that the survey found.
- The search for existing tools gives a useful answer even when nobody builds.
- Each want page and each agent-built tool is a page that search engines can index.

## Architecture

- Node.js 22 with Express 5. The server renders HTML. The browser loads a small vanilla script.
- SQLite with `better-sqlite3`. FTS5 gives search and "related wants". The database file is on a Railway volume at `/data`.
- One Railway service. The agent runner is a separate process on the agent VM.
- Agent-built pages use the response header `Content-Security-Policy: sandbox allow-scripts ...`. The page gets an opaque origin, so it cannot read the cookies or call the API of the main site.

## Agent runner (VM)

`agent/run.mjs` runs in a loop:

1. It gets pending wants from `GET /api/agent/queue`.
2. Research step: `claude -p --restricted --tools WebSearch,WebFetch`. This step has no file tools, so the step has no access to secrets on the VM.
3. Build step: `claude -p --restricted --tools ""`. This step has no tools. The step returns one HTML file as text.
4. It sends the result to `POST /api/agent/result/:id`.
5. A scanner imports public wants from Hacker News through the Algolia API, with a link to the source.

The runner has limits for each hour and each day.

## Iterations

1. Core site: wants, me-too, answers, votes, fulfilled status, search, shelf, SEO files. Deploy to Railway.
2. Agent runner, HN scanner, first batch of agent answers.
3. Topics (clusters), builder pages, OG images, IndexNow.
4. Campaign: Show HN, Reddit, X drafts. The user approves each post before it goes out.

## SEO

- Each want has a canonical URL `/w/<id>/<slug>` with JSON-LD.
- `sitemap.xml`, `robots.txt`, `feed.xml` (RSS), and `llms.txt`.
- IndexNow pings for new pages.
