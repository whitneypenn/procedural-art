"use strict";
// Shared by the press's pages: the paper they are printed on, the links between them, the ledger of
// recent work, downloading, and the keyboard. Needs specimen-engine.js.

const $ = id => document.getElementById(id);
const WORDS = ['nought', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
// inside a claude.ai artifact the page runs framed, with window.claude
const HOSTED = !!(window.claude && window.claude.use);

// the page itself is printed on the same paper as the plates
function paintDesk() {
  const c = $('desk'), dpr = Math.min(1.5, window.devicePixelRatio || 1);
  c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
  drawPaper(c.getContext('2d'), c.width, c.height, c.width / 1000, STYLE, new Rand(1776), { grain: true, foxing: false });
}
let deskTimer; addEventListener('resize', () => { clearTimeout(deskTimer); deskTimer = setTimeout(paintDesk, 150); });

// The pages link by relative address. As artifacts they are separate pages, so the links point at
// each one's own claude.ai address instead (and open in a new tab, as artifact links do).
function linkPages() {
  if (!HOSTED) return;
  for (const a of document.querySelectorAll('.contents a[data-artifact]')) { a.href = a.dataset.artifact; a.target = '_blank'; a.rel = 'noopener'; }
}

// A ledger of recent work, kept in this browser. describe(entry) → { no, title, note, label }.
function makeLedger({ key, list, empty, describe, onPick, same, max = 12 }) {
  let items = [];
  try { items = JSON.parse(localStorage.getItem(key) || '[]').filter(e => e && Number.isFinite(+e.seed)); } catch (e) { }
  const show = () => {
    list.innerHTML = ''; empty.hidden = items.length > 0;
    for (const e of items) {
      const d = describe(e), li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.innerHTML = '<span class="no"></span><span class="t"></span><span class="dots"></span>';
      b.querySelector('.no').textContent = d.no; b.querySelector('.t').textContent = d.title; b.querySelector('.dots').textContent = d.note;
      b.setAttribute('aria-label', d.label);
      b.addEventListener('click', () => onPick(e));
      li.appendChild(b); list.appendChild(li);
    }
  };
  return {
    note(entry) {
      items = [entry, ...items.filter(e => !same(e, entry))].slice(0, max);
      try { localStorage.setItem(key, JSON.stringify(items)); } catch (e) { }
      show();
    },
    show,
  };
}

// The plate on the page is transparent ink; a download gets a sheet of paper of its own.
function onPaper(src, paperSeed) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  drawPaper(x, c.width, c.height, c.width / 1000, STYLE, new Rand(hash(paperSeed)), { grain: true, foxing: false });
  x.globalCompositeOperation = 'multiply'; x.drawImage(src, 0, 0);
  return c;
}
const slugify = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Download: as an artifact the page offers the file through the viewer (the `downloads` capability
// shows a save confirmation); anywhere else, an ordinary browser download.
const downloadsReady = HOSTED ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
function wireDownload(button, status, makeCanvas, fileName) {
  if (HOSTED) downloadsReady.then(d => { if (!d) button.hidden = true; });
  const say = t => { status.hidden = !t; status.textContent = t || ''; };
  button.addEventListener('click', async () => {
    say('');
    const blob = await new Promise(res => makeCanvas().toBlob(res, 'image/png'));
    if (!blob) { say('The plate would not come off the press; try again.'); return; }
    if (HOSTED) {
      const downloads = await downloadsReady;
      if (!downloads) { say('Saving is not possible in this view.'); return; }
      try { await downloads.save({ filename: fileName(), data: blob }); say('Saved to your computer.'); }
      catch (e) {
        const code = e && e.code;
        if (code === 'declined') say('');
        else if (code === 'rate_limited') say('A save is already waiting for your answer.');
        else say('Saving is not possible in this view.');
      }
      return;
    }
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    say('Saved to your computer.');
  });
}

// Space-bar for a fresh one, arrow keys to turn the register.
function wireKeys(roll, bump) {
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); roll(); }
    else if (e.key === 'ArrowRight') bump(1);
    else if (e.key === 'ArrowLeft') bump(-1);
  });
}
// the register number: ‹ › and typing
function wireRegister(state, sync, draw) {
  const bump = d => { state.seed = Math.max(0, (+state.seed || 0) + d); sync(); draw(); };
  const roll = () => { state.seed = Math.floor(Math.random() * 9999) + 1; sync(); draw(); };
  $('prev').onclick = () => bump(-1);
  $('next').onclick = () => bump(1);
  $('roll').onclick = roll;
  $('seed').addEventListener('change', e => { const v = parseInt(e.target.value, 10); state.seed = Number.isFinite(v) ? Math.abs(v) : hash(e.target.value) % 9999; sync(); draw(); });
  $('seed').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  wireKeys(roll, bump);
}

const fontsReady = Promise.race([
  Promise.all(['italic 30px "IM Fell English"', '30px "IM Fell English SC"'].map(f => document.fonts.load(f).catch(() => null))),
  new Promise(r => setTimeout(r, 2500)),
]);
function openPress() {
  paintDesk(); linkPages();
  const y = $('year'); if (y) y.textContent = 'Anno ' + roman(new Date().getFullYear());
}
