// The two screens, kept as plain strings so the server needs no build step.
// All text from the game is inserted with textContent, never innerHTML, so names cannot inject markup.

const STYLE = `
:root { --accent: #e07a2f; --bg: #2b1d14; --text: #fff6e8; --muted: #c9b59a; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--text); }
button { font: inherit; }
`;

export const TV_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TV</title>
<style>${STYLE}
body { min-height: 100vh; padding: 3vw; }
header { display: flex; justify-content: space-between; align-items: center; gap: 2vw; flex-wrap: wrap; }
h1 { font-size: clamp(2rem, 4vw, 4rem); margin: 0; }
#round { font-size: clamp(1.4rem, 2.6vw, 2.6rem); color: var(--accent); margin: .3em 0 0; }
#join { text-align: center; background: #fff6e8; color: #2b1d14; padding: 1vw; border-radius: 1vw; font-size: clamp(1rem, 1.6vw, 1.6rem); }
#join code { font-size: 1.3em; word-break: break-all; }
#list { list-style: none; padding: 0; margin: 2vh 0 0; display: grid; gap: 1vh; }
.row { display: grid; grid-template-columns: 4vw 1fr auto; align-items: center; gap: 1vw; background: rgba(255,255,255,.07); border-radius: 1vw; padding: 1vh 1.2vw; font-size: clamp(1.2rem, 2.2vw, 2.4rem); transition: transform .4s ease; }
.row.leader { background: var(--accent); color: #2b1d14; }
.pts { font-weight: 700; }
.sub { color: var(--muted); font-size: .6em; display: block; }
footer { margin-top: 2vh; color: var(--muted); font-size: clamp(1rem, 1.6vw, 1.5rem); }
@media (prefers-reduced-motion: reduce) { .row { transition: none; } }
</style></head>
<body>
<header>
  <div><h1 id="title">Loading…</h1><p id="round"></p></div>
  <div id="join"><div>Scan to play</div><code id="joinUrl"></code></div>
</header>
<ol id="list"></ol>
<footer id="count"></footer>
<script>
const list = document.getElementById('list');
const scoreById = new Map();
async function load() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  const s = await res.json();
  document.getElementById('title').textContent = s.title;
  document.getElementById('round').textContent = s.round.title;
  document.getElementById('joinUrl').textContent = location.origin + '/join';
  document.getElementById('count').textContent = s.ballotCount + ' vote(s) so far';
  scoreById.clear();
  for (const sc of s.scores) scoreById.set(sc.entryId, sc);
  // Every entry shows from the start, even at zero points, ordered by score.
  const ordered = [...s.entries].sort((a, b) => (scoreById.get(a.id)?.rank ?? 99) - (scoreById.get(b.id)?.rank ?? 99));
  list.replaceChildren(...ordered.map((e) => {
    const sc = scoreById.get(e.id) || { points: 0, rank: '-' };
    const li = document.createElement('li');
    li.className = 'row' + (sc.rank === 1 && sc.points > 0 ? ' leader' : '');
    const rank = document.createElement('span'); rank.textContent = sc.rank;
    const name = document.createElement('span'); name.textContent = e.name;
    if (e.subtitle) { const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = e.subtitle; name.appendChild(sub); }
    const pts = document.createElement('span'); pts.className = 'pts'; pts.textContent = sc.points + ' pts';
    li.append(rank, name, pts);
    return li;
  }));
}
load();
const events = new EventSource('/events');
events.addEventListener('update', load);
</script>
</body></html>`;

export const PHONE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vote</title>
<style>${STYLE}
body { padding: 16px; padding-bottom: 96px; max-width: 560px; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: .2em 0; }
#hint { color: var(--muted); margin: 0 0 12px; }
.item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; background: rgba(255,255,255,.08); color: var(--text); border: 0; border-radius: 14px; padding: 14px; margin-bottom: 10px; min-height: 56px; font-size: 1.05rem; }
.item.picked { background: var(--accent); color: #2b1d14; }
.badge { min-width: 32px; height: 32px; border-radius: 50%; border: 2px solid currentColor; display: grid; place-items: center; font-weight: 700; flex: none; }
.sub { display: block; color: var(--muted); font-size: .85rem; }
.item.picked .sub { color: #2b1d14; }
#submit { position: fixed; left: 16px; right: 16px; bottom: 16px; max-width: 528px; margin: 0 auto; background: var(--accent); color: #2b1d14; border: 0; border-radius: 14px; padding: 16px; font-size: 1.1rem; font-weight: 700; min-height: 56px; }
#submit:disabled { opacity: .4; }
#msg { color: var(--text); margin: 8px 0; min-height: 1.2em; }
.done { text-align: center; padding-top: 30px; font-size: 1.2rem; }
</style></head>
<body>
<h1 id="round">Loading…</h1>
<p id="hint"></p>
<div id="items"></div>
<p id="msg" role="status"></p>
<button id="submit" disabled>Submit my ranking</button>
<script>
let state = null;
let picks = [];

function render() {
  const items = document.getElementById('items');
  const submit = document.getElementById('submit');
  if (!state) return;
  document.getElementById('round').textContent = state.round.title;
  if (state.youHaveVoted) {
    items.replaceChildren(Object.assign(document.createElement('p'), { className: 'done', textContent: 'Thanks! Your vote is in.' }));
    document.getElementById('hint').textContent = '';
    submit.hidden = true;
    return;
  }
  submit.hidden = false;
  const max = state.round.config.maxPicks;
  document.getElementById('hint').textContent = 'Tap in order: your 1st choice first. Pick up to ' + max + '. Tap again to remove.';
  items.replaceChildren(...state.entries.map((e) => {
    const idx = picks.indexOf(e.id);
    const btn = document.createElement('button');
    btn.className = 'item' + (idx >= 0 ? ' picked' : '');
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = idx >= 0 ? String(idx + 1) : '';
    const text = document.createElement('span'); text.textContent = e.name;
    if (e.subtitle) { const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = e.subtitle; text.appendChild(sub); }
    btn.append(badge, text);
    btn.addEventListener('click', () => toggle(e.id));
    return btn;
  }));
  submit.disabled = picks.length === 0;
}

function toggle(id) {
  const max = state.round.config.maxPicks;
  const idx = picks.indexOf(id);
  if (idx >= 0) picks.splice(idx, 1);
  else if (picks.length < max) picks.push(id);
  else document.getElementById('msg').textContent = 'You can only pick ' + max + '.';
  if (picks.length < max) document.getElementById('msg').textContent = '';
  render();
}

async function load() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  state = await res.json();
  render();
}

document.getElementById('submit').addEventListener('click', async () => {
  const msg = document.getElementById('msg');
  const submit = document.getElementById('submit');
  submit.disabled = true;
  const res = await fetch('/api/ballot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roundId: state.round.id, picks }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) { await load(); return; }
  msg.textContent = body.error || 'Something went wrong. Please try again.';
  submit.disabled = picks.length === 0;
  if (res.status === 409) await load();
});

load();
</script>
</body></html>`;
