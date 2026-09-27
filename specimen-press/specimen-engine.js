"use strict";
// ================================================================ utilities
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const lp = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(str) {
  str = String(str);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909);
  return (h ^ h >>> 16) >>> 0;
}
class Rand {
  constructor(seed) { this.f = mulberry32(seed >>> 0); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  sign() { return this.f() < .5 ? -1 : 1; }
  weighted(obj) {
    const e = Object.entries(obj); let t = 0; for (const [, w] of e) t += w;
    let x = this.f() * t; for (const [k, w] of e) { if ((x -= w) <= 0) return k; } return e[e.length - 1][0];
  }
}
function makeNoise(seed) {
  const r = new Rand(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256); for (let i = 0; i < 256; i++) vals[i] = r.next();
  const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  const f = t => t * t * (3 - 2 * t);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = f(x - xi), w = f(y - yi);
    return lerp(lerp(v(xi, yi), v(xi + 1, yi), u), lerp(v(xi, yi + 1), v(xi + 1, yi + 1), u), w);
  }
  function fbm(x, y, o = 4) {
    let s = 0, a = 1, t = 0, fr = 1;
    for (let i = 0; i < o; i++) { s += a * n2(x * fr + i * 17.3, y * fr + i * 9.1); t += a; a *= .5; fr *= 2.03; }
    return s / t;
  }
  return { n2, fbm };
}

