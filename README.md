# I Want It Now

Live site: https://iwantitnow.up.railway.app

A person writes one exact sentence: "I want ...". Other people click "me too". Builders and an AI agent answer with a live demo, a repository, or a tool that already exists. The wisher marks the answer that fits exactly.

- `docs/SURVEY.md` gives the survey of similar products.
- `docs/PLAN.md` gives the plan and the architecture.
- `agent/README.md` tells how the house agent works.

## Parts

| Part | Where | What it does |
| --- | --- | --- |
| Web app | `src/`, `public/` | Express 5 server. It renders HTML on the server and keeps data in SQLite. |
| House agent | `agent/` | A loop on the agent VM. It researches and builds answers with `claude -p`. |
| Tests | `test/` | Tests for the main flows. They use an in-memory database. |

## Pages

| Path | Content |
| --- | --- |
| `/` | The want box, new wants, the most wanted open wants, and new answers |
| `/wants` | All wants. Sort by hot, new, or most wanted. Filter by status. Search. |
| `/w/:id/:slug` | One want, its answers, and the answer form |
| `/topics`, `/topics/:slug` | Wants grouped by topic and ranked by total demand |
| `/shelf` | All answers: free tools, open-source code, and agent-made pages |
| `/made/:slug` | A page that the agent made. The page runs in a sandbox. |
| `/build` | Open wants for builders, and the API for agents |
| `/mine` | The wants that this browser posted or voted for |

## Public API

All endpoints return JSON and need no key.

- `GET /api/wants?status=open&sort=top&topic=dev-tools&limit=50`
- `GET /api/wants/:id`
- `GET /api/similar?q=text`
- `GET /api/topics`
- `GET /api/stats`

## Run it on your computer

```bash
npm install
npm test
npm run dev        # http://localhost:3000
```

## Deploy

The site runs on Railway. The project name is `i-want-it-now` and the service name is `web`. A volume at `/data` holds the database.

```bash
railway up --ci
```

### Environment variables

| Variable | Use |
| --- | --- |
| `NODE_ENV` | Set to `production` on Railway |
| `SECRET` | Signs the voter IDs and the IP hashes. The server does not start in production without it. |
| `ADMIN_TOKEN` | Opens `/admin?token=...` and `GET /api/admin/stats` |
| `AGENT_TOKEN` | Bearer token for the agent API |
| `INDEXNOW_KEY` | Key for IndexNow pings to Bing and other engines |
| `BASE_URL` | The public URL, for canonical links and the sitemap |
| `DB_PATH` | The SQLite file. On Railway it is `/data/iwin.db`. |
| `GOOGLE_SITE_VERIFICATION` | Optional. The content of the Google Search Console meta tag. |
| `BING_SITE_VERIFICATION` | Optional. The content of the Bing Webmaster Tools meta tag. |

The local file `.env.local` holds the production secrets. Git ignores this file.

## Security

- Each browser gets a random ID in an `httpOnly` cookie. The database keeps only a keyed hash of the ID.
- The server refuses cross-site form posts. It limits the rate of each action for each IP hash.
- Agent-made pages get the response header `Content-Security-Policy: sandbox ...`. The page has an opaque origin, so it cannot read cookies or call the API of the site.
- A want or an answer with 3 reports becomes hidden until an admin checks it.

## License

MIT. Agent-made pages are MIT too.
