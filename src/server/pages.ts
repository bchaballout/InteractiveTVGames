// The three screens, kept as plain strings so the server needs no build step.
// All text from the game is inserted with textContent, never innerHTML, so names cannot inject markup.

const STYLE = `
:root { --accent: #e07a2f; --bg: #2b1d14; --text: #fff6e8; --muted: #c9b59a; --good: #6fbf73; }
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
#join code { font-size: .8em; word-break: break-all; }
#qr { display: block; margin: .5vw auto; background: #fff; border-radius: .5vw; width: min(22vw, 320px); height: auto; }
#list { list-style: none; padding: 0; margin: 2vh 0 0; display: grid; gap: 1vh; }
.row { display: grid; grid-template-columns: 4vw 1fr auto; align-items: center; gap: 1vw; background: rgba(255,255,255,.07); border-radius: 1vw; padding: 1vh 1.2vw; font-size: clamp(1.2rem, 2.2vw, 2.4rem); transition: transform .4s ease; }
.row.leader { background: var(--accent); color: #2b1d14; }
.pts { font-weight: 700; }
.sub { color: var(--muted); font-size: .6em; display: block; }
footer { margin-top: 2vh; color: var(--muted); font-size: clamp(1rem, 1.6vw, 1.5rem); }
#question { font-size: clamp(1.8rem, 3.4vw, 3.2rem); margin: 2vh 0 2vh; line-height: 1.2; }
#timer { font-size: clamp(2rem, 4vw, 3.6rem); font-weight: 800; color: var(--accent); }
#choices { list-style: none; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5vh 2vw; }
.choice { position: relative; overflow: hidden; background: rgba(255,255,255,.08); border-radius: 1vw; padding: 1.4vh 2vw; font-size: clamp(1.2rem, 2.1vw, 2.2rem); }
.choice .bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(224,122,47,.35); width: 0; transition: width .4s ease; }
.choice span.label, .choice span.count { position: relative; }
.choice span.count { float: right; font-weight: 700; }
.choice.correct { background: var(--good); color: #10200f; }
#board { margin-top: 3vh; font-size: clamp(1.2rem, 2vw, 2rem); }
#board ol { margin: .5em 0 0; padding-left: 1.5em; }
@media (prefers-reduced-motion: reduce) { .row, .choice .bar { transition: none; } }
</style></head>
<body>
<header>
  <div><h1 id="title">Loading…</h1><p id="round"></p></div>
  <div id="join"><div>Scan to play</div><img id="qr" src="/qr.svg" alt="QR code to join" width="220" height="220"><div><code id="joinUrl"></code></div></div>
</header>
<div id="ranked">
  <ol id="list"></ol>
  <footer id="count"></footer>
</div>
<div id="trivia" hidden>
  <p id="timer"></p>
  <p id="question"></p>
  <ul id="choices"></ul>
  <div id="board" hidden><strong>Leaderboard</strong><ol id="boardList"></ol></div>
  <footer id="tcount"></footer>
</div>
<script>
const list = document.getElementById('list');
let trivia = false;
async function load() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  const s = await res.json();
  trivia = s.kind === 'trivia';
  document.getElementById('title').textContent = s.title;
  document.getElementById('round').textContent = 'Step ' + s.stepNumber + ' of ' + s.stepCount + ': ' + s.roundTitle;
  document.getElementById('joinUrl').textContent = s.joinUrl;
  document.getElementById('ranked').hidden = trivia;
  document.getElementById('trivia').hidden = !trivia;
  if (trivia) renderTrivia(s); else renderRanked(s);
}

function renderRanked(s) {
  document.getElementById('count').textContent = s.ballotCount + ' vote(s) so far';
  const scoreById = new Map(s.scores.map((sc) => [sc.entryId, sc]));
  // Every entry shows from the start, even at zero points, ordered by score.
  const ordered = [...s.entries].sort((a, b) => (scoreById.get(a.id)?.rank ?? 99) - (scoreById.get(b.id)?.rank ?? 99));
  list.replaceChildren(...ordered.map((e) => {
    const sc = scoreById.get(e.id) || { points: 0, rank: 0 };
    const li = document.createElement('li');
    li.className = 'row' + (sc.rank === 1 && sc.points > 0 ? ' leader' : '');
    const rank = document.createElement('span'); rank.textContent = sc.points > 0 ? String(sc.rank) : '–';
    const name = document.createElement('span'); name.textContent = e.name;
    if (e.subtitle) { const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = e.subtitle; name.appendChild(sub); }
    const pts = document.createElement('span'); pts.className = 'pts'; pts.textContent = sc.points + ' pts';
    li.append(rank, name, pts);
    return li;
  }));
}

function renderTrivia(s) {
  document.getElementById('question').textContent = s.question.prompt;
  const timer = document.getElementById('timer');
  timer.textContent = s.revealed ? 'Answer revealed' : (s.votingOpen ? (s.secondsLeft + ' seconds') : 'Voting closed');
  const total = s.counts.reduce((a, b) => a + b, 0);
  const choices = s.question.choices.map((text, i) => {
    const li = document.createElement('li');
    li.className = 'choice' + (s.revealed && s.question.correctIndex === i ? ' correct' : '');
    const bar = document.createElement('div'); bar.className = 'bar';
    bar.style.width = total === 0 ? '0%' : Math.round((s.counts[i] / total) * 100) + '%';
    const label = document.createElement('span'); label.className = 'label'; label.textContent = text;
    const count = document.createElement('span'); count.className = 'count'; count.textContent = String(s.counts[i]);
    li.append(bar, label, count);
    return li;
  });
  document.getElementById('choices').replaceChildren(...choices);
  document.getElementById('tcount').textContent = s.ballotCount + ' answer(s) in · ' + s.question.points + ' points';
  const board = document.getElementById('board');
  board.hidden = !s.revealed || s.leaderboard.length === 0;
  document.getElementById('boardList').replaceChildren(...s.leaderboard.map((row) => {
    const li = document.createElement('li');
    li.textContent = row.name + ' · ' + row.points + ' pts';
    return li;
  }));
}

load();
const events = new EventSource('/events');
events.addEventListener('update', load);
// Keep the countdown moving while a trivia question is open.
setInterval(() => { if (trivia) load(); }, 1000);
</script>
</body></html>`;