// colour (rgb arrays)
const hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const WHITE = [255, 255, 255], SOOT = [22, 18, 15];
function ramp4(stops, t) {
  t = clamp(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return mix(stops[i], stops[i + 1], t - i);
}
function saturate(c, s) {
  const l = c[0] * .3 + c[1] * .59 + c[2] * .11;
  return c.map(v => clamp(l + (v - l) * s, 0, 255));
}

// 2D geometry
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
const shift = (pts, dx, dy) => pts.map(p => [p[0] + dx, p[1] + dy]);
const centroid = pts => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };
const scaleAbout = (pts, c, k) => pts.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function hull2(points) {
  const p = points.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function circlePts(cx, cy, rx, ry, n = 48, a0 = 0) {
  const o = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o;
}
function trace(c, pts) { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }

// 3D
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mulMV = (M, v) => [dot3(M[0], v), dot3(M[1], v), dot3(M[2], v)];
const mulMM = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const chain = (...Ms) => Ms.reduce((A, B) => mulMM(A, B));
function alignY(d) { // rotation taking +Y onto d
  d = norm3(d); const ax = [d[2], 0, -d[0]]; const l = Math.hypot(ax[0], ax[2]);
  if (l < 1e-6) return d[1] > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : rotX(Math.PI);
  const [x, y, z] = [ax[0] / l, 0, ax[2] / l], th = Math.acos(clamp(d[1], -1, 1)), c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
}
const LIGHT = norm3([-0.52, 0.66, 0.56]);
const HALF = norm3([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

// ================================================================ palettes and print styles
// Each palette is a dark → light ramp. Two-tone palettes add ramp2, a second colour that shows up
// as zoned crystals, alternating bands, mixed crystal groups and bicolour stones.
const PALETTES = {
  indigo:     { name: "Dusk Lazuline", ramp: ['#1f2350', '#3d4591', '#7c86c8', '#cfd3ef'], accent: '#8fb7c9' },
  azurite:    { name: "Mariner's Azure", ramp: ['#0d2f63', '#1f63b8', '#5aa0e0', '#c7e1f5'], accent: '#3f8a6a' },
  turquoise:  { name: "Persian Callaine", ramp: ['#0f4a4c', '#2a9a95', '#79cfc4', '#d4f0ea'], accent: '#6b5a3a' },
  malachite:  { name: "Forest Malachine", ramp: ['#0b3a26', '#18764a', '#4fb57c', '#c1e8cf'], accent: '#1d4d36' },
  serpentine: { name: "Adder's Olive", ramp: ['#3a4420', '#6f8040', '#b0bf7c', '#e6ecc8'], accent: '#d8c690' },
  sulphur:    { name: "Brimstone Flavite", ramp: ['#6d6512', '#c3b52a', '#ece06a', '#faf5c6'], accent: '#d9892e' },
  citrine:    { name: "Honeyglass", ramp: ['#6b4210', '#b87a26', '#e2b35e', '#f6e5bd'], accent: '#a86b2d', clear: true },
  carnelian:  { name: "Ember Sard", ramp: ['#6e2410', '#c4561f', '#ec9a5c', '#f9dcc2'], accent: '#f3d7a0' },
  haematite:  { name: "Rust-blood Ore", ramp: ['#3a1210', '#852a22', '#c0584a', '#ecc3b8'], accent: '#e0b04a' },
  garnet:     { name: "Pomegranate Carbuncle", ramp: ['#360a1a', '#761a38', '#b0455f', '#e8b3c0'], accent: '#5b3a2a' },
  rose:       { name: "Rosewater Spar", ramp: ['#7a2847', '#c95a84', '#eba0bb', '#fadfe9'], accent: '#f1c9a0' },
  amethyst:   { name: "Bishop's Violet", ramp: ['#3d1e55', '#7a3f9e', '#b88ad2', '#ecdcf5'], accent: '#d9c7ea', clear: true },
  smoky:      { name: "Chimney Quartz", ramp: ['#33261c', '#6e5540', '#ad9474', '#ebe0cc'], accent: '#d6b86a', clear: true },
  crystal:    { name: "Mountain Ice", ramp: ['#4d5c62', '#93a4a8', '#cdd8d8', '#f5f7f4'], accent: '#c9a45f', clear: true },
  jet:        { name: "Widow's Coal", ramp: ['#16161b', '#3e3e48', '#83838c', '#e2e0da'], accent: '#b0553a' },
  fluorite:   { name: "Twilight Spar", ramp: ['#3a2466', '#6e4fb0', '#a896dc', '#e5defa'], ramp2: ['#1c4d3e', '#3f9577', '#8fcfb2', '#dcf2e7'], accent: '#e8e0a0', clear: true },
  azmal:      { name: "Peacock Ore", ramp: ['#0d2f63', '#1f63b8', '#5aa0e0', '#c7e1f5'], ramp2: ['#0b3a26', '#18764a', '#4fb57c', '#c1e8cf'], accent: '#a8763c' },
  watermelon: { name: "Melon-rind Schorl", ramp: ['#7a2847', '#d0628a', '#f0a6c0', '#fbe2eb'], ramp2: ['#1c4a30', '#3e8c55', '#8ac897', '#dcf0df'], accent: '#f4f0e0' },
};
const MATRIX = [
  { name: 'putty',    ramp: ['#6a5843', '#a88e6c', '#d4c3a1', '#ede3cc'] },
  { name: 'dove',     ramp: ['#58544d', '#8e887c', '#c2bcaf', '#e7e2d7'] },
  { name: 'limonite', ramp: ['#6b3b20', '#a86538', '#d49a62', '#f0d4ad'] },
  { name: 'umber',    ramp: ['#473f35', '#796c5b', '#b0a28a', '#ddd3c0'] },
  { name: 'chalk',    ramp: ['#8b8676', '#bdb6a2', '#e0dac8', '#f5f1e6'] },
];
// The one print style: a copperplate engraving, hand-coloured with watercolour afterwards.
const STYLE = { name: 'Hand-coloured engraving', paper: '#f4eddd', paperEdge: '#e0cfaa', ink: '#4a3425', tint: .28, sat: .86, wash: .82, washWob: 2.2, edge: .30, edgeW: 2.2, outline: 1.0, inner: .55, lineWob: .8, hatch: 2.0, stipple: 1.7, misreg: 3.6, soft: 3, gran: .22, bandLine: .55 };
// Watercolour tint: the pale end is washed toward the paper, the middle keeps its colour.
const TINT_BY_STOP = [.14, .12, .22, .3];
function preparePalette(p, st) {
  const f = (c, i = 1) => mix(saturate(hex(c), 1.05), WHITE, TINT_BY_STOP[i]);
  const r = ramp => ramp.map(f);
  return { ramp: r(p.ramp), ramp2: p.ramp2 ? r(p.ramp2) : null, accent: f(p.accent), clear: !!p.clear, name: p.name };
}

// ================================================================ drawer: two print layers (colour, ink)
// Specimens are drawn in plate units (1000 × 1250). `k` scales the specimen about the plate centre.
const PLATE_CX = 500, PLATE_CY = 560;
function makeDrawer(W, H, S, st, seed, k = 1) {
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.setTransform(S * k, 0, 0, S * k, S * PLATE_CX * (1 - k), S * PLATE_CY * (1 - k)); x.lineJoin = 'round'; x.lineCap = 'round'; return [c, x]; };
  const [colC, col] = mk(), [inkC, ink] = mk();
  return { colC, col, inkC, ink, W, H, S, k, style: st, r: new Rand(seed), n: makeNoise(seed ^ 0x9e3779b9), inkCol: hex(st.ink), paper: hex(st.paper), bb: { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 } };
}
function beginObject(D, polys, opacity = 1) {
  if (!Array.isArray(polys[0][0])) polys = [polys];
  for (const c of [D.col, D.ink]) {
    c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = opacity;
    c.beginPath(); for (const p of polys) trace(c, p); c.fill(); c.restore();
  }
  for (const p of polys) { const b = bbox(p); D.bb.x0 = Math.min(D.bb.x0, b.x0); D.bb.y0 = Math.min(D.bb.y0, b.y0); D.bb.x1 = Math.max(D.bb.x1, b.x1); D.bb.y1 = Math.max(D.bb.y1, b.y1); }
}
function wob(D, pts, amt = 1, closed = true, step = 8) {
  if (amt <= 0) return pts;
  const out = [], n = pts.length, segs = closed ? n : n - 1, k = D.r.range(0, 200);
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const m = Math.max(1, Math.ceil(L / step)), nx = -dy / L, ny = dx / L;
    for (let j = 0; j < m; j++) {
      const t = j / m, x = a[0] + dx * t, y = a[1] + dy * t;
      const o = (D.n.n2(x * .06 + k, y * .06) - .5) * 2 * amt * (j === 0 ? .3 : 1);
      out.push([x + nx * o, y + ny * o]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
function wash(D, pts, color, alpha = 1, o = {}) {
  const c = D.col, st = D.style, w = o.wob ?? st.washWob;
  c.save(); c.fillStyle = rgb(color);
  c.globalAlpha = alpha * st.wash; c.beginPath(); trace(c, wob(D, pts, w)); c.fill();
  if (st.wash < .9) { c.globalAlpha = alpha * .25; c.beginPath(); trace(c, wob(D, pts, w * 1.8)); c.fill(); }
  const e = o.edge ?? st.edge;
  if (e > 0) { c.globalAlpha = alpha * e; c.strokeStyle = rgb(mix(color, SOOT, .3)); c.lineWidth = st.edgeW; c.beginPath(); trace(c, wob(D, pts, w)); c.stroke(); }
  c.restore();
}
function fillPoly(ctx, pts, color, alpha = 1) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = rgb(color); ctx.beginPath(); trace(ctx, pts); ctx.fill(); ctx.restore(); }
function strokePoly(D, pts, w, alpha = 1, closed = true, color) {
  if (w <= 0) return; const c = D.ink;
  c.save(); c.strokeStyle = rgb(color || D.inkCol); c.globalAlpha = alpha; c.lineWidth = w; c.beginPath();
  const q = wob(D, pts, D.style.lineWob * .6, closed, 10);
  c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) c.lineTo(q[i][0], q[i][1]); if (closed) c.closePath();
  c.stroke(); c.restore();
}
function inkLine(D, pts, w, closed = true, alpha = 1) {
  if (w <= 0) return; const c = D.ink;
  c.save(); c.strokeStyle = rgb(D.inkCol);
  for (const [k, a, wb] of [[1, alpha, 1], [.55, alpha * .45, 2]]) {
    const q = wob(D, pts, D.style.lineWob * wb, closed, 7);
    c.globalAlpha = a; c.lineWidth = w * k; c.beginPath();
    c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) c.lineTo(q[i][0], q[i][1]); if (closed) c.closePath();
    c.stroke();
  }
  c.restore();
}
function clipBoth(D, pts) { for (const c of [D.col, D.ink]) { c.save(); c.beginPath(); trace(c, pts); c.clip(); } }
function restoreBoth(D) { D.col.restore(); D.ink.restore(); }
// region of pts not covered by pts shifted by (dx,dy)
function crescent(c, pts, dx, dy, color, alpha) {
  c.save(); c.beginPath(); trace(c, pts); c.clip();
  c.beginPath(); trace(c, pts); trace(c, shift(pts, dx, dy));
  c.fillStyle = rgb(color); c.globalAlpha = alpha; c.fill('evenodd'); c.restore();
}
// engraved parallel lines clipped to polys; optional mask(x,y) in 0..1 decides where the pen is down
function hatch(D, clipPolys, angle, spacing, o = {}) {
  const polys = Array.isArray(clipPolys[0][0]) ? clipPolys : [clipPolys];
  const b = bbox(polys.flat()), c = D.ink, R = Math.hypot(b.w, b.h) / 2 + 2;
  const dx = Math.cos(angle), dy = Math.sin(angle), px = -dy, py = dx;
  c.save(); c.beginPath(); for (const p of polys) trace(c, p); c.clip();
  c.strokeStyle = rgb(o.color || D.inkCol); c.lineWidth = o.w || .6; c.globalAlpha = o.a ?? .7; c.beginPath();
  const step = 4, wave = o.wave ?? 1.2;
  for (let s = -R; s < R; s += spacing * D.r.range(.8, 1.2)) {
    const thr = D.r.range(o.thrMin ?? 0, o.thrMax ?? 1); let pen = false;
    for (let u = -R; u <= R; u += step) {
      const x = b.cx + px * s + dx * u, y = b.cy + py * s + dy * u;
      const wv = (D.n.n2(x * .03, y * .03) - .5) * wave, X = x + px * wv, Y = y + py * wv;
      const on = !o.mask || o.mask(X, Y) > thr;
      if (on) { if (!pen) { c.moveTo(X, Y); pen = true; } else c.lineTo(X, Y); } else pen = false;
    }
  }
  c.stroke(); c.restore();
}
function stipple(D, pts, n, o = {}) {
  const b = bbox(pts), c = o.ctx || D.ink;
  c.save(); c.fillStyle = rgb(o.color || D.inkCol); c.globalAlpha = o.a ?? .75;
  if (o.erase) c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h;
    if (!inPoly(pts, x, y)) continue;
    if (o.mask && D.r.next() > o.mask(x, y)) continue;
    const r = (o.r || .8) * D.r.range(.5, 1.3); c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
  }
  c.fill(); c.restore();
}
function faceLines(D, q, dir, n, o) {
  if (!dir || n < 2) return;
  const c = D.ink; c.save(); c.strokeStyle = rgb(D.inkCol); c.lineWidth = o.w; c.globalAlpha = o.a; c.beginPath();
  for (let i = 1; i < n; i++) {
    const u = clamp((i + D.r.range(-.35, .35)) / n, .01, .99);
    let p, r;
    if (dir === 'along') { p = lp(q[0], q[1], u); r = lp(q[3], q[2], u); } else { p = lp(q[0], q[3], u); r = lp(q[1], q[2], u); }
    let t0, t1;
    if (D.r.chance(o.partial)) { t0 = D.r.range(0, .55); t1 = Math.min(1, t0 + D.r.range(.12, .6)); } else { t0 = D.r.range(0, .05); t1 = 1 - D.r.range(0, .05); }
    const a = lp(p, r, t0), e = lp(p, r, t1); c.moveTo(a[0], a[1]); c.lineTo(e[0], e[1]);
  }
  c.stroke(); c.restore();
}
function eraseLine(D, a, b, w, alpha) {
  const c = D.col; c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = alpha; c.lineWidth = w;
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.restore();
}

// ================================================================ crystal solids
function crystalGeo(G, habit, o = {}) {
  const s = o.size || 1;
  let n = 6, rx = 1, rz = 1, h = 3, term = 'point', termH = 1.2, k = .5, base = 'broken', baseH = 1, aj = .1, stri = 'across';
  switch (habit) {
    case 'prism': n = G.pick([6, 6, 6, 6, 6, 8]); rz = G.range(.7, 1); h = G.range(2.2, 4.5); termH = G.range(.9, 1.7); base = G.chance(.75) ? 'broken' : 'flat'; stri = G.chance(.7) ? 'across' : 'along'; break;
    case 'needle': n = G.pick([4, 6]); rz = G.range(.8, 1); h = G.range(8, 16); termH = G.range(1.5, 3); base = 'flat'; stri = 'along'; break;
    case 'column': n = G.pick([6, 9, 3]); rz = G.range(.8, 1); h = G.range(4, 7); term = G.pick(['table', 'flat', 'point']); k = G.range(.3, .7); termH = term === 'point' ? G.range(.6, 1) : G.range(.2, .6); stri = 'along'; break;
    case 'double': n = 6; rz = G.range(.75, 1); h = G.range(.6, 2); termH = G.range(1, 1.5); base = 'point'; baseH = termH * G.range(.85, 1.1); break;
    case 'octahedron': n = 4; aj = 0; h = 0; termH = 1.35; base = 'point'; baseH = 1.35; stri = 'none'; break;
    case 'cube': n = 4; aj = 0; h = 1.414; term = 'flat'; base = 'flat'; stri = G.pick(['pyrite', 'pyrite', 'along', 'none']); break;
    case 'tabular': n = G.pick([4, 6]); rz = G.range(.28, .45); h = G.range(.4, .9); term = 'table'; k = G.range(.6, .85); termH = G.range(.1, .25); base = 'flat'; stri = 'along'; break;
  }
  if (o.n) n = o.n; if (o.rz) rz = o.rz; if (o.h != null) h = o.h; if (o.base) base = o.base; if (o.term) term = o.term; if (o.aj != null) aj = o.aj;
  const a0 = o.a0 ?? (n === 4 ? Math.PI / 4 : G.range(0, TAU / n));
  const ang = [...Array(n)].map((_, i) => a0 + i * TAU / n + G.range(-aj, aj));
  const ring = (y, sc, ox = 0, oz = 0) => ang.map(a => [(Math.cos(a) * rx * sc + ox) * s, y * s, (Math.sin(a) * rz * sc + oz) * s]);
  const verts = [], faces = [];
  const add = pts => pts.map(p => verts.push(p) - 1);
  const Bp = ring(0, 1);
  if (base === 'broken') for (const p of Bp) p[1] += G.range(-.4, .4) * s;
  const B = add(Bp);
  const T = h > 0 ? add(ring(h, 1)) : B;
  const nx = i => (i + 1) % n;
  if (h > 0) for (let i = 0; i < n; i++) faces.push({ i: [B[i], B[nx(i)], T[nx(i)], T[i]], kind: 'side', k: i });
  if (term === 'point') {
    const a = verts.push([G.range(-.34, .34) * rx * s, (h + termH) * s, G.range(-.34, .34) * rz * s]) - 1;
    for (let i = 0; i < n; i++) faces.push({ i: [T[i], T[nx(i)], a], kind: 'term' });
  } else if (term === 'table') {
    const T2 = add(ring(h + termH, k, G.range(-.1, .1), G.range(-.1, .1)));
    for (let i = 0; i < n; i++) faces.push({ i: [T[i], T[nx(i)], T2[nx(i)], T2[i]], kind: 'term' });
    faces.push({ i: T2.slice(), kind: 'top' });
  } else faces.push({ i: T.slice(), kind: 'top' });
  if (base === 'point') {
    const a = verts.push([G.range(-.15, .15) * rx * s, -baseH * s, G.range(-.15, .15) * rz * s]) - 1;
    for (let i = 0; i < n; i++) faces.push({ i: [B[i], B[nx(i)], a], kind: 'term' });
  } else faces.push({ i: B.slice(), kind: base === 'broken' ? 'base' : 'top' });
  const cen = verts.reduce((a, p) => [a[0] + p[0] / verts.length, a[1] + p[1] / verts.length, a[2] + p[2] / verts.length], [0, 0, 0]);
  for (const f of faces) {
    let nn = [0, 0, 0];
    for (let j = 0; j < f.i.length; j++) {
      const a = verts[f.i[j]], b = verts[f.i[(j + 1) % f.i.length]];
      nn[0] += (a[1] - b[1]) * (a[2] + b[2]); nn[1] += (a[2] - b[2]) * (a[0] + b[0]); nn[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    nn = norm3(nn);
    const fc = f.i.reduce((a, k2) => [a[0] + verts[k2][0], a[1] + verts[k2][1], a[2] + verts[k2][2]], [0, 0, 0]).map(v => v / f.i.length);
    if (dot3(nn, [fc[0] - cen[0], fc[1] - cen[1], fc[2] - cen[2]]) < 0) nn = nn.map(v => -v);
    f.n = nn; f.jit = G.range(-.07, .07); f.ly = fc[1];
  }
  return { verts, faces, stri, habit };
}
function projectSolid(inst, V, fit) {
  const MV = mulMM(V, inst.M), T = inst.T || [0, 0, 0];
  const P = inst.geo.verts.map(p => { const w = mulMV(inst.M, p); const v = mulMV(V, [w[0] + T[0], w[1] + T[1], w[2] + T[2]]); return [fit.ox + v[0] * fit.s, fit.oy - v[1] * fit.s, v[2]]; });
  const faces = inst.geo.faces.map(f => ({ ...f, nv: mulMV(MV, f.n), pts: f.i.map(k => P[k]), z: f.i.reduce((s, k) => s + P[k][2], 0) / f.i.length }));
  return { P, faces, hull: hull2(P), z: P.reduce((s, p) => s + p[2], 0) / P.length };
}
function fitBox(insts, V, box) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const inst of insts) for (const p of inst.geo.verts) {
    const w = mulMV(inst.M, p), T = inst.T || [0, 0, 0], v = mulMV(V, [w[0] + T[0], w[1] + T[1], w[2] + T[2]]);
    x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
  }
  const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  return { s, ox: box.x + box.w / 2 - s * (x0 + x1) / 2, oy: box.y + box.h / 2 + s * (y0 + y1) / 2 };
}
function drawSolid(D, pr, geo, o = {}) {
  const st = D.style, ramp = o.ramp || D.pal.ramp, clear = o.clear;
  if (o.contact) {
    // contact shadow: darken whatever is already drawn just around and below this crystal
    const c = D.col; c.save(); c.globalCompositeOperation = 'source-atop'; c.filter = `blur(${5 * D.S * D.k}px)`;
    c.globalAlpha = .5; c.fillStyle = rgb(SOOT); c.beginPath(); trace(c, shift(pr.hull, 5, 7)); c.fill(); c.restore();
  }
  beginObject(D, pr.hull);
  wash(D, pr.hull, ramp[1], 1, { edge: 0, wob: .3 });
  const vis = pr.faces.filter(f => f.nv[2] > .01).sort((a, b) => a.z - b.z);
  for (const f of vis) {
    const d = dot3(f.nv, LIGHT), sp = Math.pow(Math.max(0, dot3(f.nv, HALF)), 22);
    f.t = clamp(.5 + .55 * d + f.jit);
    const fr = o.ramp2 && o.zone != null && f.ly < o.zone ? o.ramp2 : ramp;
    let c = ramp4(fr, f.t); if (sp > .45) { c = mix(c, fr[3], .8); f.t = Math.max(f.t, .85); }
    wash(D, f.pts, c, clear ? .88 : 1, { wob: st.washWob * .5 });
    faceGradient(D, f.pts, fr[0], .12 + (1 - f.t) * .22);
  }
  if (clear) {
    for (const f of pr.faces) if (f.nv[2] <= .01) strokePoly(D, f.pts, st.inner * .8, .2);
    if (o.phantom) {
      const cx = centroid(pr.P); const k = .55;
      for (const f of vis) if (f.kind === 'term') strokePoly(D, scaleAbout(f.pts, [cx[0], cx[1] - 0], k).map(p => [p[0], p[1] + (pr.hull ? 0 : 0)]), st.inner * .7, .22);
    }
    if (o.needles) {
      const b = bbox(pr.hull), c = D.ink; c.save(); c.beginPath(); trace(c, pr.hull); c.clip();
      c.strokeStyle = rgb(mix(D.pal.accent, SOOT, .35)); c.lineWidth = .7; c.globalAlpha = .7; c.beginPath();
      const ang0 = D.r.range(0, TAU);
      for (let i = 0; i < o.needles; i++) {
        const x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h, a = ang0 + D.r.range(-.5, .5) + (D.r.chance(.3) ? Math.PI / 3 : 0), L = D.r.range(.1, .45) * b.h;
        c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      }
      c.stroke(); c.restore();
    }
  }
  for (const f of vis) faceInk(D, f, geo);
  for (const f of vis) strokePoly(D, f.pts, st.inner, .85);
  for (const f of vis) {
    if (f.t < .72 || f.pts.length < 3) continue;
    const c0 = centroid(f.pts); let best = 0, bi = 0;
    for (let i = 0; i < f.pts.length; i++) { const L = dist(f.pts[i], f.pts[(i + 1) % f.pts.length]); if (L > best) { best = L; bi = i; } }
    const a = lp(f.pts[bi], c0, .1), b = lp(f.pts[(bi + 1) % f.pts.length], c0, .1);
    eraseLine(D, lp(a, b, .08), lp(a, b, D.r.range(.5, .92)), 1.6, .6);
  }
  inkLine(D, pr.hull, st.outline);
}
function faceInk(D, f, geo) {
  const st = D.style, dark = 1 - f.t, pts = f.pts;
  if (pts.length > 4) {
    if (f.kind === 'base') { stipple(D, pts, 500 * st.stipple, { r: .7, a: .6 }); return; }
    if (dark > .45) hatch(D, pts, D.r.range(0, Math.PI), 4.5 / st.hatch, { w: .5, a: .45 });
    return;
  }
  const q = pts.length === 4 ? pts : [pts[0], pts[1], pts[2], pts[2]];
  let dir = f.kind === 'side' ? geo.stri : 'across';
  let n;
  if (geo.stri === 'pyrite') { dir = f.kind === 'side' ? (f.k % 2 ? 'along' : 'across') : (D.r.chance(.5) ? 'along' : 'across'); }
  if (dir === 'none') { if (dark < .5) return; dir = 'across'; }
  const span = dir === 'along' ? dist(q[0], q[1]) : dist(q[1], q[2]);
  n = geo.stri === 'pyrite' ? Math.floor(span / 3.6) : Math.floor(span / 5 * st.hatch * clamp(dark * 1.3 + (f.kind === 'side' ? .2 : 0)));
  faceLines(D, q, dir, Math.min(n, 90), { w: .45 + dark * .35, a: .25 + dark * .5, partial: geo.stri === 'pyrite' ? .08 : f.kind === 'side' ? .5 : .2 });
}

// ================================================================ rocks and slabs
function blob(G, GN, cx, cy, rx, ry, o = {}) {
  const N = o.n || 110, k = G.range(0, 60), rough = o.rough ?? .25;
  let pts = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU;
    const r = 1 + rough * (GN.fbm(Math.cos(a) * 1.2 + k, Math.sin(a) * 1.2 + k, 4) - .5) * 1.8 + (o.fine ?? .02) * (GN.n2(a * 9 + k, 3.1) - .5);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  const chips = o.chips ?? 0, cuts = [];
  for (let c = 0; c < chips; c++) {
    const a = G.range(0, TAU), nx = Math.cos(a), ny = Math.sin(a);
    let m = -Infinity; for (const p of pts) m = Math.max(m, (p[0] - cx) * nx + (p[1] - cy) * ny);
    const d = m * G.range(.78, .93);
    pts = pts.map(p => { const pr = (p[0] - cx) * nx + (p[1] - cy) * ny; return pr > d ? [p[0] - nx * (pr - d), p[1] - ny * (pr - d)] : p; });
    cuts.push({ nx, ny, cx, cy, d, band: G.range(.14, .34) * Math.max(rx, ry), tilt: G.range(-.3, .3) });
  }
  pts.cuts = cuts;
  return pts;
}
// keep the part of pts where (p - c)·n >= d; also returns the cut chord
function clipHalf(pts, nx, ny, cx, cy, d) {
  const out = [], chord = [], f = p => (p[0] - cx) * nx + (p[1] - cy) * ny - d;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const q = lp(a, b, fa / (fa - fb)); out.push(q); chord.push(q); }
  }
  return { poly: out, chord };
}
// broken faces: flat planes left by the chips, each shaded by which way it faces
function rockFacets(D, pts, cuts, ramp) {
  if (!cuts || !cuts.length) return;
  const st = D.style;
  clipBoth(D, pts);
  for (const k of cuts) {
    // the fracture plane leans a little, so its inner edge is not parallel to the outline
    const a = Math.atan2(k.ny, k.nx) + k.tilt, nx = Math.cos(a), ny = Math.sin(a);
    const { poly, chord } = clipHalf(pts, nx, ny, k.cx, k.cy, k.d - k.band);
    if (poly.length < 3) continue;
    const lit = -(nx * .55 + ny * .8);
    if (lit > .1) fillPoly(D.col, poly, ramp[3], .3 + .45 * lit);
    else fillPoly(D.col, poly, ramp[0], .22 + .35 * -lit);
    if (chord.length >= 2) {
      strokePoly(D, chord.slice(0, 2), st.inner * 1.1, .85, false);
      if (lit > .1) eraseLine(D, lp(chord[0], chord[1], .1), lp(chord[0], chord[1], .7), 1.4, .5);
    }
    if (lit < .1 && st.hatch > .4) hatch(D, poly, Math.atan2(ny, nx) + Math.PI / 2, 4.2 / st.hatch, { w: .45, a: .45, wave: .6 });
  }
  restoreBoth(D);
}
function rockCracks(D, pts, n) {
  const b = bbox(pts), c = D.ink; clipBoth(D, pts);
  for (let i = 0; i < n; i++) {
    let x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h, a = D.r.range(0, TAU);
    const line = [[x, y]], L = D.r.int(4, 14);
    for (let s = 0; s < L; s++) { a += D.r.range(-.6, .6); x += Math.cos(a) * 8; y += Math.sin(a) * 8; line.push([x, y]); }
    strokePoly(D, line, .55, .7, false);
  }
  restoreBoth(D);
}
function extrude(D, pts, t, color) {
  const steps = Math.max(3, Math.ceil(Math.hypot(t[0], t[1]) / 2)), polys = [];
  for (let k = 1; k <= steps; k++) polys.push(shift(pts, t[0] * k / steps, t[1] * k / steps));
  beginObject(D, [pts, ...polys]);
  const c = D.col; c.save(); c.fillStyle = rgb(color); c.globalAlpha = D.style.wash; c.beginPath(); for (const p of polys) trace(c, p); c.fill(); c.restore();
  hatch(D, polys, Math.atan2(t[1], t[0]), 3.4 / Math.max(.45, D.style.hatch), { a: .55, w: .5, wave: .5 });
  inkLine(D, polys[polys.length - 1], D.style.outline || .5, true, D.style.outline ? 1 : .5);
  return polys;
}
function rockShading(D, pts, ramp) {
  const b = bbox(pts), R = Math.max(b.w, b.h) / 2, c = D.col, soft = D.style.soft * D.S;
  c.save(); if (soft) c.filter = `blur(${soft}px)`;
  crescent(c, pts, -R * .2, -R * .24, ramp[1], .8);
  crescent(c, pts, -R * .07, -R * .09, ramp[0], .6);
  crescent(c, pts, R * .14, R * .17, ramp[3], .65);
  c.restore();
  return (x, y) => clamp(.45 + .65 * ((x - b.cx) * .55 + (y - b.cy) * .8) / R);
}
function rockInk(D, pts, shadeAt, density = 1) {
  const st = D.style, b = bbox(pts);
  if (st.hatch > 1.5) hatch(D, pts, -.6, 3.2, { mask: shadeAt, thrMin: .35, thrMax: .95, w: .5, a: .6 });
  stipple(D, pts, b.w * b.h / 22 * st.stipple * density, { mask: (x, y) => Math.pow(shadeAt(x, y), 1.6), r: .75 });
  inkLine(D, pts, st.outline || .5, true, st.outline ? 1 : .45);
}
function rockTexture(D, pts, ramp, tex) {
  const b = bbox(pts), c = D.col;
  clipBoth(D, pts);
  const k = D.r.range(0, 99);
  for (let i = 0; i < 600; i++) {
    const x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h, v = D.n.fbm(x * .012 + k, y * .012, 3);
    if (v < .52) continue;
    c.globalAlpha = .1 + .35 * (v - .52); c.fillStyle = rgb(D.r.chance(.5) ? ramp[1] : ramp[0]);
    c.beginPath(); c.ellipse(x, y, D.r.range(4, 22), D.r.range(3, 14), D.r.range(0, TAU), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  if (tex === 'speckled') {
    const cols = [D.pal.ramp[1], D.pal.ramp[2], D.pal.accent, ...(D.pal.ramp2 ? [D.pal.ramp2[1], D.pal.ramp2[2]] : [])];
    const n = D.r.int(40, 140);
    for (let i = 0; i < n; i++) {
      const x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h, r = D.r.chance(.15) ? D.r.range(8, 18) : D.r.range(2, 7);
      const p = circlePts(x, y, r, r * D.r.range(.5, 1), 9, D.r.range(0, TAU)).map(q => [q[0] + D.r.range(-r, r) * .3, q[1] + D.r.range(-r, r) * .3]);
      fillPoly(c, p, D.r.pick(cols), .85);
      if (r > 7) strokePoly(D, p, .5, .5);
    }
  } else if (tex === 'pitted') {
    const n = D.r.int(10, 32);
    for (let i = 0; i < n; i++) {
      const x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h, r = D.r.range(4, 16);
      const p = circlePts(x, y, r, r * .65, 16, D.r.range(-.3, .3));
      fillPoly(c, p, ramp[0], .75); crescent(c, p, 0, r * .3, ramp[3], .5);
      strokePoly(D, p.slice(8).concat([p[0]]), .6, .7, false);
    }
  } else if (tex === 'veined') {
    const n = D.r.int(2, 5); c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = .75;
    for (let i = 0; i < n; i++) {
      let x = b.x0 + D.r.next() * b.w, y = b.y0 + D.r.next() * b.h, a = D.r.range(0, TAU), w = D.r.range(1.5, 4);
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 60; s++) { a += D.r.range(-.35, .35); x += Math.cos(a) * 7; y += Math.sin(a) * 7; c.lineTo(x, y); }
      c.stroke();
    }
    c.restore();
  } else if (tex === 'granular') {
    stipple(D, pts, b.w * b.h / 30, { ctx: c, erase: true, r: 1.1, a: .6 });
    stipple(D, pts, b.w * b.h / 60, { ctx: c, color: ramp[0], r: 1.3, a: .5 });
  }
  restoreBoth(D);
}
function drawRockTop(D, pts, ramp, tex, density = 1) {
  beginObject(D, pts);
  wash(D, pts, ramp[2]);
  const shadeAt = rockShading(D, pts, ramp);
  rockTexture(D, pts, ramp, tex);
  rockFacets(D, pts, pts.cuts, ramp);
  rockCracks(D, pts, D.r.int(1, 4));
  rockInk(D, pts, shadeAt, density);
  return shadeAt;
}
// Crystal points lining a cavity: rows of pyramids set around the rim, pointing inward,
// big at the rim and smaller toward the centre. o.size is the rim tooth size in plate units.
function druzyTeeth(D, region, center, ramp, o = {}) {
  const b = bbox(region), size0 = o.size || Math.sqrt(b.w * b.h) * .15, rows = o.rows || 3;
  clipBoth(D, region);
  const teeth = [];
  for (let row = 0; row < rows; row++) {
    const s = size0 * (1 - row * .2), ring = scaleAbout(region, center, 1 - row * .22);
    let gap = D.r.range(0, s);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length], L = dist(a, c);
      while (gap < L) {
        const p = lp(a, c, gap / L);
        const ang = Math.atan2(center[1] - p[1], center[0] - p[0]) + D.r.range(-.35, .35);
        teeth.push({ x: p[0], y: p[1], a: ang, s: s * D.r.range(.7, 1.25), row });
        gap += s * D.r.range(.7, 1.1);
      }
      gap -= L;
    }
  }
  teeth.sort((p, q) => p.row - q.row || p.s - q.s);
  for (const t of teeth) drawTooth(D, t, ramp);
  restoreBoth(D);
}
// one small crystal point: a pyramid seen side-on, lit half and shaded half. t: {x, y, a (pointing angle), s (size)}
function drawTooth(D, t, ramp) {
  const ux = Math.cos(t.a), uy = Math.sin(t.a), px = -uy, py = ux, hw = t.s * .5 * (t.w || 1), L = t.s * (t.len || 1.5);
  const b1 = [t.x + px * hw, t.y + py * hw], b2 = [t.x - px * hw, t.y - py * hw], apex = [t.x + ux * L, t.y + uy * L];
  const ridge = [t.x + ux * t.s * .3 + px * hw * .15, t.y + uy * t.s * .3 + py * hw * .15];
  const A = [b1, ridge, apex], B = [ridge, b2, apex];
  const litA = px * -.55 + py * -.8 > 0;
  wash(D, [b1, b2, apex], ramp[2], 1, { edge: 0, wob: .4 });
  fillPoly(D.col, litA ? A : B, ramp[3], .85);
  fillPoly(D.col, litA ? B : A, ramp[1], .85);
  const dark = litA ? B : A;
  faceLines(D, [dark[0], dark[1], dark[2], dark[2]], 'across', Math.max(2, Math.round(t.s / 4)), { w: .4, a: .5, partial: .2 });
  strokePoly(D, [b1, apex, b2], D.style.inner, .85, false);
  strokePoly(D, [ridge, apex], D.style.inner * .7, .6, false);
  if (D.r.chance(.45)) { const lit = litA ? A : B; eraseLine(D, lp(lit[0], lit[2], .2), lp(lit[0], lit[2], .75), 1.3, .65); }
}


