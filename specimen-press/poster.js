"use strict";
// Posters: several specimens printed on one sheet under a title, laid out in loose rows the way
// atlas plates are. Needs specimen-engine.js.

// Colour families a plate can be coloured in. Every palette belongs to at least one; `family` may
// also be 'pal:<key>' to colour a whole plate in a single mineral's palette.
const FAMILIES = {
  blue: { name: 'Blue', pals: ['indigo', 'azurite', 'turquoise', 'azmal'] },
  green: { name: 'Green', pals: ['malachite', 'serpentine', 'turquoise', 'azmal', 'watermelon'] },
  violet: { name: 'Violet', pals: ['amethyst', 'fluorite', 'indigo', 'rose'] },
  rose: { name: 'Rose', pals: ['rose', 'watermelon', 'garnet', 'amethyst'] },
  red: { name: 'Red', pals: ['garnet', 'haematite', 'carnelian', 'rose'] },
  gold: { name: 'Gold & yellow', pals: ['citrine', 'sulphur', 'carnelian', 'smoky'] },
  earth: { name: 'Earth', pals: ['haematite', 'smoky', 'carnelian', 'jet', 'serpentine'] },
  quartz: { name: 'Quartz', pals: ['crystal', 'smoky', 'amethyst', 'citrine', 'rose'] },
  mono: { name: 'Black & white', pals: ['jet', 'crystal', 'smoky'] },
  all: { name: 'Every colour', pals: Object.keys(PALETTES) },
};
const THEMES = {
  kingdom: { name: 'The Mineral Kingdom', titles: ['The Mineral Kingdom', 'Minerals & Crystals', 'Mineralogy'], kinds: { crystal: 3, cluster: 3, agate: 1.5, rock: 2, matrix: 2, slab: 1, gem: 1 }, family: true },
  quartz: { name: 'Quartz & its Varieties', titles: ['Quartz & its Varieties', 'The Quartz Family', 'Rock Crystal & its Kin'], kinds: { crystal: 4, cluster: 3, gem: 1.2, agate: 1, rock: .6 }, pals: ['crystal', 'smoky', 'amethyst', 'citrine', 'rose'] },
  agates: { name: 'Agates, Jaspers & Onyx', titles: ['Agates, Jaspers & Onyx', 'Agates & Chalcedonies', 'Banded Stones'], kinds: { agate: 5, slab: 2.5, rock: 1.5 }, pals: ['carnelian', 'haematite', 'smoky', 'jet', 'rose', 'turquoise', 'serpentine', 'citrine', 'indigo', 'garnet', 'fluorite'] },
  gems: { name: 'Precious Stones', titles: ['Precious Stones', 'Gems & their Crystals', "The Lapidary's Cabinet"], kinds: { gem: 6, crystal: 2.5, matrix: 1 }, pals: ['garnet', 'amethyst', 'azurite', 'malachite', 'citrine', 'rose', 'watermelon', 'fluorite', 'crystal', 'turquoise', 'carnelian'] },
  ores: { name: 'Ores of the Metals', titles: ['Ores of the Metals', 'Metallic Minerals', 'Ores & Veinstones'], kinds: { rock: 3, matrix: 3, crystal: 2, cluster: 1.5 }, pals: ['haematite', 'jet', 'sulphur', 'azmal', 'malachite', 'azurite', 'smoky', 'carnelian'] },
  cabinet: { name: 'A Cabinet of Minerals', titles: ['A Cabinet of Minerals', 'Specimens from the Cabinet', 'Mineralogical Specimens'], kinds: KIND_BAG, pals: Object.keys(PALETTES) },
};
// height ÷ width
const ASPECTS = { '3:4': 4 / 3, '2:3': 1.5, 'A': Math.SQRT2, '4:5': 1.25 };

