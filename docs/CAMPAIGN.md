# Campaign plan and drafts

## Rules

- A person posts each item from their own account. The agent does not post to external sites.
- Add `?ref=<channel>` to each link, for example `?ref=hn`. The admin page counts these values, so that we can see which channel works.
- Post on one channel at a time. Wait one day, then read the numbers on `/admin`.

## When to launch

Launch when the site shows proof. The targets are:

1. At least 25 wants with answers.
2. At least 8 pages that the agent made, and each page works on a phone.
3. At least 3 wants with the status "Fulfilled".

The agent makes the first two numbers. The third number needs real wishers, so the first launch post asks people to post a want and to check the answer.

## Positioning

- One line: "Say exactly what you want. An AI agent and builders answer, usually within the hour."
- For builders: "A live list of things people want built, ranked by demand, with an open API."
- Proof to show: a want, the agent answer 20 minutes later, and the page that works.

## Draft 1: Show HN

Title (max 80 characters):

> Show HN: I Want It Now – post an exact want, an AI agent builds or finds it

Text:

> Building small tools got cheap. Knowing what to build did not. Meanwhile, every "What do you wish existed?" thread on HN has hundreds of exact wants that nobody follows up on.
>
> I Want It Now is a board for those wants. You finish the sentence "I want …", optionally with "it is done when …". Other people click "me too".
>
> Every new want goes to a house agent (Claude, running headless). It first searches for free tools that already do the job and posts the ones it could verify, with the catch for each (account needed, self-host only, paid tier). If one web page can do the job, it builds that page, smoke-tests it in a sandboxed iframe at desktop and phone width, and hosts it under /made. If not, it marks the want "needs a human builder".
>
> Anyone can answer too: a live demo, a repo, or an existing tool. The wisher marks the answer that fits exactly.
>
> Some seed wants come from old HN "what do you wish existed" threads, with a link back to each comment. The demand is open: /api/wants is JSON with no key, so you can point your own agent at it.
>
> Stack: Express + SQLite on Railway, server-rendered, no accounts. Agent pages run with a CSP sandbox, so they cannot touch the site.
>
> I would love wants that are exact and small. What do you want right now?
>
> https://iwantitnow.up.railway.app/?ref=hn

## Draft 2: Reddit r/SideProject

Title:

> I built a site where you say exactly what you want, and an AI agent builds it (or finds it) within the hour

Text:

> Post one sentence: "I want …". The house agent searches for free tools that already do it, and if one web page can do the job, it builds and hosts that page. Builders can answer too. You mark the answer that fits.
>
> A few things it made today: [link 1], [link 2], [link 3].
>
> No account, free, open source. Tell me what to build next: https://iwantitnow.up.railway.app/?ref=reddit-sideproject

## Draft 3: Reddit r/SomebodyMakeThis

Read the rules of the subreddit first. If self-promotion is not allowed, do not post. Use a comment in a relevant thread instead.

> For anyone here who posts ideas: I made a board where each idea goes to an AI agent that tries to build it within the hour (or finds an existing free tool). If the agent cannot build it, it marks the idea for human builders. Free, no account: https://iwantitnow.up.railway.app/?ref=reddit-smt

## Draft 4: X thread

> 1/ Building is cheap now. Knowing what to build is the hard part. So I made a board of exact wants: https://iwantitnow.up.railway.app/?ref=x
>
> 2/ You write "I want …". An AI agent reads it, searches for free tools that already do it, and builds a one-page tool when that is enough.
>
> 3/ Example: "I want a page that turns any recipe link into a plain shopping list". The agent built [link] in 7 minutes. It works on a phone.
>
> 4/ Builders: the demand is open JSON. Sort by "me too", pick one, post your link.

## Draft 5: Reply to a recent HN wish

Use this only for comments that are less than 14 days old, while HN accepts replies. Use it only when an answer fits well. Write each reply by hand from the template.

> You said you wished for [want]. I put it on a want board, and an agent found / built this: [link to the want page]. Does it fit? If not, the page says what is missing, and builders can pick it up.

## SEO

- Each want page has a title that starts "I want …". These pages match long-tail searches such as "tool to diff two spreadsheets".
- Each agent-made page has the title "<Tool>: free online tool" and `WebApplication` structured data.
- Each topic page targets "<topic> people want built".
- The sitemap is at `/sitemap.xml`. IndexNow pings Bing and Yandex for each new page.
- To do (needs the site owner): add the site to Google Search Console. Set `GOOGLE_SITE_VERIFICATION` on Railway to the content of the meta tag, then submit the sitemap.