// ================================================================ clusters: crystals growing out of a rock top
function rotAxis(ax, th) {
  const [x, y, z] = norm3(ax), c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
}
function geoSpan(geo) {
  let y0 = Infinity, y1 = -Infinity, r = 0;
  for (const p of geo.verts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); r = Math.max(r, Math.hypot(p[0], p[2])); }
  return { h: y1 - y0, r, y0, y1 };
}
function scaleGeo(geo, k) { geo.verts = geo.verts.map(p => [p[0] * k, p[1] * k, p[2] * k]); for (const f of geo.faces) f.ly *= k; return geo; }
function centerGeo(geo) {
  const c = geo.verts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / geo.verts.length);
  geo.verts = geo.verts.map(p => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]); for (const f of geo.faces) f.ly -= c[1]; return geo;
}
// a crystal of the given habit, scaled so it is `len` plate units long
function sizedCrystal(G, habit, len) { const g = crystalGeo(G, habit); return scaleGeo(g, len / geoSpan(g).h); }
function cubeOf(G, edge) { return scaleGeo(crystalGeo(G, 'cube'), edge / Math.SQRT2); }

// The rock a cluster grows on. World units are plate units; the rock's top is the plane y = 0,
// an ellipse RX × RZ, seen from a little above.
function clusterBed(G, GN, o = {}) {
  const pitch = G.range(.32, .46), RX = o.RX || G.range(250, 310), RZ = RX * G.range(.55, .75), depth = G.range(160, 240);
  const V = rotX(pitch), top = G.range(630, 670), sp = Math.sin(pitch);
  const fit = { s: 1, ox: 500, oy: top };
  const pts = blob(G, GN, 500, top + depth * .45, RX * 1.12, RZ * sp * 1.05 + depth * .45, { rough: .34, chips: G.int(3, 5) });
  return {
    V, fit, pitch, RX, RZ, pts, tex: G.pick(['stipple', 'granular', 'pitted']),
    topPoly: circlePts(500, top, RX * .92, RZ * sp * .92, 40),
    at(x, y, z) { const v = mulMV(V, [x, y, z]); return [fit.ox + v[0], fit.oy - v[1], v[2]]; },
    spot(rmax = .8, rmin = 0) { const t = G.range(0, TAU), r = Math.sqrt(G.range(rmin * rmin, rmax * rmax)); return [Math.cos(t) * RX * r, 0, Math.sin(t) * RZ * r]; },
    inside(b, lim = .8) { const e = (b[0] / RX) ** 2 + (b[2] / RZ) ** 2; return e < lim * lim ? b : [b[0] * lim / Math.sqrt(e), b[1], b[2] * lim / Math.sqrt(e)]; },
  };
}
function drawBed(D, bed) {
  drawRockTop(D, bed.pts, D.matrix.ramp, bed.tex);
  // the flat top catches the light
  const c = D.col; c.save(); c.beginPath(); trace(c, bed.pts); c.clip(); c.filter = `blur(${10 * D.S * D.k}px)`;
  fillPoly(c, bed.topPoly, D.matrix.ramp[3], .45); c.restore();
}
// A crust of small crystal points over the rock top. Real crusts grow in patches, so points are
// gathered around a few centres (or spread evenly when the whole top is coated), and they are
// short and broad so they read as glinting points, not sprouts.
function crust(D, bed, count, size, o = {}) {
  const teeth = [], even = o.even ?? count > 140;
  const centres = [...Array(D.r.int(3, 6))].map(() => { const t = D.r.range(0, TAU), r = Math.sqrt(D.r.next()) * .75; return [Math.cos(t) * r, Math.sin(t) * r, D.r.range(.12, .28)]; });
  for (let i = 0; i < count; i++) {
    let u, v;
    if (even) { const t = D.r.range(0, TAU), r = Math.sqrt(D.r.next()) * .9; u = Math.cos(t) * r; v = Math.sin(t) * r; }
    else { const c = D.r.pick(centres), t = D.r.range(0, TAU), r = Math.abs(D.r.range(-1, 1) * D.r.range(0, 1)) * c[2]; u = c[0] + Math.cos(t) * r; v = c[1] + Math.sin(t) * r; }
    if (u * u + v * v > .85) continue;
    const p = bed.at(u * bed.RX, 0, v * bed.RZ);
    teeth.push({ x: p[0], y: p[1], a: -Math.PI / 2 + D.r.range(-.6, .6) + u * .5, s: size * D.r.range(.55, 1.2), len: D.r.range(.8, 1.2), w: D.r.range(1, 1.3), ramp: pickRamp(D) });
  }
  teeth.sort((a, b) => a.y - b.y);
  for (const t of teeth) drawTooth(D, t, t.ramp);
}
const pickRamp = D => D.pal.ramp2 && D.r.chance(.45) ? D.pal.ramp2 : D.pal.ramp;
function socket(D, bed, base, r) {
  const p = bed.at(base[0], base[1], base[2]);
  const e = circlePts(p[0], p[1] + 1, r * 1.3, r * 1.3 * Math.sin(bed.pitch) + 2, 20);
  fillPoly(D.col, e, mix(D.matrix.ramp[0], SOOT, .3), .55);
  strokePoly(D, e.slice(0, 11), D.style.inner, .7, false);
}
// Two convex solids grown through each other. Each face is cut by the other solid's planes and only
// the pieces outside it are kept, so the corners that poke through draw correctly and the cut
// lines become the seams where the crystals meet.
function twinSolid(a, b, V, fit) {
  const world = inst => {
    const T = inst.T || [0, 0, 0];
    const W = inst.geo.verts.map(p => { const w = mulMV(inst.M, p); return [w[0] + T[0], w[1] + T[1], w[2] + T[2]]; });
    return inst.geo.faces.map(f => ({ f, poly: f.i.map(k => W[k]), n: mulMV(inst.M, f.n) }));
  };
  const clip3 = (poly, n, p0, keepOut) => {
    const out = [], s = p => dot3(n, [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]]) * (keepOut ? 1 : -1);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], sp = s(p), sq = s(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
    }
    return out;
  };
  const outside = (poly, planes) => {
    const pieces = []; let rest = poly;
    for (const pl of planes) {
      const o = clip3(rest, pl.n, pl.p0, true); if (o.length >= 3) pieces.push(o);
      rest = clip3(rest, pl.n, pl.p0, false); if (rest.length < 3) break;
    }
    return pieces;
  };
  const FA = world(a), FB = world(b);
  const planes = F => F.map(x => ({ n: x.n, p0: x.poly[0] }));
  const proj = p => { const v = mulMV(V, p); return [fit.ox + v[0] * fit.s, fit.oy - v[1] * fit.s, v[2]]; };
  const faces = [], P = [];
  for (const [F, other] of [[FA, planes(FB)], [FB, planes(FA)]]) for (const x of F) for (const piece of outside(x.poly, other)) {
    const pts = piece.map(proj); P.push(...pts);
    faces.push({ ...x.f, nv: mulMV(V, x.n), pts, z: pts.reduce((s, p) => s + p[2], 0) / pts.length });
  }
  return { P, faces, hull: hull2(P), z: P.reduce((s, p) => s + p[2], 0) / P.length };
}
// items: { geo, M, T, ramp, sock, r } or { twin: [instA, instB], T, ramp, sock, r }
function drawCrystals(D, bed, items) {
  const depthOf = it => {
    const g = it.twin ? it.twin[0].geo : it.geo, M = it.twin ? it.twin[0].M : it.M;
    const c = g.verts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / g.verts.length);
    const w = mulMV(M, c); return mulMV(bed.V, [w[0] + it.T[0], w[1] + it.T[1], w[2] + it.T[2]])[2];
  };
  items.sort((a, b) => depthOf(a) - depthOf(b));
  for (const it of items) {
    let pr, geo;
    if (it.twin) {
      pr = twinSolid(it.twin[0], it.twin[1], bed.V, bed.fit); geo = it.twin[0].geo;
    } else { pr = projectSolid(it, bed.V, bed.fit); geo = it.geo; }
    if (it.sock) socket(D, bed, it.T, it.r);
    drawSolid(D, pr, geo, { clear: D.pal.clear, ramp: it.ramp, contact: true });
  }
}
// A round tuft of radiating needles (Sowerby's "sunburst"), sitting on the rock: a ball of fine
// engraved needles, flattened where it rests, with larger blades lying on its surface.
function sunburstDome(D, G, C, R, ramp) {
  const N = 150, out = [], floor = C[1] + R * .55;
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, k = i % 2 ? G.range(.97, 1.12) : G.range(.78, .9);
    const y = C[1] + Math.sin(a) * R * k;
    out.push([C[0] + Math.cos(a) * R * k, y > floor ? floor + (y - floor) * .25 : y]);
  }
  beginObject(D, out);
  wash(D, out, ramp[2]);
  const c = D.col; c.save(); c.filter = `blur(${7 * D.S * D.k}px)`;
  crescent(c, out, -R * .2, -R * .24, ramp[1], .7); crescent(c, out, R * .16, R * .18, ramp[3], .65); c.restore();
  const shadeOf = a => clamp(.5 + Math.cos(a) * .5 + Math.sin(a) * .7);
  // fine needles engraved into the mass, denser on the shaded side
  const ink = D.ink; ink.save(); ink.beginPath(); trace(ink, out); ink.clip(); ink.strokeStyle = rgb(D.inkCol); ink.lineWidth = .45;
  for (let i = 0; i < 520; i++) {
    const a = D.r.range(0, TAU), r0 = R * D.r.range(.02, .5), r1 = R * D.r.range(.75, 1.1);
    ink.globalAlpha = .12 + .5 * shadeOf(a);
    ink.beginPath(); ink.moveTo(C[0] + Math.cos(a) * r0, C[1] + Math.sin(a) * r0); ink.lineTo(C[0] + Math.cos(a) * r1, C[1] + Math.sin(a) * r1); ink.stroke();
  }
  ink.restore();
  // larger blades on the surface, farthest-back first
  const blades = [];
  for (let k = G.int(45, 75); k > 0; k--) blades.push({ a: G.range(0, TAU), L: R * G.range(.45, 1.05), w: G.range(3, 9), r0: R * G.range(0, .25), z: G.next() });
  blades.sort((p, q) => p.z - q.z);
  clipBoth(D, out);
  for (const b of blades) {
    const dx = Math.cos(b.a), dy = Math.sin(b.a), px = -dy, py = dx;
    const base = [C[0] + dx * b.r0, C[1] + dy * b.r0], tip = [C[0] + dx * b.L, C[1] + dy * b.L];
    const mid = [base[0] + dx * b.w * .4, base[1] + dy * b.w * .4];
    const b1 = [base[0] + px * b.w / 2, base[1] + py * b.w / 2], b2 = [base[0] - px * b.w / 2, base[1] - py * b.w / 2];
    const litA = px * -.55 + py * -.8 > 0, A = [b1, mid, tip], B = [mid, b2, tip], dk = shadeOf(b.a);
    fillPoly(D.col, litA ? A : B, mix(ramp[3], ramp[1], dk * .5), .9); fillPoly(D.col, litA ? B : A, mix(ramp[1], ramp[0], dk * .6), .9);
    strokePoly(D, [b1, tip, b2], D.style.inner, .55 + dk * .35, false);
  }
  restoreBoth(D);
  strokePoly(D, out, .5, .5);
}