// Decide what goes on the poster. P: { seed, theme, family, count, title }
function colouringOf(key) {
  if (!key || key === 'any') return null;
  if (key.startsWith('pal:')) { const p = key.slice(4); return PALETTES[p] ? { name: PALETTES[p].name, pals: [p] } : null; }
  return FAMILIES[key] || null;
}
function planPoster(P) {
  const r = new Rand(hash('poster|' + P.seed));
  const themeRoll = r.pick(Object.keys(THEMES)), famRoll = r.pick(Object.keys(FAMILIES).filter(k => k !== 'all'));
  const themeKey = P.theme && P.theme !== 'any' ? P.theme : themeRoll, T = THEMES[themeKey];
  const plate = r.int(3, 60);
  const colouring = colouringOf(P.family) || (T.family ? FAMILIES[famRoll] : null);
  const pals = colouring ? colouring.pals : T.pals;
  // each figure draws from its own stream, so adding figures leaves the existing ones as they were
  const n = P.count || 10, items = [];
  for (let i = 0; i < n; i++) {
    const ri = new Rand(hash(`poster|${P.seed}|${themeKey}|fig${i}`));
    items.push({ seed: `${P.seed}-${i}`, kind: ri.weighted(T.kinds), pal: ri.pick(pals), rank: ri.next(), place: ri.next() });
  }
  // size hierarchy: one or two heroes, a band of medium specimens, the rest small; cut stones stay small
  const heroes = n >= 8 ? 2 : 1, mediums = Math.round(n * .4);
  [...items].sort((a, b) => a.rank - b.rank).forEach((it, k) => { it.z = k < heroes ? 1 : k < heroes + mediums ? .74 : .52; });
  for (const it of items) if (it.kind === 'gem') it.z = Math.min(it.z, themeKey === 'gems' ? .74 : .5);
  items.sort((a, b) => a.place - b.place);
  return { themeKey, theme: T, colouring, customTitle: P.title || null, items, plate };
}

// Split items into rows and size everything from one shared unit U, so relative sizes hold across the
// whole sheet (a hero crystal is always bigger than a cut stone). The split that allows the largest U wins.
function layoutRows(items, box, capH, r) {
  const gapX = 30, gapY = 26;
  const partition = k => {
    const tot = items.reduce((s, it) => s + it.a * it.z, 0), target = tot / k, rows = [];
    let cur = [], acc = 0;
    for (const it of items) {
      cur.push(it); acc += it.a * it.z;
      if (acc >= target * .92 && rows.length < k - 1) { rows.push(cur); cur = []; acc = 0; }
    }
    if (cur.length) rows.push(cur);
    return rows;
  };
  let best = null;
  for (let k = 1; k <= Math.min(7, items.length); k++) {
    const rows = partition(k);
    if (rows.some(row => row.length > 6)) continue;
    const uW = Math.min(...rows.map(row => (box.w - gapX * (row.length - 1)) / row.reduce((s, it) => s + it.a * it.z, 0)));
    const zMax = rows.map(row => Math.max(...row.map(it => it.z)));
    const uH = (box.h - capH * rows.length - gapY * (rows.length - 1)) / zMax.reduce((s, z) => s + z, 0);
    const U = Math.min(uW, uH, box.w * .62);
    if (!best || U > best.U) best = { rows, zMax, U };
  }
  const { rows, zMax, U } = best;
  const used = zMax.reduce((s, z) => s + z * U + capH, 0);
  const extraGap = rows.length > 1 ? Math.min(80, Math.max(0, (box.h - used - gapY * (rows.length - 1)) / (rows.length - 1))) : 0;
  const blockH = used + (gapY + extraGap) * (rows.length - 1);
  let y = box.y + (box.h - blockH) / 2;
  const placed = [];
  rows.forEach((row, ri) => {
    const bandH = zMax[ri] * U, widths = row.map(it => it.a * it.z * U), sumW = widths.reduce((s, w) => s + w, 0), n = row.length;
    // spread the row across the sheet, but not so far that its members drift apart
    const gap = n > 1 ? Math.min(gapX * 4, (box.w - sumW) / (n - 1)) : 0, rowW = sumW + gap * (n - 1);
    let x = box.x + (box.w - rowW) / 2;
    row.forEach((it, i) => {
      const ih = it.z * U, iw = widths[i];
      placed.push({ it, x, y: y + (bandH - ih) * r.range(.35, .75), w: iw, h: ih, capW: iw + Math.max(gap, gapX) * .85 });
      x += iw + gap;
    });
    y += bandH + capH + gapY + extraGap;
  });
  return placed;
}