export const PHONE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Play</title>
<style>${STYLE}
body { padding: 16px; padding-bottom: 96px; max-width: 560px; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: .2em 0; }
#hint { color: var(--muted); margin: 0 0 12px; }
.item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; background: rgba(255,255,255,.08); color: var(--text); border: 0; border-radius: 14px; padding: 14px; margin-bottom: 10px; min-height: 56px; font-size: 1.05rem; }
.item.picked, .item.correct { background: var(--accent); color: #2b1d14; }
.item.correct { background: var(--good); }
.badge { min-width: 32px; height: 32px; border-radius: 50%; border: 2px solid currentColor; display: grid; place-items: center; font-weight: 700; flex: none; }
.sub { display: block; color: var(--muted); font-size: .85rem; }
.item.picked .sub { color: #2b1d14; }
#submit { position: fixed; left: 16px; right: 16px; bottom: 16px; max-width: 528px; margin: 0 auto; background: var(--accent); color: #2b1d14; border: 0; border-radius: 14px; padding: 16px; font-size: 1.1rem; font-weight: 700; min-height: 56px; }
#submit:disabled { opacity: .4; }
#msg { color: var(--text); margin: 8px 0; min-height: 1.2em; }
.done { text-align: center; padding-top: 30px; font-size: 1.2rem; }
#name { width: 100%; font: inherit; padding: 12px; border-radius: 12px; border: 0; margin-bottom: 14px; }
</style></head>
<body>
<label for="name" style="color:var(--muted);font-size:.9rem">Your name for the scoreboard (optional)</label>
<input id="name" maxlength="20" placeholder="e.g. Aunt Rosa">
<h1 id="round">Loading…</h1>
<p id="hint"></p>
<div id="items"></div>
<p id="msg" role="status"></p>
<button id="submit" disabled>Submit my ranking</button>
<script>
let state = null;
let picks = [];

function closedMessage(text) {
  const items = document.getElementById('items');
  items.replaceChildren(Object.assign(document.createElement('p'), { className: 'done', textContent: text }));
  document.getElementById('hint').textContent = '';
  document.getElementById('submit').hidden = true;
}

function render() {
  if (!state) return;
  const items = document.getElementById('items');
  const submit = document.getElementById('submit');
  document.getElementById('round').textContent = state.roundTitle;
  if (document.activeElement !== document.getElementById('name')) {
    document.getElementById('name').value = state.yourName || '';
  }
  if (state.kind === 'trivia') return renderTrivia();
  if (!state.votingOpen && !state.youHaveVoted) return closedMessage('Voting is closed for this round. Watch the TV!');
  if (state.youHaveVoted) return closedMessage('Thanks! Your vote is in.');
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

function renderTrivia() {
  const submit = document.getElementById('submit');
  submit.hidden = true;
  document.getElementById('hint').textContent = state.question.prompt;
  if (state.revealed) {
    const mine = state.yourChoice;
    const msg = mine === undefined ? 'You did not answer this one.' : (mine === state.question.correctIndex ? 'Correct!' : 'Not this time.');
    document.getElementById('msg').textContent = msg;
  } else if (state.youHaveVoted) {
    document.getElementById('msg').textContent = 'Answer locked in. Waiting for the reveal…';
  } else if (!state.votingOpen) {
    document.getElementById('msg').textContent = 'Time is up.';
  } else {
    document.getElementById('msg').textContent = '';
  }
  const open = state.votingOpen && !state.youHaveVoted && !state.revealed;
  document.getElementById('items').replaceChildren(...state.question.choices.map((text, i) => {
    const btn = document.createElement('button');
    const cls = ['item'];
    if (state.revealed && state.question.correctIndex === i) cls.push('correct');
    if (state.yourChoice === i) cls.push('picked');
    btn.className = cls.join(' ');
    btn.disabled = !open;
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = String.fromCharCode(65 + i);
    const label = document.createElement('span'); label.textContent = text;
    btn.append(badge, label);
    btn.addEventListener('click', () => answer(i));
    return btn;
  }));
}

async function answer(choice) {
  const msg = document.getElementById('msg');
  const res = await fetch('/api/ballot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stepId: state.stepId, choice }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) msg.textContent = body.error || 'Something went wrong. Please try again.';
  await load();
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
    body: JSON.stringify({ stepId: state.stepId, picks }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) { await load(); return; }
  msg.textContent = body.error || 'Something went wrong. Please try again.';
  submit.disabled = picks.length === 0;
  if (res.status === 409) await load();
});

document.getElementById('name').addEventListener('change', async (e) => {
  await fetch('/api/nickname', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: e.target.value }) });
  await load();
});