// ================================================================ specimen kinds
const BOX = { x: 160, y: 150, w: 680, h: 820 };

const KINDS = {
  crystal: {
    label: 'Single crystal', de: 'Krystall', en: ['crystallized', 'a single crystal', 'a terminated crystal'],
    make(G, GN, D) {
      const habit = G.weighted({ prism: 4, column: 2, double: 1.4, octahedron: 1, cube: 1, tabular: 1 });
      const geo = crystalGeo(G, habit);
      let M;
      if (habit === 'cube') M = chain(rotZ(G.range(-.15, .15)), rotX(G.range(.35, .6)), rotY(G.range(.3, 1.2)));
      else if (habit === 'octahedron') M = chain(rotX(G.range(.2, .5)), rotY(G.range(.2, 1.3)), rotZ(G.range(-.3, .3)));
      else if (habit === 'tabular') M = chain(rotZ(G.range(-.5, .5)), rotX(G.range(.4, .9)), rotY(G.range(0, TAU)));
      else M = chain(rotZ(G.range(-.45, .45)), rotX(G.range(.15, .45)), rotY(G.range(0, TAU)));
      const inst = { geo, M }, V = rotX(0);
      const tall = habit === 'column' || habit === 'prism';
      // many plate specimens keep a piece of the rock they were broken from
      const onMatrix = habit !== 'double' && G.chance(.45), tex = G.pick(['stipple', 'granular', 'pitted', 'speckled']);
      const box0 = tall ? BOX : { x: 230, y: 250, w: 540, h: 620 };
      const box = onMatrix ? { ...box0, h: box0.h - (tall ? 150 : 90) } : box0;
      const fit = fitBox([inst], V, box);
      const phantom = G.chance(.3), needles = G.chance(.25) ? G.int(10, 40) : 0;
      const maxY = Math.max(...geo.verts.map(p => p[1])), minY = Math.min(...geo.verts.map(p => p[1]));
      const zone = D.pal.ramp2 ? lerp(minY, maxY, D.r.range(.3, .6)) : null;
      const pr = projectSolid(inst, V, fit), opts = { clear: D.pal.clear, phantom, needles, ramp2: D.pal.ramp2, zone };
      if (onMatrix && (habit === 'cube' || habit === 'octahedron')) {
        // sitting on a chip of rock
        const bb = bbox(pr.P), rx = bb.w * G.range(.75, 1), ry = rx * G.range(.35, .5);
        drawRockTop(D, blob(G, GN, bb.cx + G.range(-.1, .1) * bb.w, bb.y1 + ry * .1, rx, ry, { rough: .3, chips: G.int(2, 4) }), D.matrix.ramp, tex);
        drawSolid(D, pr, geo, { ...opts, contact: true });
      } else {
        drawSolid(D, pr, geo, opts);
        if (onMatrix) {
          // broken off with its base still in the rock
          const low = pr.P.filter((p, i) => geo.verts[i][1] < minY + (maxY - minY) * .12), bb = bbox(low);
          const rx = Math.max(bb.w * G.range(.7, 1), 70), ry = rx * G.range(.55, .75);
          drawRockTop(D, blob(G, GN, bb.cx, bb.cy + ry * .25, rx, ry, { rough: .32, chips: G.int(2, 4) }), D.matrix.ramp, tex);
        }
      }
      const forms = { prism: 'Terminated prism', column: 'Striated column', double: 'Doubly terminated', octahedron: 'Octahedron', cube: geo.stri === 'pyrite' ? 'Striated cube' : 'Cube', tabular: 'Tabular crystal' };
      return { form: forms[habit] + (needles && D.pal.clear ? ', needle inclusions' : '') + (onMatrix ? ' on matrix' : ''), onMatrix };
    }
  },
  cluster: {
    label: 'Crystal cluster', de: 'Krystallgruppe', en: ['in a crystal group'],
    make(G, GN, D) {
      const type = G.weighted({ druse: 3, sunburst: 1.4, cubes: 1.6, parallel: 1, sceptre: .9, crust: 1 });
      const bed = clusterBed(G, GN, type === 'sunburst' ? { RX: G.range(220, 280) } : {});
      drawBed(D, bed);
      const items = [];
      // a prism growing from `base` along `main`, leaning outward a little near the rim
      const grow = (habit, len, base, main, spread, spin) => {
        const geo = sizedCrystal(G, habit, len);
        const dir = norm3([main[0] + base[0] / bed.RX * .45 + G.range(-spread, spread), main[1], main[2] + base[2] / bed.RZ * .3 + G.range(-spread, spread)]);
        const M = mulMM(alignY(dir), rotY(spin ?? G.range(0, TAU)));
        const it = { geo, M, T: base, ramp: pickRamp(D), sock: true, r: geoSpan(geo).r, dir };
        items.push(it); return it;
      };
      const near = (b, d) => { const a = G.range(0, TAU), k = G.range(d[0], d[1]); return bed.inside([b[0] + Math.cos(a) * bed.RX * k, 0, b[2] + Math.sin(a) * bed.RZ * k]); };
      let form, sub;
      if (type === 'druse' || type === 'crust') {
        crust(D, bed, type === 'crust' ? D.r.int(160, 240) : D.r.int(90, 150), type === 'crust' ? D.r.range(15, 22) : D.r.range(10, 14), { even: true });
        const main = norm3([G.range(-.3, .3), 1, G.range(-.1, .2)]);
        const hero = [G.range(-.15, .15) * bed.RX, 0, G.range(-.2, .05) * bed.RZ];
        if (type === 'druse') {
          grow('prism', G.range(320, 420), hero, main, .08);
          for (let i = G.int(2, 4); i > 0; i--) grow('prism', G.range(150, 250), near(hero, [.2, .5]), main, .25);
          for (let i = G.int(12, 24); i > 0; i--) grow('prism', G.range(45, 120), bed.spot(.88), main, .4);
          form = 'Druse on matrix';
        } else {
          for (let i = G.int(1, 3); i > 0; i--) grow('prism', G.range(140, 230), near(hero, [0, .45]), main, .3);
          for (let i = G.int(3, 8); i > 0; i--) grow('prism', G.range(40, 80), bed.spot(.85), main, .45);
          form = 'Crystal crust';
        }
      } else if (type === 'parallel') {
        crust(D, bed, D.r.int(20, 40), D.r.range(7, 11));
        const n = G.int(4, 9), habit = G.pick(['prism', 'column']), peak = G.int(0, n - 1), Lmax = G.range(300, 400);
        const main = norm3([G.range(-.25, .25), 1, G.range(-.08, .08)]), spin = G.range(0, TAU), rowA = G.range(-.4, .4);
        const geos = [...Array(n)].map((_, i) => sizedCrystal(G, habit, Lmax * (1 - .12 * Math.abs(i - peak)) * G.range(.9, 1.05)));
        const rs = geos.map(g => geoSpan(g).r), total = rs.reduce((a, r) => a + r * 1.7, 0);
        let x = -total / 2;
        geos.forEach((geo, i) => {
          x += rs[i] * .85;
          const base = bed.inside([x * Math.cos(rowA), 0, x * Math.sin(rowA) + G.range(-8, 8)], .85);
          const dir = norm3([main[0] + G.range(-.04, .04), 1, main[2] + G.range(-.04, .04)]);
          items.push({ geo, M: mulMM(alignY(dir), rotY(spin + G.range(-.08, .08))), T: base, ramp: pickRamp(D), sock: true, r: rs[i] });
          x += rs[i] * .85;
        });
        for (let i = G.int(1, 3); i > 0; i--) grow('prism', G.range(60, 120), [G.range(-.5, .5) * bed.RX, 0, G.range(.35, .6) * bed.RZ], main, .3);
        form = 'Parallel growth';
      } else if (type === 'sceptre') {
        // A sceptre is an ordinary prism (the stem) with a wider crystal capping its top. The head shares the
        // stem's axis and facet directions, and its lower rim overhangs the stem as a flat collar.
        crust(D, bed, D.r.int(30, 60), D.r.range(8, 12));
        const main = norm3([G.range(-.3, .3), 1, G.range(-.1, .15)]), ns = G.chance(.7) ? 1 : 2;
        for (let k = 0; k < ns; k++) {
          const f = k ? G.range(.6, .75) : 1, base = k ? near([0, 0, 0], [.3, .5]) : [G.range(-.15, .15) * bed.RX, 0, G.range(-.15, .05) * bed.RZ];
          const a0 = G.range(0, TAU / 6), rz = G.range(.8, 1);
          const stemLen = G.range(170, 240) * f, stemR = stemLen / G.range(4, 6);
          const stemGeo = crystalGeo(G, 'prism', { n: 6, a0, rz, aj: 0, base: 'flat', term: 'flat', h: 1 });
          stemGeo.verts = stemGeo.verts.map(p => [p[0] * stemR, p[1] * stemLen, p[2] * stemR]);
          for (const fc of stemGeo.faces) fc.ly *= stemLen;
          const headR = stemR * G.range(1.35, 1.9);
          const head = scaleGeo(crystalGeo(G, 'prism', { n: 6, a0, rz, aj: 0, base: 'flat', h: G.range(1, 1.8) }), headR);
          const dir = norm3([main[0] + base[0] / bed.RX * .45 + G.range(-.15, .15), main[1], main[2] + base[2] / bed.RZ * .3 + G.range(-.1, .1)]);
          const M = mulMM(alignY(dir), rotY(G.range(0, TAU)));
          const ramp = pickRamp(D), headRamp = D.pal.ramp2 ? (ramp === D.pal.ramp ? D.pal.ramp2 : D.pal.ramp) : ramp;
          items.push({ geo: stemGeo, M, T: base, ramp, sock: true, r: stemR });
          const at = stemLen - headR * G.range(.4, .8);
          items.push({ geo: head, M, T: [base[0] + dir[0] * at, dir[1] * at, base[2] + dir[2] * at], ramp: headRamp, sock: false, r: headR });
        }
        for (let i = G.int(2, 4); i > 0; i--) grow('prism', G.range(110, 180), bed.spot(.7), main, .3);
        for (let i = G.int(4, 9); i > 0; i--) grow('prism', G.range(45, 100), bed.spot(.85), main, .4);
        form = 'Sceptre quartz';
      } else if (type === 'cubes') {
        sub = G.weighted({ stack: 2, twin: 1, scatter: 1.2 });
        if (D.r.chance(.5)) crust(D, bed, D.r.int(15, 35), D.r.range(7, 10));
        const spin = G.range(0, TAU), R0 = rotY(spin);
        const place = (geo, M, T, sock) => items.push({ geo, M, T, ramp: pickRamp(D), sock, r: geoSpan(geo).r });
        if (sub === 'stack') {
          const E = G.range(200, 260), hero = [G.range(-.1, .1) * bed.RX, 0, G.range(-.15, .05) * bed.RZ];
          const M0 = mulMM(R0, rotZ(G.range(-.06, .06)));
          place(cubeOf(G, E), M0, hero, true);
          for (let i = G.int(1, 3); i > 0; i--) {
            const e = E * G.range(.28, .5), lim = (E - e) / 2, w = mulMV(R0, [G.range(-lim, lim), E, G.range(-lim, lim)]);
            place(cubeOf(G, e), M0, [hero[0] + w[0], w[1], hero[2] + w[2]], false);
          }
          for (let i = G.int(2, 4); i > 0; i--) {
            const e = E * G.range(.35, .6), ax = G.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), along = (E + e) / 2 * G.range(.8, 1), lat = G.range(-(E - e) / 2, (E - e) / 2);
            const w = mulMV(R0, [ax[0] * along + ax[1] * lat, 0, ax[1] * along + ax[0] * lat]);
            place(cubeOf(G, e), M0, bed.inside([hero[0] + w[0], 0, hero[2] + w[2]], .9), true);
          }
          form = 'Stepped cubes';
        } else if (sub === 'twin') {
          const E = G.range(220, 280), MA = mulMM(R0, rotX(G.range(-.12, .12))), MB = mulMM(MA, rotAxis([1, 1, 1], Math.PI / 3));
          const T = [G.range(-.1, .1) * bed.RX, E * .55, G.range(-.15, .05) * bed.RZ];
          const gA = centerGeo(cubeOf(G, E)), gB = centerGeo(cubeOf(G, E));
          items.push({ twin: [{ geo: gA, M: MA, T }, { geo: gB, M: MB, T }], T, ramp: pickRamp(D), sock: false, r: E * .8 });
          form = 'Penetration twin';
        } else {
          const habit = G.pick(['cube', 'octahedron']), hero = [G.range(-.15, .15) * bed.RX, 0, G.range(-.15, .05) * bed.RZ];
          const one = (e, base) => {
            const geo = habit === 'cube' ? cubeOf(G, e) : centerGeo(scaleGeo(crystalGeo(G, 'octahedron'), e / 2.7));
            const M = habit === 'cube' ? chain(rotY(G.range(0, TAU)), rotX(G.range(-.25, .25)), rotZ(G.range(-.25, .25))) : chain(rotX(G.range(-.8, .8)), rotY(G.range(0, TAU)), rotZ(G.range(-.6, .6)));
            place(geo, M, habit === 'cube' ? base : [base[0], e * .35, base[2]], true);
          };
          one(G.range(180, 230), hero);
          for (let i = G.int(2, 3); i > 0; i--) one(G.range(90, 140), near(hero, [.3, .55]));
          for (let i = G.int(4, 9); i > 0; i--) one(G.range(35, 70), bed.spot(.85));
          form = habit === 'cube' ? 'Scattered cubes' : 'Scattered octahedra';
        }
        for (let i = sub === 'scatter' ? 0 : G.int(3, 6); i > 0; i--) place(cubeOf(G, G.range(22, 50)), chain(rotY(G.range(0, TAU)), rotX(G.range(-.2, .2))), bed.spot(.85, .45), true);
      } else if (type === 'sunburst') {
        crust(D, bed, D.r.int(20, 40), D.r.range(7, 10));
        const base = [G.range(-.15, .15) * bed.RX, 0, G.range(-.2, .05) * bed.RZ], C = bed.at(base[0], 0, base[2]), R = Math.min(G.range(200, 265), bed.RX * .8);
        const c = D.col; c.save(); c.filter = `blur(${10 * D.S * D.k}px)`; fillPoly(c, circlePts(C[0] + 10, C[1] + 8, R * .8, R * .2, 30), SOOT, .4); c.restore();
        sunburstDome(D, G, [C[0], C[1] - R * .5], R, pickRamp(D));
        form = 'Radiating sunburst';
      }
      drawCrystals(D, bed, items);
      return { form, type, sub };
    }
  },
  agate: {
    label: 'Banded section', de: 'Achat', en: ['a polished section', 'banded, cut and polished', 'a sliced nodule'],
    make(G, GN, D) {
      // the core decides how much room the banding gets, so pick it first
      const coreType = G.weighted({ druzy: 3, solid: 1.6, hollow: 1, cloud: 1.1, waterline: 1.6 });
      const core = { druzy: G.range(.35, .6), hollow: G.range(.4, .6), waterline: G.range(.38, .58), cloud: G.range(.3, .5), solid: G.range(.08, .28) }[coreType];
      const cx = 500, cy = 540, R = G.range(250, 330), asp = G.range(.65, 1.2), N = 160, k = G.range(0, 50), rough = G.range(.2, .45);
      const radii = [], angs = [];
      for (let i = 0; i < N; i++) { const a = i / N * TAU; angs.push(a); radii.push(1 + rough * (GN.fbm(Math.cos(a) * 1.1 + k, Math.sin(a) * 1.1 + k, 3) - .5) * 1.6); }
      const ringPts = (f, j, wv, zig, zf, ph) => angs.map((a, i) => {
        const w = (GN.fbm(Math.cos(a) * 2 + j * .13, Math.sin(a) * 2 + j * .13, 3) - .5) * wv * (1 - f);
        const z = zig ? zig * Math.abs(((a * zf / TAU + ph) % 1) - .5) * 2 * (1 - f) : 0;
        const r = R * radii[i] * Math.max(.02, f + w - z);
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * asp];
      });
      const outline = ringPts(1, 0, 0, 0, 1, 0);
      const t = [G.range(6, 14), G.range(12, 24)];
      extrude(D, outline, t, D.matrix.ramp[1]);
      beginObject(D, outline);
      const rind = G.range(.04, .09), zig = G.chance(.4) ? G.range(.06, .13) : 0, zf = G.int(5, 10), ph = G.range(0, 1), wv = G.range(.1, .26);
      wash(D, outline, D.matrix.ramp[2]);
      const shadeAt = rockShading(D, outline, D.matrix.ramp);
      stipple(D, outline, 2200 * D.style.stipple, { r: .7, a: .6, mask: (x, y) => .3 + .5 * shadeAt(x, y) });
      // bands: runs of fine lines alternate with broad pale translucent zones
      const nb = G.int(8, 22), widths = [...Array(nb)].map(() => G.pick([.3, .4, .6, 1, 1, 1.5, 2, 2, 4]));
      const wsum = widths.reduce((a, b) => a + b, 0);
      const pale = mix(mix(D.pal.ramp[3], D.paper, .5), WHITE, .2);
      const colorOf = (key, j = 0) => key === 'paper' ? mix(D.paper, WHITE, .4) : key === 'pale' ? pale : key === 'accent' ? D.pal.accent : (D.pal.ramp2 && j % 2 ? D.pal.ramp2 : D.pal.ramp)[key];
      let cum = 0, f = 1 - rind;
      for (let j = 0; j < nb; j++) {
        const wj = widths[j], broad = wj >= 4;
        const key = broad ? 'pale' : wj <= .4 ? G.pick(['paper', 0, 'paper']) : G.pick([0, 1, 1, 2, 2, 3, 'accent']);
        const pts = ringPts(f, j, wv, zig, zf, ph);
        wash(D, pts, colorOf(key, j), 1, { edge: D.style.edge * .5 });
        strokePoly(D, pts, .45, D.style.bandLine);
        const fNext = 1 - rind - (cum + wj / wsum * (1 - rind - core));
        if (broad) for (let m = 1, mm = G.int(3, 7); m <= mm; m++) strokePoly(D, ringPts(lerp(f, fNext, m / (mm + 1)), j + m * .02, wv, zig, zf, ph), .35, .28);
        cum += wj / wsum * (1 - rind - core); f = fNext;
      }
      const corePts = ringPts(f, nb, wv, zig, zf, ph), area = bbox(corePts), cc = [area.cx, area.cy];
      if (coreType === 'solid') { wash(D, corePts, colorOf(G.pick([0, 1, 2]))); strokePoly(D, corePts, .5, .5); }
      else if (coreType === 'druzy' || coreType === 'hollow' || coreType === 'waterline') {
        const hollow = coreType === 'hollow';
        wash(D, corePts, hollow ? D.pal.ramp[0] : D.pal.ramp[3]);
        if (hollow) { const inner = scaleAbout(corePts, cc, .6); wash(D, inner, mix(D.pal.ramp[0], SOOT, .3)); hatch(D, inner, .8, 2.6, { a: .6, w: .6 }); }
        druzyTeeth(D, corePts, cc, D.pal.ramp, { size: Math.sqrt(area.w * area.h) * (hollow ? .1 : .13), rows: hollow ? 2 : 4 });
        if (coreType === 'waterline') {
          // onyx: layers settled flat in the bottom of the cavity, their top surface dead level
          const level = lerp(area.y1, area.y0, G.range(.3, .6)), nl = G.int(5, 12);
          clipBoth(D, corePts);
          let y = area.y1 + 4;
          const hs = [...Array(nl)].map(() => G.range(.5, 2)), hsum = hs.reduce((a, b) => a + b, 0);
          for (let i = 0; i < nl; i++) {
            const h = (area.y1 + 4 - level) * hs[i] / hsum, y0 = y - h;
            const band = [[area.x0 - 5, y], [area.x1 + 5, y], [area.x1 + 5, y0], [area.x0 - 5, y0]];
            wash(D, band, i % 2 ? pale : colorOf(G.pick([0, 1, 2]), i), 1, { edge: 0, wob: .3 });
            strokePoly(D, [[area.x0 - 5, y0], [area.x1 + 5, y0]], .45, .6, false);
            y = y0;
          }
          restoreBoth(D);
        }
        strokePoly(D, corePts, .7, .7);
      } else {
        wash(D, corePts, mix(D.paper, WHITE, .5));
        clipBoth(D, corePts);
        for (let i = G.int(5, 12); i > 0; i--) {
          const x = area.x0 + G.next() * area.w, y = area.y0 + G.next() * area.h, r = G.range(12, 40);
          const p = blob(G, GN, x, y, r, r * G.range(.7, 1.1), { rough: .6, n: 40 });
          wash(D, p, D.pal.ramp[G.int(0, 1)]); strokePoly(D, p, .5, .55);
        }
        restoreBoth(D);
      }
      inkLine(D, outline, D.style.outline || .5, true, D.style.outline ? 1 : .5);
      const forms = { druzy: 'Geode section with druzy core', solid: 'Banded section', hollow: 'Hollow nodule', cloud: 'Cloud agate', waterline: 'Onyx with water-line layers' };
      return { form: forms[coreType] + (zig ? ', fortification banding' : ''), core: coreType, zig: !!zig };
    }
  },
  slab: {
    label: 'Polished slab', de: 'Marmor', en: ['a polished slab'],
    make(G, GN, D) {
      const pattern = G.pick(['porphyry', 'granite', 'marble', 'breccia', 'fossil', 'banded']);
      const w = G.range(460, 680), h = G.range(340, 540), cx = 490, cy = 540;
      const cs = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(p => [cx + p[0] + G.range(-14, 14), cy + p[1] + G.range(-14, 14)]);
      let pts = [];
      for (let i = 0; i < 4; i++) {
        const a = cs[i], b = cs[(i + 1) % 4], m = 14, chip = G.chance(.3);
        for (let j = 0; j < m; j++) {
          const t = j / m; let p = lp(a, b, t);
          const nn = [(b[1] - a[1]), -(b[0] - a[0])], L = Math.hypot(nn[0], nn[1]);
          const off = (GN.n2(i * 7 + t * 5, 2.3) - .5) * 8 - (chip && t > .35 && t < .65 ? G.range(0, 10) : 0);
          p = [p[0] + nn[0] / L * off, p[1] + nn[1] / L * off];
          if (j === 0 && G.chance(.25)) { pts.push(lp(p, lp(a, cs[(i + 3) % 4], .5), .06)); pts.push(lp(p, b, .06)); continue; }
          pts.push(p);
        }
      }
      const R = D.pal.ramp, acc = D.pal.accent, paperish = mix(D.paper, WHITE, .5);
      const groundKey = { porphyry: 0, granite: 3, marble: 2, breccia: 3, fossil: 0, banded: 2 }[pattern];
      const ground = groundKey === 3 ? mix(R[3], paperish, .4) : R[groundKey];
      extrude(D, pts, [G.range(10, 16), G.range(14, 24)], mix(ground, SOOT, .35));
      beginObject(D, pts);
      wash(D, pts, ground);
      const b = bbox(pts), c = D.col;
      clipBoth(D, pts);
      if (pattern === 'porphyry') {
        // fine speckled groundmass, then phenocrysts: a few large, many small, with tapered ends
        stipple(D, pts, b.w * b.h / 14, { ctx: c, erase: true, r: .9, a: .35 });
        stipple(D, pts, b.w * b.h / 30, { ctx: c, color: mix(ground, SOOT, .4), r: .9, a: .5 });
        const n = G.int(120, 260), flow = G.range(0, Math.PI);
        for (let i = 0; i < n; i++) {
          const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h, L = 3 + 34 * Math.pow(G.next(), 3), W = L * G.range(.28, .5), a = flow + G.range(-.7, .7);
          const ca = Math.cos(a), sa = Math.sin(a);
          const q = [[-L, 0], [-L * .72, -W], [L * .72, -W], [L, 0], [L * .72, W], [-L * .72, W]].map(([u, v]) => [x + u * ca - v * sa, y + u * sa + v * ca]);
          const col = G.chance(.78) ? paperish : acc;
          fillPoly(c, q, col, .92);
          if (L > 12) {
            strokePoly(D, q, .45, .6);
            // twin line down the length of the larger crystals
            strokePoly(D, [[x - L * .8 * ca, y - L * .8 * sa], [x + L * .8 * ca, y + L * .8 * sa]], .35, .45, false);
            fillPoly(c, q.slice(0, 4), mix(col, SOOT, .15), .25);
          }
        }
      } else if (pattern === 'granite') {
        // interlocking grains that cover the whole face: feldspar, glassy quartz, black mica
        const quartz = mix(mix(D.paper, [150, 150, 150], .35), R[3], .2), mica = mix(R[0], SOOT, .6);
        const felds = [R[2], acc, mix(R[2], acc, .5), R[1]];
        const step = G.range(11, 16), kk = G.range(0, 30);
        for (let y = b.y0 - step; y < b.y1 + step; y += step * .8) for (let x = b.x0 - step; x < b.x1 + step; x += step * .8) {
          const gx = x + G.range(-.5, .5) * step, gy = y + G.range(-.5, .5) * step, v = GN.fbm(gx * .012 + kk, gy * .012, 3);
          const roll = G.next(), col = roll < .5 ? felds[(v * 7 | 0) % felds.length] : roll < .82 ? quartz : mica;
          const r = step * (col === mica ? G.range(.3, .55) : G.range(.55, .85)), m = G.int(5, 7);
          const q = [...Array(m)].map((_, j) => { const a = j / m * TAU + G.range(-.35, .35), rr = r * G.range(.7, 1.15); return [gx + Math.cos(a) * rr, gy + Math.sin(a) * rr]; });
          fillPoly(c, q, col, .92);
          if (col === quartz && G.chance(.3)) strokePoly(D, q, .35, .35);
        }
      } else if (pattern === 'marble') {
        const kk = G.range(0, 30);
        for (let i = 0; i < 380; i++) {
          const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h, v = GN.fbm(x * .008 + kk, y * .008, 4);
          if (v < .5) continue;
          c.globalAlpha = .12 + .4 * (v - .5); c.fillStyle = rgb(v > .6 ? R[0] : R[1]);
          c.beginPath(); c.ellipse(x, y, G.range(8, 30), G.range(6, 20), G.range(0, TAU), 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
        const veins = G.int(3, 7);
        const walk = (x, y, a, wd, depth) => {
          const line = [[x, y]];
          for (let s = 0; s < 80 && wd > .3; s++) {
            a += G.range(-.3, .3); x += Math.cos(a) * 7; y += Math.sin(a) * 7; line.push([x, y]); wd *= .992;
            if (depth < 2 && G.chance(.04)) walk(x, y, a + G.range(-1.2, 1.2), wd * .6, depth + 1);
          }
          c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = .85; c.lineWidth = wd * 2;
          c.beginPath(); c.moveTo(line[0][0], line[0][1]); for (const p of line) c.lineTo(p[0], p[1]); c.stroke(); c.restore();
          strokePoly(D, shift(line, wd, 0), .45, .5, false);
        };
        for (let i = 0; i < veins; i++) walk(b.x0 + G.next() * b.w, b.y0 + G.next() * b.h, G.range(0, TAU), G.range(1.5, 4.5), 0);
      } else if (pattern === 'breccia') {
        const n = G.int(28, 70);
        for (let i = 0; i < n; i++) {
          const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h, r = G.range(12, 55), m = G.int(4, 7);
          const q = [...Array(m)].map((_, j) => { const a = j / m * TAU + G.range(-.3, .3), rr = r * G.range(.6, 1); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; });
          wash(D, q, (G.chance(.5) && D.pal.ramp2 ? D.pal.ramp2 : R)[G.int(0, 2)]); strokePoly(D, q, .5, .7);
        }
      } else if (pattern === 'fossil') {
        const n = G.int(4, 10);
        for (let i = 0; i < n; i++) {
          const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h, r = G.range(18, 60), turns = G.range(2.2, 3.6), dir = G.chance(.5) ? 1 : -1, a0 = G.range(0, TAU);
          const spiral = [];
          for (let s = 0; s <= 120; s++) { const t = s / 120, a = a0 + dir * t * turns * TAU, rr = r * Math.pow(t, 1.4); spiral.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
          const disc = circlePts(x, y, r * 1.02, r * 1.02, 40);
          wash(D, disc, R[2]); crescent(c, disc, -r * .2, -r * .2, R[1], .6);
          strokePoly(D, spiral, .8, .9, false); inkLine(D, disc, .7, true, .8);
          for (let s = 30; s < 120; s += 6) { const p = spiral[s], q = spiral[Math.max(0, s - 22)]; strokePoly(D, [p, lp(p, q, .35)], .4, .5, false); }
        }
        for (let i = 0; i < G.int(10, 30); i++) {
          const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h, r = G.range(6, 16), a = G.range(0, TAU);
          const arc = [...Array(12)].map((_, j) => { const t = a + j / 11 * Math.PI; return [x + Math.cos(t) * r, y + Math.sin(t) * r * .6]; });
          wash(D, arc, R[3]); strokePoly(D, arc, .5, .7);
        }
      } else if (pattern === 'banded') {
        const nb = G.int(12, 30), amp = G.range(8, 30), fq = G.range(.004, .012), kk = G.range(0, 40), ang = G.range(-.35, .35);
        let y = b.y0 - 40, bandIx = 0; const keys = [0, 1, 2, 3, 'accent'];
        while (y < b.y1 + 40) {
          const hgt = G.pick([4, 8, 14, 22, 30]), key = G.pick(keys);
          const top = [], bot = [];
          for (let x = b.x0 - 40; x <= b.x1 + 40; x += 10) {
            const off = (GN.fbm(x * fq + kk, y * .004, 3) - .5) * amp * 2 + (x - cx) * Math.tan(ang);
            top.push([x, y + off]); bot.unshift([x, y + hgt + off + (GN.n2(x * .02, y) - .5) * 4]);
          }
          const band = top.concat(bot);
          const BR = D.pal.ramp2 && (bandIx++ % 2) ? D.pal.ramp2 : R;
          wash(D, band, key === 'accent' ? acc : BR[key], 1, { edge: D.style.edge * .4 });
          strokePoly(D, top, .4, D.style.bandLine, false);
          y += hgt;
        }
      }
      // polish: a soft band of reflected light across the cut face
      { const sx = b.x0 + b.w * G.range(.35, .75), sw = G.range(50, 110), lean = b.h * G.range(.4, .7); c.save(); c.globalCompositeOperation = "destination-out"; c.filter = `blur(${16 * D.S * D.k}px)`; c.globalAlpha = .2; c.beginPath(); trace(c, [[sx, b.y0 - 40], [sx + sw, b.y0 - 40], [sx + sw - lean, b.y1 + 40], [sx - lean, b.y1 + 40]]); c.fill(); c.restore(); }
      restoreBoth(D);
      const shadeAt = (x, y) => clamp(.3 + .4 * ((x - b.cx) / b.w + (y - b.cy) / b.h));
      stipple(D, pts, b.w * b.h / 80 * D.style.stipple, { mask: shadeAt, r: .6, a: .45 });
      inkLine(D, pts, D.style.outline || .5, true, D.style.outline ? 1 : .5);
      const forms = { porphyry: 'Porphyry', granite: 'Granite', marble: 'Veined marble', breccia: 'Breccia', fossil: 'Shell limestone', banded: 'Banded jasper' };
      return { form: forms[pattern], pattern };
    }
  },
  matrix: {
    label: 'Crystals on matrix', de: 'auf Muttergestein', en: ['in crystals upon the matrix', 'crystals lining a cavity'],
    make(G, GN, D) {
      const cx = 500, cy = 590, rx = G.range(310, 370), ry = rx * G.range(.55, .8);
      const pts = blob(G, GN, cx, cy, rx, ry, { rough: .3, chips: G.int(2, 5) });
      drawRockTop(D, pts, D.matrix.ramp, G.pick(['stipple', 'granular', 'pitted', 'speckled', 'veined']));
      const b = bbox(pts);
      const vug = G.chance(.6);
      let spots = [];
      if (vug) {
        const vx = cx + G.range(-.2, .2) * rx, vy = cy - G.range(0, .2) * ry, vrx = rx * G.range(.35, .55), vry = vrx * G.range(.45, .7);
        const v = blob(G, GN, vx, vy, vrx, vry, { rough: .35, n: 60 });
        wash(D, v, mix(D.matrix.ramp[0], SOOT, .3));
        crescent(D.col, v, 0, -vry * .35, D.matrix.ramp[1], .6);
        hatch(D, v, .9, 2.6, { a: .5, w: .5 });
        druzyTeeth(D, v, [vx, vy], D.pal.ramp, { size: Math.sqrt(vrx * vry) * .28, rows: 2 });
        inkLine(D, v, (D.style.outline || .6) * .8, true, .9);
        for (let i = 0; i < 40 && spots.length < 9; i++) { const x = vx + G.range(-1, 1) * vrx * .7, y = vy + G.range(-.6, 1) * vry * .6; if (inPoly(v, x, y)) spots.push([x, y]); }
      }
      for (let i = 0; i < 200 && spots.length < (vug ? 20 : 16); i++) { const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h * .7; if (inPoly(pts, x, y) && inPoly(pts, x, y - 40)) spots.push([x, y]); }
      const habit = G.pick(['cube', 'octahedron', 'prism', 'tabular', 'double']);
      const V = rotX(.2), crystals = [];
      // One hero crystal near the middle of the rock, then medium and small ones grouped around it.
      const heroAt = [cx, cy - ry * .15], d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      spots.sort((p, q) => d2(p, heroAt) - d2(q, heroAt));
      const hero = spots[0];
      spots = [hero, ...spots.slice(1).filter(p => d2(p, hero) > 90 * 90).sort((p, q) => d2(p, hero) - d2(q, hero))];
      const nC = Math.min(spots.length, G.int(3, 6));
      // unit size → plate units per habit, so a hero prism and a hero cube read at similar weight
      const unit = { prism: .3, double: .45, tabular: .6, cube: .6, octahedron: .6 }[habit];
      for (let i = 0; i < nC; i++) {
        const sz = i === 0 ? G.range(150, 190) : i < 3 ? G.range(80, 115) : G.range(40, 65);
        const geo = crystalGeo(G, habit, { size: 1 });
        let M;
        if (habit === 'cube') M = chain(rotX(G.range(.15, .45)), rotY(G.range(0, TAU)), rotZ(G.range(-.25, .25)));
        else if (habit === 'octahedron') M = chain(rotX(G.range(-.8, .8)), rotY(G.range(0, TAU)), rotZ(G.range(-.6, .6)));
        else M = mulMM(alignY([G.range(-.6, .6), 1, G.range(-.4, .6)]), rotY(G.range(0, TAU)));
        crystals.push({ inst: { geo, M, T: [0, 0, 0] }, fit: { s: sz * unit, ox: spots[i][0], oy: spots[i][1] } });
      }
      crystals.sort((a, b) => a.fit.oy - b.fit.oy);
      for (const cr of crystals) {
        // a dark socket where the crystal grows out of the rock
        const sock = circlePts(cr.fit.ox, cr.fit.oy + 2, cr.fit.s * 1.1, cr.fit.s * .42, 20);
        fillPoly(D.col, sock, mix(D.matrix.ramp[0], SOOT, .3), .6);
        strokePoly(D, sock.slice(0, 11), D.style.inner, .7, false);
        drawSolid(D, projectSolid(cr.inst, V, cr.fit), cr.inst.geo, { clear: D.pal.clear, ramp: pickRamp(D), contact: true });
      }
      const forms = { cube: 'Cubes', octahedron: 'Octahedra', prism: 'Prisms', tabular: 'Tabular crystals', double: 'Doubly terminated crystals' };
      return { form: forms[habit] + (vug ? ' in a druzy cavity' : ' on matrix'), vug };
    }
  },
  rock: {
    label: 'Rough specimen', de: '', en: ['in the rough'],
    // A rough specimen is interesting for one feature: coloured veins, strata, a polished window,
    // a druzy patch. Usually the rock is neutral and the palette colour is the feature.
    make(G, GN, D) {
      const cx = 500, cy = 560, rx = G.range(250, 320), ry = rx * G.range(.6, .9);
      const pts = blob(G, GN, cx, cy, rx, ry, { rough: G.range(.25, .45), chips: G.int(3, 6), fine: .04 });
      const rk = G.weighted({ veins: 2, strata: 1.6, flecked: 1.1, window: 1.4, patch: 1.4, massive: 1, pitted: .8 });
      const P = D.pal.ramp, P2 = D.pal.ramp2 || P, Mx = D.matrix.ramp, usePal = rk === 'massive' || rk === 'pitted';
      drawRockTop(D, pts, usePal ? P : Mx, rk === 'pitted' ? 'pitted' : G.pick(['stipple', 'granular']), 1.1);
      const b = bbox(pts), c = D.col, Rr = Math.max(b.w, b.h) / 2;
      // re-apply the rock's form shading over a feature so it sits on the curved surface
      const reshade = (k = 1) => {
        c.save(); c.filter = `blur(${7 * D.S * D.k}px)`; crescent(c, pts, -b.w * .12, -b.h * .14, SOOT, .26 * k); crescent(c, pts, b.w * .1, b.h * .12, WHITE, .18 * k); c.restore();
        stipple(D, pts, b.w * b.h / 40, { mask: (x, y) => Math.pow(clamp(.45 + .65 * ((x - b.cx) * .55 + (y - b.cy) * .8) / Rr), 2), r: .7, a: .6 });
      };
      const offsetLine = (line, d) => line.map((p, i) => { const a = line[Math.max(0, i - 1)], q = line[Math.min(line.length - 1, i + 1)], dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy) || 1; return [p[0] - dy / L * d, p[1] + dx / L * d]; });
      if (rk === 'veins') {
        clipBoth(D, pts);
        const walk = (x, y, a, w, depth) => {
          const line = [[x, y]];
          for (let s = 0; s < 70 && w > 1; s++) {
            a += G.range(-.35, .35); x += Math.cos(a) * 7; y += Math.sin(a) * 7; line.push([x, y]); w *= .99;
            if (depth < 2 && G.chance(.05)) walk(x, y, a + G.sign() * G.range(.5, 1.2), w * .55, depth + 1);
          }
          c.save(); c.lineJoin = c.lineCap = 'round'; c.beginPath(); c.moveTo(line[0][0], line[0][1]); for (const p of line) c.lineTo(p[0], p[1]);
          c.strokeStyle = rgb(mix(P[0], P[1], .5)); c.lineWidth = w * 1.15; c.stroke(); c.strokeStyle = rgb(P[1]); c.lineWidth = w * .6; c.stroke(); c.strokeStyle = rgb(P[2]); c.lineWidth = w * .2; c.stroke(); c.restore();
          strokePoly(D, offsetLine(line, w * .55), .45, .7, false); strokePoly(D, offsetLine(line, -w * .55), .45, .7, false);
        };
        for (let i = G.int(3, 6); i > 0; i--) walk(b.x0 + G.next() * b.w, b.y0 + G.next() * b.h, G.range(0, TAU), G.range(8, 17), 0);
        reshade(); restoreBoth(D);
      } else if (rk === 'strata' || rk === 'massive') {
        // strata: near-parallel layers across the rock; massive: curved bands around a hidden centre
        clipBoth(D, pts);
        const keys = rk === 'strata' ? [P[0], P[1], P[2], Mx[1], Mx[2], P2[1], D.pal.accent] : [P[0], P[1], P[2], P[3], P2[1]];
        const kk = G.range(0, 40), amp = G.range(10, 30);
        if (rk === 'strata') {
          const a = G.range(-.5, .5), dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
          for (let s = -Rr * 1.2; s < Rr * 1.2;) {
            const h = G.pick([5, 8, 12, 18, 26, 34]), col = G.pick(keys);
            const line = off => { const o = []; for (let u = -Rr * 1.3; u <= Rr * 1.3; u += 12) { const w = (GN.fbm(u * .006 + kk, off * .004, 3) - .5) * amp * 2; o.push([b.cx + dx * u + nx * (off + w), b.cy + dy * u + ny * (off + w)]); } return o; };
            const top = line(s), bot = line(s + h).reverse();
            wash(D, top.concat(bot), col, 1, { edge: D.style.edge * .4, wob: .5 }); strokePoly(D, top, .4, .45, false);
            s += h;
          }
        } else {
          const fx = b.cx + G.sign() * b.w * G.range(.6, 1), fy = b.cy + G.range(-.6, .6) * b.h;
          for (let r = Rr * 2.4; r > 10; r -= G.pick([6, 10, 16, 24])) {
            const ring = circlePts(fx, fy, r, r, 90).map((p, i) => { const w = (GN.fbm(i * .07 + kk, r * .01, 3) - .5) * amp; return [p[0] + (p[0] - fx) / r * w, p[1] + (p[1] - fy) / r * w]; });
            wash(D, ring, G.pick(keys), 1, { edge: D.style.edge * .4, wob: .5 }); strokePoly(D, ring, .4, .4);
          }
        }
        reshade(1.3); restoreBoth(D);
      } else if (rk === 'flecked') {
        // coloured grains gathered in clusters, like Sowerby's blue-flecked sandstone
        clipBoth(D, pts);
        const kk = G.range(0, 40);
        for (let i = 0, n = G.int(160, 260); i < n; i++) {
          const x = b.x0 + G.next() * b.w, y = b.y0 + G.next() * b.h;
          if (GN.fbm(x * .01 + kk, y * .01, 3) < .42 || !inPoly(pts, x, y)) continue;
          const r = G.chance(.25) ? G.range(11, 22) : G.range(4, 10);
          const q = circlePts(x, y, r, r * G.range(.55, 1), 9, G.range(0, TAU)).map(p => [p[0] + G.range(-.3, .3) * r, p[1] + G.range(-.3, .3) * r]);
          wash(D, q, G.pick([P[1], P[1], P[2], P2[1], P[0]]), 1, { edge: D.style.edge, wob: .4 });
          if (r > 6) { strokePoly(D, q, .45, .7); if (G.chance(.5)) eraseLine(D, lp(q[5], q[7], .2), lp(q[5], q[7], .8), 1.2, .5); }
        }
        reshade(.8); restoreBoth(D);
      } else if (rk === 'window') {
        // one face cut and polished, showing banding inside the nodule
        const wx = b.cx + G.range(-.15, .15) * b.w, wy = b.cy + G.range(-.05, .15) * b.h, rw = b.w * G.range(.24, .34), rh = rw * G.range(.7, 1);
        const win = blob(G, GN, wx, wy, rw, rh, { rough: .15, n: 80 });
        clipBoth(D, pts);
        wash(D, win, mix(D.paper, WHITE, .3));
        clipBoth(D, win);
        const keys = [P[0], P[1], P[2], P[3], mix(P[3], D.paper, .5), P2[1]];
        // bands shrink toward an off-centre focus and wander, so it reads as agate, not a target
        const fx = wx + G.range(-.3, .3) * rw, fy = wy + G.range(-.3, .3) * rh;
        for (let k = 1.05; k > .1; k -= G.range(.04, .12)) {
          const ring = win.map((p, i) => { const w = 1 + (GN.fbm(i * .08 + k * 3, k * 5, 3) - .5) * .35; return [fx + (p[0] - fx) * k * w, fy + (p[1] - fy) * k * w]; });
          wash(D, ring, G.pick(keys), 1, { edge: D.style.edge * .4, wob: .8 }); strokePoly(D, ring, .4, .5);
        }
        c.save(); c.globalCompositeOperation = 'destination-out'; c.filter = `blur(${10 * D.S * D.k}px)`; c.globalAlpha = .25;
        c.beginPath(); c.ellipse(wx - rw * .3, wy - rh * .35, rw * .4, rh * .15, -.5, 0, TAU); c.fill(); c.restore();
        restoreBoth(D);
        crescent(c, win, 0, -6, SOOT, .35);
        inkLine(D, win, .9, true, .9);
        restoreBoth(D);
      } else if (rk === 'patch') {
        // a sparkling patch of small crystals on the upper face
        const px = b.cx + G.range(-.2, .2) * b.w, py = b.y0 + b.h * G.range(.25, .4), pw = b.w * G.range(.28, .42), ph = b.h * G.range(.16, .26);
        const patch = blob(G, GN, px, py, pw, ph, { rough: .5, n: 60 });
        clipBoth(D, pts);
        wash(D, patch, P[1]);
        const teeth = [], pb = bbox(patch), n = Math.round(pb.w * pb.h / 90);
        for (let i = 0; i < n * 2 && teeth.length < n; i++) { const x = pb.x0 + D.r.next() * pb.w, y = pb.y0 + D.r.next() * pb.h; if (inPoly(patch, x, y)) teeth.push({ x, y, a: -Math.PI / 2 + D.r.range(-.6, .6), s: D.r.range(9, 16), len: D.r.range(.9, 1.3), w: D.r.range(1, 1.2) }); }
        teeth.sort((p, q) => p.y - q.y);
        for (const t of teeth) drawTooth(D, t, D.r.chance(.3) ? P2 : P);
        restoreBoth(D);
      }
      const forms = { veins: 'Veined matrix', strata: 'Stratified stone', flecked: 'Flecked matrix', window: 'Nodule with a polished window', patch: 'Druzy patch on matrix', massive: 'Massive, banded', pitted: 'Pitted ore' };
      return { form: forms[rk], usePal, rk };
    }
  },
  gem: {
    label: 'Cut stone', de: 'geschliffen', en: ['cut and polished', 'a faceted stone'],
    make(G, GN, D) {
      const cut = G.weighted({ brilliant: 2, step: 1.2, cabochon: 1, rose: 1.2, pear: 1, marquise: .8, cushion: 1, table: .7, baguette: .6, briolette: .8 });
      let cx = 500, cy = 560, rx = G.range(170, 250), ry = rx * (cut === 'step' ? G.range(.65, 1.3) : G.range(.75, 1.25)), form;
      const R = D.pal.ramp, facets = [];
      const shadeN = (ax, ay, slope, j) => { const nn = norm3([ax * slope, -ay * slope, 1]); return clamp(.45 + .6 * dot3(nn, LIGHT) + j); };
      const jit = () => G.range(-.25, .25) + (G.chance(.12) ? -.45 : 0);
      // outlines for brilliant-style faceting: map a point on the unit circle to the stone's girdle
      const OUTLINES = {
        brilliant: (c, s) => [c, s],
        cushion: (c, s) => [Math.sign(c) * Math.abs(c) ** .55, Math.sign(s) * Math.abs(s) ** .55],
        pear: (c, s) => s < 0 ? [c * Math.sqrt(1 + s), s * 1.3] : [c, s],
        marquise: (c, s) => [c * Math.sqrt(1 - Math.abs(s)), s],
      };
      if (OUTLINES[cut]) {
        if (cut === 'pear') { rx = G.range(150, 200); ry = rx * G.range(1.05, 1.25); cy += ry * .15; }
        if (cut === 'marquise') { rx = G.range(120, 170); ry = rx * G.range(1.7, 2.1); }
        if (cut === 'cushion') ry = rx * G.range(.85, 1.15);
        const shape = OUTLINES[cut], n = 8, a0 = -Math.PI / 2 + (cut === 'pear' || cut === 'marquise' ? 0 : G.range(-.2, .2));
        const E = (a, f) => { const [u, v] = shape(Math.cos(a), Math.sin(a)); return [cx + u * rx * f, cy + v * ry * f]; };
        const Tt = [], M = [], Gg = [], Gm = [];
        for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n, am = a + TAU / n / 2; Tt.push(E(a, .52)); M.push(E(am, .8)); Gg.push(E(a, 1)); Gm.push(E(am, 1)); }
        facets.push({ pts: Tt, t: clamp(.72 + G.range(-.12, .12)) });
        for (let i = 0; i < n; i++) {
          const a = a0 + i * TAU / n, am = a + TAU / n / 2;
          facets.push({ pts: [Tt[i], Tt[(i + 1) % n], M[i]], t: shadeN(Math.cos(am), Math.sin(am), .35, jit()) });
          facets.push({ pts: [Tt[i], M[(i + n - 1) % n], Gg[i], M[i]], t: shadeN(Math.cos(a), Math.sin(a), .6, jit()) });
          facets.push({ pts: [M[i], Gg[i], Gm[i]], t: shadeN(Math.cos(am - .15), Math.sin(am - .15), .9, jit()) });
          facets.push({ pts: [M[i], Gm[i], Gg[(i + 1) % n]], t: shadeN(Math.cos(am + .15), Math.sin(am + .15), .9, jit()) });
        }
        form = cut === 'brilliant' ? (Math.abs(ry / rx - 1) < .1 ? 'Round brilliant' : 'Oval brilliant') : { cushion: 'Cushion cut', pear: 'Pear cut', marquise: 'Marquise cut' }[cut];
      } else if (cut === 'step' || cut === 'table' || cut === 'baguette') {
        let w = rx, h = ry;
        if (cut === 'baguette') { h = G.range(200, 260); w = h * G.range(.32, .45); }
        if (cut === 'table') { w = rx * .9; h = w * G.range(.8, 1.2); }
        const k = (cut === 'baguette' ? G.range(.03, .06) : G.range(.12, .22)) * Math.min(w, h);
        const oct = s => { const W = w * s, H = h * s, K = k * s; return [[-W + K, -H], [W - K, -H], [W, -H + K], [W, H - K], [W - K, H], [-W + K, H], [-W, H - K], [-W, -H + K]].map(p => [cx + p[0], cy + p[1]]); };
        const rings = ({ step: [1, .84, .7, .58], table: [1, .7], baguette: [1, .8, .62] }[cut]).map(oct);
        const nrm = [[0, -1], [.7, -.7], [1, 0], [.7, .7], [0, 1], [-.7, .7], [-1, 0], [-.7, -.7]];
        for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 8; i++) {
          const a = rings[r], b = rings[r + 1];
          facets.push({ pts: [a[i], a[(i + 1) % 8], b[(i + 1) % 8], b[i]], t: shadeN(nrm[i][0], nrm[i][1], .9 - r * .22, G.range(-.12, .12)) });
        }
        facets.push({ pts: rings[rings.length - 1], t: .75 + G.range(-.1, .1) });
        form = { step: 'Step cut', table: 'Table cut', baguette: 'Baguette' }[cut];
      } else if (cut === 'rose') {
        // Dutch rose: a low dome of triangles rising to a point, flat underneath
        ry = rx * G.range(.9, 1.1);
        const n = 6, a0 = -Math.PI / 2 + G.range(-.3, .3), E = (a, f) => [cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f];
        const C = [cx, cy], A = [], B = [], Gg = [];
        for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; A.push(E(a, .5)); Gg.push(E(a, 1)); B.push(E(a + TAU / n / 2, 1)); }
        for (let i = 0; i < n; i++) {
          const a = a0 + i * TAU / n, am = a + TAU / n / 2, i2 = (i + 1) % n;
          facets.push({ pts: [C, A[i], A[i2]], t: shadeN(Math.cos(am), Math.sin(am), .35, jit()) });
          facets.push({ pts: [A[i], A[i2], B[i]], t: shadeN(Math.cos(am), Math.sin(am), .75, jit()) });
          facets.push({ pts: [A[i], Gg[i], B[i]], t: shadeN(Math.cos(a + .2), Math.sin(a + .2), 1.1, jit()) });
          facets.push({ pts: [A[i2], B[i], Gg[i2]], t: shadeN(Math.cos(a + TAU / n - .2), Math.sin(a + TAU / n - .2), 1.1, jit()) });
        }
        form = 'Rose cut';
      } else if (cut === 'briolette') {
        // side view of a faceted teardrop, point at the top, widest low down
        const H = G.range(400, 480), W = H * G.range(.34, .42), top = cy - H * .55, rows = 7, cols = 6;
        const rad = v => Math.sin(Math.PI * Math.pow(v, 1.6));
        const P = (u, v) => [cx + Math.sin(u) * rad(v) * W, top + v * H];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const v0 = j / rows, v1 = (j + 1) / rows, u0 = -Math.PI / 2 + i * Math.PI / cols, u1 = u0 + Math.PI / cols, um = (u0 + u1) / 2;
          const ny = (rad(v1) - rad(v0)) / (v1 - v0) * W / H;
          const nn = norm3([Math.sin(um), ny, Math.cos(um)]);
          facets.push({ pts: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], t: clamp(.45 + .6 * dot3(nn, LIGHT) + G.range(-.15, .15)) });
        }
        form = 'Briolette';
      }
      if (cut === 'cabochon') {
        const prof = G.chance(.6); if (prof) { rx *= .78; ry *= .78; cy -= 95; }
        const p = circlePts(cx, cy, rx, ry, 64);
        extrude(D, p, [0, 12], R[0]);
        beginObject(D, p); wash(D, p, R[1]);
        const c = D.col; c.save(); c.filter = `blur(${(6 + D.style.soft) * D.S}px)`;
        crescent(c, p, -rx * .25, -ry * .3, R[0], .8); crescent(c, p, rx * .35, ry * .4, R[2], .7); c.restore();
        c.save(); c.globalCompositeOperation = 'destination-out'; c.filter = `blur(${8 * D.S}px)`; c.globalAlpha = .7;
        c.beginPath(); c.ellipse(cx - rx * .3, cy - ry * .38, rx * .22, ry * .12, -.5, 0, TAU); c.fill(); c.restore();
        if (G.chance(.4)) { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + .2; eraseLine(D, [cx - rx * .3 + Math.cos(a) * rx * .5, cy - ry * .38 + Math.sin(a) * ry * .5], [cx - rx * .3 - Math.cos(a) * rx * .5, cy - ry * .38 - Math.sin(a) * ry * .5], 2, .45); } }
        const sh = (x, y) => clamp(.4 + .7 * ((x - cx) * .55 / rx + (y - cy) * .8 / ry));
        stipple(D, p, rx * ry * .6 * D.style.stipple, { mask: (x, y) => Math.pow(sh(x, y), 2), r: .7 });
        inkLine(D, p, D.style.outline || .6, true, D.style.outline ? 1 : .5);
        if (prof) gemProfile(D, G, 'cabochon', cx - rx, cx + rx, cy + ry + 70, R);
        return { form: 'Cabochon', cut, prof };
      }
      // stones sparkle: stretch the facet contrast, with a few facets dropping to near black
      for (const f of facets) { f.t = clamp((f.t - .5) * 1.5 + .52); if (cut !== 'briolette' && G.chance(.1)) f.t = G.range(.02, .15); }
      const prof = cut !== 'briolette' && G.chance(.6);
      if (prof) for (const f of facets) f.pts = f.pts.map(p => [500 + (p[0] - 500) * .78, 560 + (p[1] - 560) * .78 - 95]);
      const outline = hull2(facets.flatMap(f => f.pts));
      beginObject(D, outline);
      const bc = centroid(outline), split = D.r.range(-.8, .8);
      for (const f of facets) {
        const c0 = centroid(f.pts), FR = D.pal.ramp2 && (c0[0] - bc[0]) * Math.cos(split) + (c0[1] - bc[1]) * Math.sin(split) > 0 ? D.pal.ramp2 : R;
        let col = ramp4(FR, f.t); if (f.t > .9) col = mix(col, FR[3], .6); wash(D, f.pts, col, 1, { wob: .3, edge: D.style.edge * .5 });
      }
      for (const f of facets) {
        strokePoly(D, f.pts, D.style.inner, .9);
        if (f.t < .4 && D.style.hatch > .8) { const q = f.pts.length === 4 ? f.pts : [f.pts[0], f.pts[1], f.pts[2], f.pts[2]]; faceLines(D, q, 'across', Math.floor(dist(q[1], q[2]) / 5 * D.style.hatch), { w: .4, a: .45, partial: .2 }); }
        if (f.t > .78) { const c0 = centroid(f.pts); eraseLine(D, lp(f.pts[0], c0, .25), lp(f.pts[1], c0, .25), 1.4, .6); }
      }
      inkLine(D, outline, D.style.outline || .6, true, D.style.outline ? 1 : .5);
      if (prof) { const ob = bbox(outline); gemProfile(D, G, cut, ob.x0, ob.x1, ob.y1 + 70, R); }
      return { form, cut, prof };
    }
  },
};
const KIND_BAG = { crystal: 3, cluster: 3, agate: 2, slab: 1.6, matrix: 2, rock: 1.4, gem: 1 };