// ---------------------------------------------------------------- titles
// Plate titles are assembled from what is actually on the plate: the kind of specimen that dominates,
// where the specimens were collected, the colouring, the hero specimen, and the plate number. Every
// plate also gets a long subtitle in the manner of an 18th-century title page.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const ORD = { One: 'First', Two: 'Second', Three: 'Third', Five: 'Fifth', Eight: 'Eighth', Nine: 'Ninth', Twelve: 'Twelfth' };
function numberWord(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); }
function ordinalWord(n) {
  const w = numberWord(n), parts = w.split('-'), last = parts.pop();
  const o = ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return [...parts, parts.length ? o.toLowerCase() : o].join('-');
}
// what a plate full of each kind is called
const KIND_NOUNS = {
  crystal: ['Crystals', 'Single Crystals', 'Crystallized Minerals'],
  cluster: ['Crystal Groups', 'Druses & Crystal Groups', 'Clustered Crystals'],
  agate: ['Agates', 'Agates & Chalcedonies', 'Banded Stones'],
  slab: ['Marbles & Porphyries', 'Polished Stones', 'Ornamental Stones'],
  matrix: ['Crystals upon their Matrix', 'Minerals in their Matrix'],
  rock: ['Ores & Rough Stones', 'Ores & Veinstones', 'Stones in the Rough'],
  gem: ['Cut Stones', 'Gems, Cut & Uncut', 'Precious Stones'],
};
// how each colouring reads as an adjective in a title (null: it does not)
const COLOUR_WORDS = { Blue: 'Blue', Green: 'Green', Violet: 'Violet', Rose: 'Rose-coloured', Red: 'Red', 'Gold & yellow': 'Yellow', Earth: 'Earthen', 'Black & white': 'Black & White' };
function makeTitle(plan, seed) {
  const r = new Rand(hash(`title|${seed}|${plan.themeKey}`)), items = plan.items;
  const tally = xs => Object.entries(xs.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const [place, place2 = r.pick(PLACES.filter(p => p !== place))] = tally(items.map(it => it.nm.place));
  const kinds = tally(items.map(it => it.kind)), kind = kinds[0];
  const nouns = r.pick(KIND_NOUNS[kind]), mixed = items.filter(it => it.kind === kind).length < items.length * .5;
  const hero = items.find(it => it.z === 1) || items[0], mineral = hero.nm.mineral;
  const col = plan.colouring, single = col && col.pals.length === 1, colour = col && !single ? COLOUR_WORDS[col.name] : null;
  const num = ordinalWord(plan.plate), count = numberWord(items.length).toLowerCase();
  const T = (w, s) => ({ w, s });
  const general = [
    T(2, r.pick(plan.theme.titles)),
    T(1.2, `Minerals of ${place}`),
    T(1, `Specimens collected at ${place}`),
    T(1, mixed ? `The ${place} Cabinet` : `${nouns} of ${place}`),
    T(1, mixed ? null : `A Selection of ${nouns}`),
    T(.9, `${mineral} & its Companions`),
    T(.8, `The ${num} Plate of Minerals`),
    T(.8, mixed ? null : `On ${nouns}`),
    T(colour ? 2.2 : 0, `Studies in ${colour}`),
    T(colour ? 1.8 : 0, `The ${colour} Minerals`),
    T(colour && !mixed ? 1.4 : 0, `${colour} ${nouns}`),
    T(single ? 2.4 : 0, single && `Minerals coloured after ${col.name}`),
    T(single ? 1.6 : 0, single && `${col.name} & its Kindred`),
  ];
  const themed = {
    quartz: [T(1.5, 'Rock Crystal & its Varieties'), T(1, `Quartz Crystals from ${place}`), T(1, `${mineral} & other Quartzes`)],
    agates: [T(1.5, `Agates of ${place}`), T(1, 'Onyx, Sard & Chalcedony'), T(1, `The Polished Stones of ${place}`)],
    gems: [T(1.5, 'Gems, Cut & Uncut'), T(1, 'Jewels of the Earth'), T(1, `Stones for the Lapidary`)],
    ores: [T(1.5, `The Mines of ${place}`), T(1, 'Metallic Ores & Veinstones'), T(1, `Ores of ${place} & ${place2}`)],
    kingdom: [T(1, 'The Mineral Kingdom'), T(1, 'Minerals & Crystals')],
    cabinet: [T(1.5, 'Curiosities of the Mineral Kingdom'), T(1, 'Specimens from a Private Cabinet')],
  }[plan.themeKey] || [];
  const pickFrom = list => { const ok = list.filter(t => t.w > 0 && t.s); let x = r.next() * ok.reduce((s, t) => s + t.w, 0); for (const t of ok) if ((x -= t.w) <= 0) return t.s; return ok[0].s; };
  const title = pickFrom(general.concat(themed));
  const adj = r.pick(['Rarer', 'Choicest', 'most Curious', 'Finer', 'most Remarkable']);
  const noun = mixed ? 'Minerals' : nouns;
  // the subtitle should add to the title, not repeat it
  const repeats = s => !s || [place, place2, "Mines", nouns].some(w => title.includes(w) && s.includes(w));
  const subtitle = pickFrom([
    T(1, `Being a Selection of the ${adj} ${noun}, drawn from Specimens in a Private Cabinet`),
    T(1, `Comprising ${count} Figures, drawn from Nature & coloured by Hand`),
    T(1, `With ${count} Figures of ${noun}, collected at ${place} & elsewhere`),
    T(1, `Drawn from Specimens lately brought from ${place}`),
    T(1, `Wherein are shewn the ${noun} most prized by Collectors`),
    T(.8, 'Faithfully delineated from the Originals'),
    T(.8, 'Engraved for the Instruction of the Curious'),
    T(1, `As found in the Mines of ${place} & ${place2}`),
    T(colour ? 1.2 : 0, `In which the ${colour} Stones are particularly considered`),
  ].map(t => repeats(t.s) ? T(0, t.s) : t));
  return { title, subtitle };
}
// Set the title and subtitle; returns the y (poster units) where the specimens may begin.
function drawTitleBlock(o, title, subtitle, u, measureOnly = false) {
  const maxW = 860;
  let size = 38, lines = [title.toUpperCase()];
  const widthAt = (s, text) => { o.font = `${s * u}px "IM Fell English SC", "IM Fell English", Georgia, serif`; const cs = [...text]; return (cs.reduce((w, ch) => w + o.measureText(ch).width, 0) + s * .16 * u * (cs.length - 1)) / u; };
  while (size > 27 && widthAt(size, lines[0]) > maxW) size -= 1;
  if (widthAt(size, lines[0]) > maxW) {
    // break into two lines at the most balanced join
    const words = lines[0].split(' ');
    let best = null;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), d = Math.abs(widthAt(32, a) - widthAt(32, b)); if (!best || d < best.d) best = { d, lines: [a, b] }; }
    lines = best.lines; size = 32;
    while (size > 22 && Math.max(...lines.map(l => widthAt(size, l))) > maxW) size -= 1;
  }
  let y = 62 + size * .95;
  const out = [];
  for (const ln of lines) { out.push({ ln, y, size }); y += size * 1.12; }
  // subtitle: italic, wrapped to at most two centred lines
  o.font = `italic ${17 * u}px "IM Fell English", Georgia, serif`;
  const words = (subtitle + '.').split(' '), sub = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (o.measureText(t).width / u > 700 && cur) { sub.push(cur); cur = w; } else cur = t; }
  sub.push(cur);
  y += 2;
  const subY = sub.map(() => { const v = y; y += 21; return v; });
  if (!measureOnly) {
    for (const t of out) { o.font = `${t.size * u}px "IM Fell English SC", "IM Fell English", Georgia, serif`; spacedText(o, t.ln, 500 * u, t.y * u, t.size * .16 * u); }
    o.font = `italic ${17 * u}px "IM Fell English", Georgia, serif`;
    sub.forEach((s, i) => o.fillText(s, 500 * u, subY[i] * u));
  }
  return y + 8;
}