load();
const events = new EventSource('/events');
events.addEventListener('update', load);
</script>
</body></html>`;

export const HOST_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Host</title>
<style>${STYLE}
body { padding: 16px; max-width: 560px; margin: 0 auto; }
h1 { font-size: 1.3rem; }
#status { background: rgba(255,255,255,.08); border-radius: 14px; padding: 14px; margin: 12px 0; line-height: 1.5; }
button { display: block; width: 100%; min-height: 56px; border: 0; border-radius: 14px; padding: 14px; margin: 10px 0; font-size: 1.05rem; font-weight: 700; background: var(--accent); color: #2b1d14; }
button.secondary { background: rgba(255,255,255,.12); color: var(--text); }
button:disabled { opacity: .4; }
#msg { min-height: 1.2em; color: var(--muted); }
</style></head>
<body>
<h1>Host controls</h1>
<div id="status">Loading…</div>
<button id="reveal" hidden>Reveal answer</button>
<button id="toggle">Close voting</button>
<button id="next">Next</button>
<button id="prev" class="secondary">Previous</button>
<p id="msg" role="status"></p>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
const headers = { 'content-type': 'application/json', 'x-host-token': token };
let st = null;
function show() {
  const what = st.kind === 'trivia' ? st.question.prompt : st.roundTitle;
  document.getElementById('status').textContent =
    st.title + ' · ' + st.stepNumber + ' of ' + st.stepCount + ': ' + what +
    ' · ' + (st.votingOpen ? 'Voting is OPEN' : 'Voting is CLOSED') + ' · ' + st.ballotCount + ' answer(s)';
  document.getElementById('reveal').hidden = st.kind !== 'trivia' || st.revealed;
  document.getElementById('toggle').textContent = st.votingOpen ? 'Close voting' : 'Open voting';
  document.getElementById('prev').disabled = st.stepNumber <= 1;
  document.getElementById('next').disabled = st.stepNumber >= st.stepCount;
}
async function call(path, body) {
  const res = await fetch(path, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { document.getElementById('msg').textContent = data.error || 'Something went wrong.'; return; }
  st = data; document.getElementById('msg').textContent = ''; show();
}
document.getElementById('reveal').addEventListener('click', () => call('/api/host/reveal'));
document.getElementById('toggle').addEventListener('click', () => call('/api/host/voting', { open: !st.votingOpen }));
document.getElementById('next').addEventListener('click', () => call('/api/host/next'));
document.getElementById('prev').addEventListener('click', () => call('/api/host/previous'));
async function load() {
  const res = await fetch('/api/host/state', { headers });
  if (!res.ok) { document.getElementById('status').textContent = "Open the link from the host computer's terminal."; return; }
  st = await res.json(); show();
}
load();
</script>
</body></html>`;
