// The builder screen. Plain HTML and a little script, with no build step.
const STYLE = `
:root { --accent: #e07a2f; --bg: #1f1a16; --text: #f5efe6; --muted: #bfae98; --card: #2c2520; --bad: #ff8a80; --good: #9ee493; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--text); padding: 16px; }
h1 { font-size: 1.3rem; margin: .2em 0 .6em; }
p.help { color: var(--muted); margin: .3em 0 .8em; line-height: 1.5; }
textarea { width: 100%; min-height: 60vh; font: 14px/1.4 ui-monospace, Menlo, Consolas, monospace; background: var(--card); color: var(--text); border: 1px solid #443a33; border-radius: 10px; padding: 12px; }
button { font: inherit; font-weight: 700; border: 0; border-radius: 12px; padding: 12px 16px; min-height: 48px; background: var(--accent); color: #241a12; margin-right: 8px; margin-top: 8px; }
button.secondary { background: #3a322c; color: var(--text); }
#result { margin-top: 12px; padding: 12px; border-radius: 10px; background: var(--card); line-height: 1.5; }
#result.bad { color: var(--bad); }
#result.good { color: var(--good); }
li { margin: .2em 0; }
`;

export function BUILDER_PAGE(starter: string): string {
  const safe = starter.replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game builder</title>
<style>${STYLE}</style></head>
<body>
<h1>Game builder</h1>
<p class="help">Edit the game as text. Press <strong>Check</strong> to see every problem, then <strong>Download</strong> to save the file. Entries are the things people vote on. Rounds are the steps of the game. Read <code>docs/game-format.md</code> for the rules.</p>
<textarea id="text" spellcheck="false"></textarea>
<div>
  <button id="check">Check</button>
  <button id="download" class="secondary">Download game.json</button>
</div>
<div id="result" role="status">Not checked yet.</div>
<script>
const starter = ${safe};
const area = document.getElementById('text');
area.value = starter;
const result = document.getElementById('result');
function show(ok, errors) {
  result.className = ok ? 'good' : 'bad';
  result.replaceChildren();
  if (ok) { result.textContent = 'Looks good. Download it when you are ready.'; return; }
  const head = document.createElement('div'); head.textContent = errors.length + ' problem(s) to fix:';
  const list = document.createElement('ul');
  for (const e of errors) { const li = document.createElement('li'); li.textContent = e; list.appendChild(li); }
  result.append(head, list);
}
async function check() {
  const res = await fetch('/api/validate', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: area.value });
  const body = await res.json();
  show(body.ok, body.errors);
  return body.ok;
}
document.getElementById('check').addEventListener('click', check);
document.getElementById('download').addEventListener('click', async () => {
  if (!(await check())) return;
  const blob = new Blob([area.value.trim() + '\\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'game.json';
  a.click();
});
</script>
</body></html>`;
}