// ================================================================ names
// Invented names are built from a colour root that matches the palette, so a blue stone gets a
// blue-sounding name, and the cut stone shares its root with the mineral it was cut from.
const COLOR_ROOTS = {
  indigo: ['Cyan', 'Lazul', 'Indol', 'Caerul'], azurite: ['Azur', 'Cyan', 'Caerul', 'Lazur'],
  turquoise: ['Turcos', 'Callain', 'Thalass', 'Aqu'], malachite: ['Chlor', 'Smarag', 'Prasin', 'Virid'],
  serpentine: ['Ophi', 'Olivin', 'Batrach', 'Prasin'], sulphur: ['Theion', 'Sulph', 'Flav', 'Citrin'],
  citrine: ['Xanth', 'Chrys', 'Citr', 'Mell'], carnelian: ['Carnel', 'Sard', 'Croc', 'Aurant'],
  haematite: ['Haem', 'Sider', 'Ferr', 'Rubig'], garnet: ['Pyr', 'Carbun', 'Almand', 'Sanguin'],
  rose: ['Rhod', 'Ros', 'Erythr', 'Carne'], amethyst: ['Ianth', 'Viol', 'Porphyr', 'Ion'],
  smoky: ['Umbr', 'Fum', 'Morion', 'Cairn'], crystal: ['Leuc', 'Hyal', 'Nival', 'Cryst'],
  jet: ['Melan', 'Gagat', 'Nigr', 'Anthrac'], fluorite: ['Flor', 'Chlorophan', 'Ianth', 'Viol'],
  azmal: ['Chessyl', 'Cupr', 'Azur', 'Lazur'], watermelon: ['Rubell', 'Elb', 'Verdel', 'Rhod'],
};
const COLOR_WORDS = {
  indigo: ['Blue', 'Indigo'], azurite: ['Azure', 'Cobalt'], turquoise: ['Turquoise', 'Sky-blue'], malachite: ['Green', 'Emerald'],
  serpentine: ['Olive', 'Serpentine'], sulphur: ['Sulphur', 'Lemon'], citrine: ['Yellow', 'Honey'], carnelian: ['Orange', 'Carnelian'],
  haematite: ['Red', 'Brick-red'], garnet: ['Blood-red', 'Wine'], rose: ['Rose', 'Pink'], amethyst: ['Violet', 'Purple'],
  smoky: ['Smoky', 'Brown'], crystal: ['White', 'Clear'], jet: ['Black', 'Onyx'],
  fluorite: ['Purple-and-green', 'Banded violet'], azmal: ['Blue-and-green', 'Peacock'], watermelon: ['Watermelon', 'Pink-and-green'],
};
const MIN_SUF = ['ite', 'olite', 'ase', 'ospar', 'oclase', 'elite', 'anite', 'ite'];
const GEM_SUF = ['ire', 'yx', 'el', 'ane', 'ade'];
const CLUSTER_PHRASE = { druse: 'a druse upon the matrix', crust: 'a crust of small crystals', parallel: 'in parallel growth', sceptre: 'in sceptre crystals', sunburst: 'in radiating crystals', stack: 'in stepped cubes', twin: 'a penetration twin', scatter: 'in scattered crystals' };
const GEM_CUT_PHRASE = { brilliant: 'brilliant-cut', step: 'step-cut', cabochon: 'cut en cabochon', rose: 'rose-cut', pear: 'cut as a pear', marquise: 'marquise-cut', cushion: 'cushion-cut', table: 'table-cut', baguette: 'cut as a baguette', briolette: 'cut as a briolette' };
const HOSTS = ['limestone', 'gneiss', 'ironstone', 'sandstone', 'chalk'];
const PLACES = ['Grauberg', 'Kessel Fell', 'Lower Ardith', 'Saint Maur', 'Brennwald', 'Tolvan', 'Holloway', 'Aschenthal', 'Marrow Pike', 'Vennick', 'Oberhall', 'Carrow Bay', 'Siltmoor', 'Eisenach Deep', 'Wendle Scar', 'Hartzell', 'Pellin Gill', 'Rothmere'];
function joinRoot(root, suf) {
  const rv = /[aeiouy]$/i.test(root), sv = /^[aeiouy]/i.test(suf);
  if (rv && sv) return root + suf.slice(1);
  if (!rv && !sv) return root + 'o' + suf;
  return root + suf;
}
function roman(n) { const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, t] of m) while (n >= v) { s += t; n -= v; } return s; }
function nameSpecimen(seed, kind, palKey, matIdx, info) {
  const r = new Rand(hash(seed + '|name'));
  const roots = COLOR_ROOTS[palKey], root = roots[r.int(0, roots.length - 1)];
  const mineral = joinRoot(root, r.pick(MIN_SUF)), gem = joinRoot(root, r.pick(GEM_SUF));
  const adj = r.pick(COLOR_WORDS[palKey]), place = r.pick(PLACES), host = HOSTS[matIdx];
  const nm = { mineral, gem, place, host, fig: r.int(1, 36), plate: r.int(3, 64) };
  const q = list => list[r.int(0, list.length - 1)];
  let title, line1, line2 = `From ${place}.`;
  switch (kind) {
    case 'crystal':
      title = mineral; line1 = info.onMatrix ? `${mineral}, a crystal upon ${host}.` : `${mineral}, ${q(['crystallized', 'a single crystal', 'a terminated crystal'])}.`; break;
    case 'cluster':
      title = mineral; line1 = `${mineral}, ${CLUSTER_PHRASE[info.sub || info.type]}.`; break;
    case 'matrix':
      title = `${mineral} on ${host}`; line1 = `${mineral}, ${info.vug ? 'lining a cavity in' : 'in crystals upon'} ${host}.`; break;
    case 'rock': {
      const Host = host[0].toUpperCase() + host.slice(1);
      ({ title, line1 } = {
        veins: { title: `${mineral}-bearing ${host}`, line1: `${Host} veined with ${mineral}.` },
        strata: { title: `Banded ${host}`, line1: `${Host} in layers, with ${mineral}.` },
        flecked: { title: `${mineral}-bearing ${host}`, line1: `${Host} flecked with ${mineral}.` },
        window: { title: `${mineral} nodule`, line1: `A nodule of ${mineral}, one face polished.` },
        patch: { title: `${mineral} on ${host}`, line1: `${mineral}, a druzy patch upon ${host}.` },
        massive: { title: mineral, line1: `${mineral}, massive and banded.` },
        pitted: { title: mineral, line1: `${mineral}, a pitted ore.` },
      }[info.rk]);
      break;
    }
    case 'agate': {
      const type = info.zig ? 'Fortification Agate' : { druzy: 'Geode', solid: 'Banded Agate', hollow: 'Agate Nodule', cloud: 'Cloud Agate', waterline: 'Onyx Agate' }[info.core];
      title = `${adj} ${type}`; line1 = `${title}, ${q(['cut and polished', 'sliced and polished', 'a polished section'])}.`; break;
    }
    case 'slab':
      title = `${adj} ${info.form.replace(/\b\w/g, ch => ch.toUpperCase())}`; line1 = `${title}, a polished slab.`; break;
    case 'gem':
      title = gem; line1 = `${gem}, ${GEM_CUT_PHRASE[info.cut]}.`;
      line2 = `The cut stone of ${mineral}, from ${place}.`; break;
  }
  return { ...nm, title, lines: [line1, line2] };
}