// Letterspaced text, drawn a character at a time so it works where ctx.letterSpacing does not.
function spacedText(o, text, x, y, spacing) {
  const chars = [...text], widths = chars.map(ch => o.measureText(ch).width), total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2; const align = o.textAlign; o.textAlign = 'left';
  chars.forEach((ch, i) => { o.fillText(ch, cx, y); cx += widths[i] + spacing; });
  o.textAlign = align;
}
// The explanation printed at the foot of the plate: "Fig. 1. Name, description." set in columns.
const EXPL = { size: 14.5, lead: 18.5, gap: 30, headH: 36 };
function explanationEntry(fig, it) { return { prefix: `Fig. ${fig}.`, text: `${it.nm.title}, ${it.info.form.toLowerCase()}.` }; }
// Wrap an entry into lines no wider than w (poster units); the first line starts after the figure number.
function wrapEntry(o, e, w, u) {
  o.font = `${EXPL.size * u}px "IM Fell English SC", "IM Fell English", Georgia, serif`;
  const pw = o.measureText(e.prefix + ' ').width / u;
  o.font = `italic ${EXPL.size * u}px "IM Fell English", Georgia, serif`;
  const words = e.text.split(' '), lines = [];
  let cur = '', avail = w - pw;
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (o.measureText(t).width / u > avail && cur) { lines.push(cur); cur = wd; avail = w - 12; } else cur = t;
  }
  lines.push(cur);
  return { ...e, pw, lines };
}
function explanationColumns(n) { return n > 9 ? 3 : 2; }
function explanationHeight(o, items, u) {
  const cols = explanationColumns(items.length), colW = (860 - EXPL.gap * (cols - 1)) / cols;
  const lines = items.map((it, i) => wrapEntry(o, explanationEntry(i + 10, it), colW, u).lines.length);
  const perCol = Math.ceil(items.length / cols), worst = [...lines].sort((a, b) => b - a).slice(0, perCol).reduce((s, l) => s + l, 0);
  return EXPL.headH + worst * EXPL.lead + 6;
}
function drawExplanation(o, placed, top, u) {
  const cols = explanationColumns(placed.length), colW = (860 - EXPL.gap * (cols - 1)) / cols, perCol = Math.ceil(placed.length / cols);
  o.save(); o.lineWidth = .7 * u;
  o.beginPath(); o.moveTo(410 * u, top * u); o.lineTo(590 * u, top * u); o.stroke();
  o.font = `${14 * u}px "IM Fell English SC", "IM Fell English", Georgia, serif`; o.textAlign = 'center';
  spacedText(o, 'EXPLANATION OF THE PLATE', 500 * u, (top + 21) * u, 2.5 * u);
  o.textAlign = 'left';
  placed.forEach((p, i) => {
    const c = Math.floor(i / perCol), x = 70 + c * (colW + EXPL.gap);
    if (i % perCol === 0) p.ey = top + EXPL.headH + EXPL.size;
    const e = wrapEntry(o, explanationEntry(p.fig, p.it), colW, u);
    let y = placed[c * perCol].ey;
    o.font = `${EXPL.size * u}px "IM Fell English SC", "IM Fell English", Georgia, serif`; o.fillText(e.prefix, x * u, y * u);
    o.font = `italic ${EXPL.size * u}px "IM Fell English", Georgia, serif`;
    e.lines.forEach((ln, k) => { o.fillText(ln, (x + (k ? 12 : e.pw)) * u, y * u); y += EXPL.lead; });
    placed[c * perCol].ey = y;
  });
  o.restore();
}

