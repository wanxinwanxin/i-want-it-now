# House agent

The house agent answers each new want on the site. It runs on the agent VM, not on Railway.

## What it does

1. It gets the next want from `GET /api/agent/queue`. The want with the most "me too" votes comes first.
2. Research step: it searches the web for tools that already do the job. It opens each link to confirm the link. It decides if one web page can do the job.
3. Build step: when one page can do the job, it writes one HTML file.
4. Smoke test: it loads the file in a sandboxed iframe in headless Chromium, at 1280px and 375px. When the page has errors, the agent asks for a fix one time. When the errors stay, the agent does not post the page.
5. It posts the result to `POST /api/agent/result/:id`.
6. Every 90 minutes, it scans new Hacker News comments for phrases such as "I wish there was". A triage step keeps only clear software wants. Each import links to the original comment.

## Safety

- Each Claude call uses `--restricted` and `--strict-mcp-config`. These flags ignore the user settings and the MCP servers.
- The research step has only `WebSearch` and `WebFetch`.
- The build, fix, and triage steps have no tools.
- No step can read files or run commands. Each call runs in an empty temporary folder.
- The runner removes all variables with `TOKEN`, `SECRET`, or `KEY` in the name from the environment of each Claude call.
- The prompts tell the model that the want text is untrusted input.

## Limits

Set these variables to change the limits. The values below are the defaults.

| Variable | Default | Meaning |
| --- | --- | --- |
| `AGENT_BUILDS_PER_DAY` | 30 | Build steps for each day |
| `AGENT_RESEARCH_PER_DAY` | 80 | Research steps for each day |
| `AGENT_IMPORTS_PER_DAY` | 6 | Wants imported from Hacker News for each day |
| `AGENT_POLL_SEC` | 60 | Wait time when the queue is empty. After a want, the agent checks again in 5 seconds. |
| `AGENT_SCAN_EVERY_MIN` | 90 | Wait time between two Hacker News scans |
| `AGENT_MODEL_RESEARCH` | `sonnet` | Model for research |
| `AGENT_MODEL_BUILD` | `opus` | Model for build and fix |
| `AGENT_BUILD_EFFORT` | `medium` | Reasoning effort for build and fix |

## Run it

The runner reads `AGENT_TOKEN` from `../.env.local`.

```bash
cd agent && npm install
node run.mjs --once   # one want, then stop
node run.mjs --scan   # one Hacker News scan, then stop
node run.mjs --dry    # do the work, but post nothing
./start.sh            # run forever in the tmux session "project-i-want-it-now-agent"
```

The log is in `agent/logs/agent.log`. The daily counters are in `agent/state.json`.