// ================================================================ paper and final composition
const TILES = (() => {
  const mk = fn => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const im = x.createImageData(256, 256); const r = new Rand(12345); for (let i = 0; i < im.data.length; i += 4) fn(im.data, i, r); x.putImageData(im, 0, 0); return c; };
  return {
    paper: mk((d, i, r) => { const v = 232 + r.next() * 23; d[i] = v; d[i + 1] = v; d[i + 2] = v - 4; d[i + 3] = 255; }),
    gran: mk((d, i, r) => { const v = r.next(); d[i] = 50; d[i + 1] = 38; d[i + 2] = 26; d[i + 3] = v > .8 ? (v - .8) * 5 * 255 : 0; }),
  };
})();
function drawPaper(o, W, H, S, st, r, fx) {
  o.fillStyle = st.paper; o.fillRect(0, 0, W, H);
  const sm = document.createElement('canvas'); sm.width = 20; sm.height = 25;
  const sx = sm.getContext('2d'), im = sx.createImageData(20, 25), pe = hex(st.paperEdge);
  for (let i = 0; i < im.data.length; i += 4) { const c = mix(WHITE, pe, r.next() * .55); im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; }
  sx.putImageData(im, 0, 0);
  o.save(); o.globalCompositeOperation = 'multiply'; o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.globalAlpha = .22; o.drawImage(sm, 0, 0, W, H);
  const g = o.createRadialGradient(W / 2, H * .45, W * .28, W / 2, H / 2, W * .86);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, st.paperEdge);
  o.globalAlpha = .45; o.fillStyle = g; o.fillRect(0, 0, W, H);
  if (fx.grain) {
    o.globalAlpha = .85; o.fillStyle = o.createPattern(TILES.paper, 'repeat'); o.fillRect(0, 0, W, H);
    o.globalAlpha = 1; o.strokeStyle = 'rgba(120,98,66,.10)'; o.lineWidth = .8 * S;
    for (let i = 0; i < 240; i++) {
      const x = r.next() * W, y = r.next() * H, a = r.range(0, TAU), L = r.range(6, 22) * S;
      o.beginPath(); o.moveTo(x, y); o.quadraticCurveTo(x + Math.cos(a + .6) * L * .5, y + Math.sin(a + .6) * L * .5, x + Math.cos(a) * L, y + Math.sin(a) * L); o.stroke();
    }
  }
  if (fx.foxing) {
    const n = r.int(3, 11);
    for (let i = 0; i < n; i++) {
      const edge = r.chance(.65);
      const x = edge ? (r.chance(.5) ? r.range(.02, .14) : r.range(.86, .98)) * W : r.range(.1, .9) * W, y = r.range(.03, .97) * H, rad = r.range(3, 20) * S;
      const gg = o.createRadialGradient(x, y, 0, x, y, rad);
      gg.addColorStop(0, 'rgba(150,96,45,.30)'); gg.addColorStop(.6, 'rgba(160,110,60,.12)'); gg.addColorStop(1, 'rgba(160,110,60,0)');
      o.globalAlpha = 1; o.fillStyle = gg; o.beginPath(); o.arc(x, y, rad, 0, TAU); o.fill();
      if (r.chance(.5)) { o.fillStyle = 'rgba(110,70,35,.45)'; o.beginPath(); o.arc(x + r.range(-2, 2) * S, y + r.range(-2, 2) * S, r.range(.6, 1.6) * S, 0, TAU); o.fill(); }
    }
  }
  o.restore();
}
function composite(out, D, st, fx, r) {
  const o = out.getContext('2d'), W = out.width, H = out.height, S = D.S;
  o.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.paper !== false) drawPaper(o, W, H, S, st, r, fx); else o.clearRect(0, 0, W, H);
  // watercolour granulation lives only where there is colour
  const c = D.col; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = st.gran;
  c.fillStyle = c.createPattern(TILES.gran, 'repeat'); c.fillRect(0, 0, W, H); c.restore();
  const a = r.range(0, TAU), m = fx.misreg ? st.misreg * S : 0;
  o.save(); o.globalCompositeOperation = 'multiply';
  o.drawImage(D.colC, Math.cos(a) * m, Math.sin(a) * m);
  o.drawImage(D.inkC, 0, 0);
  o.restore();
}
function drawLabels(out, D, nm, fx) {
  const o = out.getContext('2d'), S = D.S;
  o.save(); o.globalCompositeOperation = 'multiply'; o.fillStyle = rgb(D.inkCol, .92); o.textBaseline = 'alphabetic';
  o.font = `italic ${30 * S}px "IM Fell English", Georgia, serif`; o.textAlign = 'right';
  o.fillText(String(nm.plate * 7 + 3), 930 * S, 88 * S);
  if (fx.label) {
    const bottom = PLATE_CY + (D.bb.y1 - PLATE_CY) * D.k;
    const y0 = Math.min(Math.max(bottom + 58, 900), 1175);
    o.textAlign = 'center';
    o.font = `italic ${30 * S}px "IM Fell English", Georgia, serif`; o.fillText(nm.lines[0], 500 * S, y0 * S);
    o.font = `italic ${22 * S}px "IM Fell English", Georgia, serif`; o.fillText(nm.lines[1], 500 * S, (y0 + 34) * S);
  }
  o.restore();
}

