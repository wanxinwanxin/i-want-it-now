// Fixed list of topics. Each want gets one or two topics.
// A keyword classifier tags a want at once. The agent can replace the tags after its research.

export const TOPICS = [
  { slug: 'dev-tools', name: 'Developer tools', blurb: 'Code, CI, terminals, databases, and APIs.', words: 'code coding git github gitlab ci pipeline api apis ssh docker container microvm deploy debug debugger database sql postgres terminal cli linux compiler ide repo repository test tests testing devops kubernetes server log logs regex json-schema' },
  { slug: 'productivity', name: 'Productivity', blurb: 'Tasks, habits, timers, notes, and calendars.', words: 'todo task tasks habit habits timer pomodoro calendar notes note reminder reminders schedule focus meeting meetings planner routine journal' },
  { slug: 'money', name: 'Money', blurb: 'Budgets, bills, taxes, prices, and investing.', words: 'tax taxes budget bill bills invoice expense expenses finance financial stock stocks invest investing investment price prices bank loan mortgage split splits salary rent subscription subscriptions crypto' },
  { slug: 'media', name: 'Reading, video, and audio', blurb: 'Articles, books, podcasts, video, and music.', words: 'youtube podcast podcasts rss epub ebook book books article articles video videos music audio spotify reading reader playlist newsletter feed feeds comics manga movie movies' },
  { slug: 'data', name: 'Data and spreadsheets', blurb: 'CSV, spreadsheets, charts, diffs, and logging.', words: 'spreadsheet spreadsheets csv excel json chart charts table tables diff data dataset logging graph graphs visualize visualization forms form' },
  { slug: 'browser', name: 'Browser and privacy', blurb: 'Extensions, ad blocking, spam, and tracking.', words: 'browser extension extensions privacy ads ad adblock ublock tracker trackers tracking autoplay cookie cookies spam firefox chrome tab tabs bookmarks bookmark' },
  { slug: 'maps-travel', name: 'Maps and travel', blurb: 'Routes, trips, transit, and places.', words: 'map maps route routes travel cycling cyclist bike bicycle flight flights trip trips hotel transit train walking hiking places location' },
  { slug: 'home-food', name: 'Home and food', blurb: 'Recipes, groceries, chores, and the house.', words: 'recipe recipes cooking cook grocery groceries shopping meal meals kitchen garden home house plant plants chores family kids baby pet pets' },
  { slug: 'health', name: 'Health and fitness', blurb: 'Workouts, sleep, diet, and medical.', words: 'health fitness workout workouts exercise sleep diet calorie calories running run medication medical doctor symptoms weight gym' },
  { slug: 'learning', name: 'Learning', blurb: 'Study, languages, flashcards, and teaching.', words: 'learn learning study studying language languages flashcard flashcards course courses quiz school teach teaching student students tutor math' },
  { slug: 'work', name: 'Work and business', blurb: 'Customers, teams, hiring, sales, and support.', words: 'crm customer customers client clients team teams hiring hire sales support startup business freelance freelancer invoice invoices admin backoffice employees' },
  { slug: 'ai', name: 'AI tools', blurb: 'LLMs, agents, prompts, and models.', words: 'ai llm llms gpt chatgpt claude model models prompt prompts agent agents ml machine-learning generated' },
  { slug: 'communication', name: 'Email and messages', blurb: 'Email, chat, contacts, and social.', words: 'email emails mail inbox message messages chat sms alias aliases contact contacts social facebook reddit twitter whatsapp slack discord' },
  { slug: 'files', name: 'Files and photos', blurb: 'Files, backups, sync, photos, and PDFs.', words: 'file files backup backups sync photo photos folder folders pdf pdfs filesystem storage images image scan scanner archive archives warc' },
  { slug: 'fun', name: 'Games and fun', blurb: 'Games, puzzles, rankings, and toys.', words: 'game games play puzzle puzzles ranking rank fun swipe trivia toy quiz-game board-game' },
  { slug: 'other', name: 'Other', blurb: 'Wants that fit no other topic.', words: '' },
];

export const TOPIC_BY_SLUG = new Map(TOPICS.map((t) => [t.slug, t]));
const WORDS = TOPICS.map((t) => ({ slug: t.slug, set: new Set(t.words.split(' ').filter(Boolean)) }));

export function classify(text) {
  const tokens = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const scores = WORDS.map(({ slug, set }) => ({ slug, n: tokens.filter((t) => set.has(t)).length })).filter((s) => s.n > 0);
  scores.sort((a, b) => b.n - a.n);
  const top = scores.slice(0, 2).filter((s, i) => i === 0 || s.n >= scores[0].n / 2);
  return top.length ? top.map((s) => s.slug) : ['other'];
}

export function cleanTopics(list) {
  const out = [...new Set((Array.isArray(list) ? list : []).map(String).filter((s) => TOPIC_BY_SLUG.has(s)))].slice(0, 2);
  return out.length ? out : null;
}
