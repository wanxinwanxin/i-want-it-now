# Survey of similar products (2026-11-03)

## Question

Does a product exist that does exactly this?

1. A person writes "I want exactly this thing".
2. Anyone answers with a working build: a hosted demo, a GitHub link, or an existing tool.
3. An agent scans the requests continuously and builds answers.
4. The site clusters demand and keeps a directory of free and open-source answers.

## Result

No product does all four. One new product does steps 1 and 2. No product does steps 3 and 4 for public requests.

## Closest match: Wishcode

- URL: https://wishcode-ai.vercel.app/
- A visitor writes one sentence: "An app that ...". Other visitors give a "me too".
- A developer connects GitHub, claims the wish, and posts a live link.
- The wish becomes "Fulfilled" when the wisher or three me-too voters confirm the link.
- The first wish has the date Oct 22, 2026. On Nov 3, 2026, the site had 5 wishes and 1 fulfilled wish. The operator fulfilled that wish with a link to the site itself.
- Wishcode has no agent that builds, no search for existing tools, no repository links, and no directory.

Wishcode shows that the basic loop is easy to copy. Its problem is cold start: the site has few builders, so wishes stay open, so few people post.

## Other products in the space

| Product | What it does | What it does not do |
| --- | --- | --- |
| [IdeaLabs](https://idealabs.app/) | 1,037 software ideas with a monthly price that people say they will pay. Many ideas come from Reddit, HN, and X. Paid AI reports for builders. | It has no flow to submit a solution. Its FAQ says that this feature is "in progress". The newest visible ideas have the date Jan 1. |
| [I Wish There Was...](https://iwishtherewas.xyz/) | A wish board with upvotes and a price tier. | It has no builder flow and no fulfilled status. The newest post has the date 6/18/2026. |
| [r/SomebodyMakeThis](https://www.reddit.com/r/SomebodyMakeThis/) | Approximately 100k members post ideas. A monthly thread shows things that members made. | It has no structured status, no demand count, and no directory. |
| [Replit Bounties](https://news.ycombinator.com/item?id=44643875) | Paid requests that Replit developers built. | Replit closed it on September 6, 2025. |
| [Bounty](https://trybounty.ai/), [TaskBounty](https://www.task-bounty.com/for-startups) | Paid tasks. AI agents bid or compete to deliver. | These are private paid jobs. They do not show public demand. |
| Feature boards (Canny, Upvoty, Fider) | Votes on features of one product. | Each board is for one product only. |
| App builders (Replit, Lovable, KAppMaker) | One person describes an app and gets it. | The result is private to one person. Nobody else sees the demand. |

## Lessons for the design

1. **Cold start is the main risk.** Wish boards without builders become graveyards. Our agent must answer every want quickly, so that no want stays without a response.
2. **Many wants already have an answer.** A search for existing free tools is cheap and useful. It also fills the directory.
3. **"Exactly" needs a test.** A vote says that a person wants an outcome. It does not say what "done" means. Each want gets an optional "it is done when ..." line, and the wisher confirms the fit.
4. **Paid bounties are a separate market.** Paid marketplaces exist. Our site stays free and open, and it shows the demand to everyone.
5. **Imported demand needs attribution.** IdeaLabs imports ideas from other sites. When our agent imports a want, it links to the source and names the source.