const tick = () => new Promise(res => setTimeout(res, 0));

// Draw the whole poster onto `canvas`. P: { seed, theme, family, count, title, fx: { captions, frame, grain, foxing } } (colour is always off register, figure by figure)
// onProgress(done, total, label); isStale() returns true when a newer render has started.
async function renderPoster(canvas, P, onProgress = () => { }, isStale = () => false) {
  const plan = planPoster(P), fx = P.fx || {};
  const W = canvas.width, H = canvas.height, u = W / 1000, Hu = H / u;
  const total = plan.items.length * 2;
  // pass 1: measure each specimen's extent (plate units) at a small size
  for (const [i, it] of plan.items.entries()) {
    const r = drawSpecimen(200, 250, { seed: it.seed, kind: it.kind, palette: it.pal });
    const b = r.D.bb, pad = 16;
    it.bb = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
    it.bb.w = it.bb.x1 - it.bb.x0; it.bb.h = it.bb.y1 - it.bb.y0; it.a = it.bb.w / it.bb.h;
    it.nm = r.nm; it.info = r.info;
    onProgress(i + 1, total, 'Measuring the specimens'); await tick(); if (isStale()) return null;
  }
  // layout, in poster units (the sheet is 1000 units wide)
  const lettered = fx.captions !== false, capH = lettered ? 28 : 8;
  const measure = canvas.getContext("2d");
  const made = makeTitle(plan, P.seed), title = plan.customTitle || made.title, subtitle = made.subtitle;
  const headBottom = drawTitleBlock(measure, title, subtitle, u, true);
  const footTop = Hu - 66 - (lettered ? explanationHeight(measure, plan.items, u) : 0);
  const box = { x: 70, y: headBottom + 12, w: 860, h: footTop - 22 - headBottom - 12 };
  const placed = layoutRows(plan.items, box, capH, new Rand(hash('poster-layout|' + P.seed)));
  placed.forEach((p, i) => { p.fig = i + 1; }); // rows come out top to bottom, left to right
  // pass 2: draw each specimen at the size it will be printed, onto sheet-wide colour and ink layers
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const colC = mk(), inkC = mk(), col = colC.getContext('2d'), ink = inkC.getContext('2d');
  for (const [i, p] of placed.entries()) {
    const it = p.it, s = p.w * u / it.bb.w;
    const r = drawSpecimen(Math.ceil(1000 * s), Math.ceil(1250 * s), { seed: it.seed, kind: it.kind, palette: it.pal });
    const sx = it.bb.x0 * s, sy = it.bb.y0 * s, sw = it.bb.w * s, sh = it.bb.h * s;
    // each figure was coloured by hand on its own, so each sits off register in its own direction
    const reg = new Rand(hash(`poster-register|${P.seed}|${it.seed}`)), ra = reg.range(0, TAU), rm = STYLE.misreg * u * reg.range(.55, 1.35), rot = reg.range(-.006, .006);
    const cx = (p.x + p.w / 2) * u, cy = (p.y + p.h / 2) * u;
    col.save(); col.translate(cx + Math.cos(ra) * rm, cy + Math.sin(ra) * rm); col.rotate(rot); col.translate(-cx, -cy);
    col.drawImage(r.D.colC, sx, sy, sw, sh, p.x * u, p.y * u, p.w * u, p.h * u);
    col.restore();
    ink.drawImage(r.D.inkC, sx, sy, sw, sh, p.x * u, p.y * u, p.w * u, p.h * u);
    onProgress(plan.items.length + i + 1, total, `Engraving Fig. ${p.fig}`); await tick(); if (isStale()) return null;
  }
  onProgress(total, total, "Pulling the proof"); await tick(); if (isStale()) return null;
  // print: paper, colour (granulated, slightly off register), then ink
  const o = canvas.getContext('2d'), pr = new Rand(hash('poster-paper|' + P.seed));
  o.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.paper !== false) drawPaper(o, W, H, u, STYLE, pr, { grain: fx.grain !== false, foxing: fx.foxing !== false });
  else o.clearRect(0, 0, W, H);
  col.save(); col.globalCompositeOperation = 'source-atop'; col.globalAlpha = STYLE.gran; col.fillStyle = col.createPattern(TILES.gran, 'repeat'); col.fillRect(0, 0, W, H); col.restore();
  o.save(); o.globalCompositeOperation = "multiply"; o.drawImage(colC, 0, 0); o.drawImage(inkC, 0, 0); o.restore();
  // type and rules
  const inkRgb = rgb(hex(STYLE.ink), .92);
  o.save(); o.globalCompositeOperation = 'multiply'; o.fillStyle = inkRgb; o.strokeStyle = inkRgb; o.textBaseline = 'alphabetic'; o.textAlign = 'center';
  // a ruled border, double: a heavy outer rule and a fine inner one, set wide enough to clear the imprint
  o.lineWidth = 1.6 * u; o.strokeRect(20 * u, 20 * u, (1000 - 40) * u, (Hu - 40) * u);
  o.lineWidth = .7 * u; o.strokeRect(27 * u, 27 * u, (1000 - 54) * u, (Hu - 54) * u);
  drawTitleBlock(o, title, subtitle, u);
  o.font = `italic ${15 * u}px "IM Fell English", Georgia, serif`; o.textAlign = "right";
  o.fillText(`Pl. ${roman(plan.plate)}.`, 928 * u, 62 * u); o.textAlign = "center";
  if (lettered) {
    o.font = `italic ${16 * u}px "IM Fell English", Georgia, serif`;
    for (const p of placed) o.fillText(`Fig. ${p.fig}.`, (p.x + p.w / 2) * u, (p.y + p.h + 19) * u);
    drawExplanation(o, placed, footTop, u);
  }
  o.font = `italic ${13 * u}px "IM Fell English", Georgia, serif`;
  o.fillText('Drawn & coloured from nature.', 500 * u, (Hu - 42) * u);
  o.restore();
  return {
    title, subtitle, theme: plan.theme.name, family: plan.colouring ? plan.colouring.name : null, plate: plan.plate,
    figures: placed.map(p => ({ fig: p.fig, title: p.it.nm.title, kind: KINDS[p.it.kind].label, form: p.it.info.form, palette: PALETTES[p.it.pal].name, seed: p.it.seed })),
  };
}