// ================================================================ render entry point
// P: { seed, kind ('any' or a KINDS key), palette ('any' or a PALETTES key), scale (specimen size, 1 = default), fx }
// Draw one specimen onto fresh colour and ink layers, W × H pixels, without paper or labels.
// Returns the drawer (layers plus D.bb, the specimen's extent in plate units) and what was drawn.
function drawSpecimen(W, H, P) {
  const S = W / 1000, st = STYLE;
  const pick = new Rand(hash(P.seed + '|pick'));
  const kindRoll = pick.weighted(KIND_BAG), palRoll = pick.pick(Object.keys(PALETTES)), matIdx = pick.int(0, MATRIX.length - 1);
  const kind = P.kind && P.kind !== 'any' ? P.kind : kindRoll, palKey = P.palette && P.palette !== 'any' ? P.palette : palRoll;
  const G = new Rand(hash(P.seed + '|geo|' + kind)), GN = makeNoise(hash(P.seed + '|gnoise'));
  const D = makeDrawer(W, H, S, st, hash(P.seed + '|draw|' + kind), P.scale || 1);
  D.pal = preparePalette(PALETTES[palKey], st);
  D.matrix = { ramp: MATRIX[matIdx].ramp.map(c => mix(saturate(hex(c), st.sat), WHITE, st.tint)) };
  const info = KINDS[kind].make(G, GN, D);
  const nm = nameSpecimen(P.seed, kind, palKey, matIdx, info);
  return { D, kind, palKey, info, nm };
}
// A single specimen printed as a plate: paper, specimen, caption.
function renderPlate(canvas, P) {
  const fx = P.fx || { misreg: true, grain: true, foxing: true, label: true };
  const r = drawSpecimen(canvas.width, canvas.height, P);
  composite(canvas, r.D, STYLE, fx, new Rand(hash(P.seed + '|paper')));
  drawLabels(canvas, r.D, r.nm, fx);
  if (fx.frame) drawRuledBorder(canvas.getContext("2d"), canvas.width / 1000, canvas.height / (canvas.width / 1000), hex(STYLE.ink));
  return { kind: r.kind, palKey: r.palKey, info: r.info, nm: r.nm };
}
// A second, graded wash inside a face: clear on the lit side, deeper toward the shadow side.
function faceGradient(D, pts, color, alpha) {
  const b = bbox(pts), c = D.col;
  const g = c.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  g.addColorStop(0, rgb(color, 0)); g.addColorStop(1, rgb(color, alpha));
  c.save(); c.beginPath(); trace(c, pts); c.clip(); c.fillStyle = g; c.fillRect(b.x0 - 2, b.y0 - 2, b.w + 4, b.h + 4); c.restore();
}
// Side view of a cut stone, drawn under its top view as old gem plates do: crown above the girdle,
// pavilion below, facet edges running to the culet.
function gemProfile(D, G, cut, x0, x1, top, R) {
  const W = x1 - x0, cx = (x0 + x1) / 2, polys = [];
  const add = (pts, t) => polys.push({ pts, t: clamp(t + G.range(-.08, .08)) });
  if (cut === 'cabochon') {
    const h = W * G.range(.22, .32), g = top + h, dome = [];
    for (let i = 0; i <= 24; i++) { const a = Math.PI + i / 24 * Math.PI; dome.push([cx + Math.cos(a) * W / 2, g + Math.sin(a) * h]); }
    add(dome, .6); add([[x0, g], [x1, g], [x1, g + W * .04], [x0, g + W * .04]], .3);
  } else if (cut === 'rose') {
    const h = W * G.range(.3, .4), g = top + h;
    const ks = [-.5, -.3, -.1, .1, .3, .5];
    for (let i = 0; i < ks.length - 1; i++) add([[cx + ks[i] * W, g], [cx + ks[i + 1] * W, g], [cx, top]], .8 - i * .12);
    add([[x0, g], [x1, g], [x1, g + W * .03], [x0, g + W * .03]], .35);
  } else {
    const step = cut === 'step' || cut === 'baguette' || cut === 'table';
    const crownH = W * (cut === 'table' ? .1 : .16), g = top + crownH, gt = W * .025, pav = W * (cut === 'table' ? .22 : step ? .36 : .43);
    const tw = W * (step ? .34 : .28), tb = [cx - tw, top], te = [cx + tw, top];
    // crown: table edge down to the girdle in four facets
    const gx = [x0, cx - W * .25, cx + W * .25, x1];
    add([[gx[0], g], [gx[1], g], tb], .85);
    add([[gx[1], g], [gx[2], g], te, tb], .7);
    add([[gx[2], g], [gx[3], g], te], .45);
    add([[x0, g], [x1, g], [x1, g + gt], [x0, g + gt]], .3);
    // pavilion
    const bot = g + gt + pav, keel = step ? W * (cut === 'table' ? .3 : .1) : 0;
    const px = [x0, cx - W * .3, cx - W * .1, cx + W * .1, cx + W * .3, x1];
    for (let i = 0; i < px.length - 1; i++) {
      const b0 = [cx - keel + (i / (px.length - 1)) * keel * 2, bot];
      const b1 = [cx - keel + ((i + 1) / (px.length - 1)) * keel * 2, bot];
      add(keel ? [[px[i], g + gt], [px[i + 1], g + gt], b1, b0] : [[px[i], g + gt], [px[i + 1], g + gt], [cx, bot]], .75 - i * .13);
    }
  }
  const outline = hull2(polys.flatMap(p => p.pts));
  beginObject(D, outline);
  for (const p of polys) wash(D, p.pts, ramp4(R, p.t), 1, { wob: .3, edge: D.style.edge * .5 });
  for (const p of polys) { strokePoly(D, p.pts, D.style.inner, .9); if (p.t > .8) eraseLine(D, lp(p.pts[0], p.pts[1], .2), lp(p.pts[0], p.pts[p.pts.length - 1], .5), 1.3, .5); }
  inkLine(D, outline, D.style.outline || .6, true, D.style.outline ? 1 : .5);
}
// A double ruled border, heavy outside and fine within, as on the posters. u = pixels per plate unit.
function drawRuledBorder(o, u, Hu, ink) {
  o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'multiply'; o.strokeStyle = rgb(ink, .92);
  o.lineWidth = 1.6 * u; o.strokeRect(20 * u, 20 * u, (1000 - 40) * u, (Hu - 40) * u);
  o.lineWidth = .7 * u; o.strokeRect(27 * u, 27 * u, (1000 - 54) * u, (Hu - 54) * u);
  o.restore();
}
