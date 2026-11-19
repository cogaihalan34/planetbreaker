'use strict';
/* render.js — Blazing Blade look: Lyn as the miner, each planet a floating isle of GBA-style terrain tiles,
   Fire Emblem spell sheets for weapon hits. Canvas 2D; all FX records pooled. */
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbStr = (c, a) => a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c, k) => [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const CP = 6;   // pixels per cell in the planet texture

const IMG = {};
function loadImg(k, src) { return new Promise(res => { const im = new Image(); im.onload = () => { IMG[k] = im; res(im); }; im.onerror = () => res(null); im.src = src; }); }
function assetsReady() {
  const jobs = [loadImg('lyn', 'sprites/lyn.png'), loadImg('island', 'sprites/keep_island.png')];
  for (const k in FX_DATA) jobs.push(loadImg('fx_' + k, FX_DATA[k].png));
  const fonts = document.fonts ? document.fonts.load('16px "Phantasia"').catch(() => null) : null;
  return Promise.all([...jobs, fonts]);
}

const RENDER = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, view: { top: 0, bottom: 0 },
  cam: { x: 64, y: 64, s: 6 }, shake: 0, snapCamera: true, t: 0,
  pcv: null, pctx: null, tiles: null, bg: null, specials: [],
  lyn: { anim: 'idle', t: 0, fi: 0, chain: 0, face: 1, lock: 0 },
  init() {
    this.cv = $('game'); this.ctx = this.cv.getContext('2d');
    this.pcv = document.createElement('canvas'); this.pcv.width = this.pcv.height = N * CP;
    this.pctx = this.pcv.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },
  resize() {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    this.w = this.cv.clientWidth; this.h = this.cv.clientHeight;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.bg = null;
    if (typeof UI !== 'undefined' && UI.measure) UI.measure();
  },

  /* ---------- terrain tiles: 6×6 pixel art per material, 4 variants each, built per region palette ---------- */
  buildTiles() {
    const P = PALETTES[R.paletteIdx], turf = hexRgb(P[0]), soil = hexRgb(P[1]), stone = hexRgb(P[2]), ore = hexRgb(P[3]);
    let sd = 99991 + R.paletteIdx * 17;
    const rr = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    const make = (draw) => { const c = document.createElement('canvas'); c.width = c.height = CP; const g = c.getContext('2d'); draw(g); return c; };
    const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = rgbStr(c); g.fillRect(x, y, w, h); };
    const T = { soil: [], stone: [], ore: [], deep: [], boom: [], energy: [], gold: [] };
    for (let v = 0; v < 4; v++) {
      T.soil.push(make(g => { px(g, soil, 0, 0, CP, CP); for (let k = 0; k < 5; k++) px(g, shade(soil, rr() < .5 ? .78 : 1.18), rr() * CP | 0, rr() * CP | 0); }));
      T.stone.push(make(g => { px(g, stone, 0, 0, CP, CP); px(g, shade(stone, .72), 0, CP - 1, CP, 1); px(g, shade(stone, .72), CP - 1, 0, 1, CP); px(g, shade(stone, 1.25), 0, 0, CP - 1, 1); if (rr() < .6) px(g, shade(stone, .82), 1 + (rr() * 3 | 0), 2 + (rr() * 2 | 0), 2, 1); }));
      T.deep.push(make(g => { px(g, shade(stone, .7), 0, 0, CP, CP); px(g, shade(stone, .55), 0, CP - 1, CP, 1); px(g, shade(stone, .55), CP - 1, 0, 1, CP); if (rr() < .7) { px(g, shade(ore, .8), 1 + (rr() * 3 | 0), 1 + (rr() * 3 | 0), 2, 1); } }));
      T.ore.push(make(g => { px(g, shade(stone, .55), 0, 0, CP, CP); px(g, ore, 1, 2, 2, 2); px(g, shade(ore, 1.3), 1, 2, 1, 1); px(g, ore, 3 + (rr() * 2 | 0), 0 + (rr() * 2 | 0), 1, 2); px(g, shade(ore, .7), 3, 4, 2, 1); }));
    }
    T.boom = make(g => { px(g, [70, 18, 12], 0, 0, CP, CP); px(g, [255, 92, 40], 1, 1, 4, 4); px(g, [255, 200, 90], 2, 1, 2, 2); px(g, [150, 30, 20], 1, 4, 4, 1); });
    T.energy = make(g => { px(g, [10, 40, 70], 0, 0, CP, CP); px(g, [60, 200, 255], 2, 0, 2, 6); px(g, [60, 200, 255], 0, 2, 6, 2); px(g, [220, 250, 255], 2, 2, 2, 2); });
    T.gold = make(g => { px(g, [70, 50, 10], 0, 0, CP, CP); px(g, [255, 205, 60], 1, 2, 4, 3); px(g, [255, 245, 170], 1, 2, 2, 1); px(g, [190, 130, 30], 1, 4, 4, 1); px(g, [255, 220, 90], 2, 1, 2, 1); });
    T.turf = turf; T.turfHi = shade(turf, 1.25); T.turfLo = shade(turf, .7); T.rim = shade(soil, .55);
    this.tiles = T;
  },
  planetChanged() {
    this.buildTiles();
    this.bg = null;
    this.pctx.clearRect(0, 0, N * CP, N * CP);
    this.specials = [];
    for (let i = 0; i < NN; i++) { if (R.kind[i]) this.paint(i); if (R.kind[i] > 1) this.specials.push(i); }
    R.dirty.clear();
  },
  paint(i) {
    const g = this.pctx, T = this.tiles, k = R.kind[i], x = i % N, y = (i / N) | 0, X = x * CP, Y = y * CP;
    if (!k) { g.clearRect(X, Y, CP, CP); return; }
    const v = (x * 7 + y * 13) & 3;
    let tile;
    if (k === 2) tile = T.boom; else if (k === 3) tile = T.energy; else if (k === 4) tile = T.gold;
    else { const d = Math.hypot(x + .5 - 64, y + .5 - 64) / (R.radius + .5); tile = d > .68 ? T.soil[v] : d > .42 ? T.stone[v] : d > .2 ? T.deep[v] : T.ore[v]; }   // strata by depth
    g.drawImage(tile, X, Y);
    // exposed faces: grass on top faces, dark lip on the others (reads like an FE map cliff)
    const up = y === 0 || !R.kind[i - N], dn = y === N - 1 || !R.kind[i + N], lf = x === 0 || !R.kind[i - 1], rt = x === N - 1 || !R.kind[i + 1];
    if (k === 1) {
      if (up) { g.fillStyle = rgbStr(T.turf); g.fillRect(X, Y, CP, 2); g.fillStyle = rgbStr(T.turfHi); g.fillRect(X, Y, CP, 1); if (v & 1) { g.fillStyle = rgbStr(T.turfLo); g.fillRect(X + 1 + v, Y + 2, 1, 1); } }
      if (dn) { g.fillStyle = rgbStr(T.rim); g.fillRect(X, Y + CP - 1, CP, 1); }
      if (lf) { g.fillStyle = rgbStr(up ? T.turfLo : T.rim); g.fillRect(X, Y, 1, CP); }
      if (rt) { g.fillStyle = rgbStr(up ? T.turfLo : T.rim); g.fillRect(X + CP - 1, Y, 1, CP); }
    }
    const df = 1 - R.hp[i] / R.max[i];
    if (df > .05) {   // cracks
      g.fillStyle = `rgba(20,10,4,${Math.min(.75, df * .9)})`;
      g.fillRect(X + 1, Y + 2, 3, 1); if (df > .4) g.fillRect(X + 3, Y + 3, 1, 2); if (df > .7) g.fillRect(X + 1, Y + 4, 2, 1);
    }
  },
  flushPlanet() {
    if (!R.dirty.size) return;
    for (const i of R.dirty) this.paint(i);
    R.dirty.clear();
  },

  /* ---------- GBA sky: gradient, pixel clouds, a distant floating keep ---------- */
  buildBg() {
    const c = document.createElement('canvas'), W = c.width = this.cv.width, H = c.height = this.cv.height, g = c.getContext('2d');
    const night = [6, 7].includes(R.paletteIdx);
    const sky = g.createLinearGradient(0, 0, 0, H);
    if (night) { sky.addColorStop(0, '#0b1030'); sky.addColorStop(.6, '#25285a'); sky.addColorStop(1, '#4a3a6a'); }
    else { sky.addColorStop(0, '#3a78d8'); sky.addColorStop(.55, '#78b4f0'); sky.addColorStop(1, '#cfe9ff'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const p = Math.max(2, Math.round(3 * this.dpr));     // chunky pixel size
    let sd = 4242 + R.paletteIdx;
    const rr = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    if (night) for (let k = 0; k < W * H / 3000; k++) { g.fillStyle = `rgba(255,255,255,${.3 + rr() * .6})`; g.fillRect(rr() * W | 0, rr() * H * .7 | 0, p / 2, p / 2); }
    // distant keep
    if (IMG.island) { const iw = W * 1.1, ih = iw * IMG.island.height / IMG.island.width; g.globalAlpha = night ? .35 : .28; g.imageSmoothingEnabled = false; g.drawImage(IMG.island, W * .35, H * .62, iw, ih); g.globalAlpha = 1; }
    // pixel clouds
    for (let k = 0; k < 7; k++) {
      const cx = rr() * W, cy = H * (.08 + rr() * .7), s = (14 + rr() * 22) * p;
      g.fillStyle = night ? 'rgba(160,160,220,.18)' : 'rgba(255,255,255,.75)';
      for (let b = 0; b < 6; b++) { const bx = cx + (b - 3) * s * .45, by = cy + (b % 2 ? -s * .18 : 0), bw = s * (.7 + rr() * .5), bh = s * .32; g.fillRect(Math.round(bx / p) * p, Math.round(by / p) * p, Math.round(bw / p) * p, Math.round(bh / p) * p); }
      g.fillStyle = night ? 'rgba(90,90,150,.18)' : 'rgba(180,210,240,.6)';
      g.fillRect(Math.round((cx - s * 1.2) / p) * p, Math.round((cy + s * .25) / p) * p, Math.round(s * 2.6 / p) * p, p * 2);
    }
    this.bg = c;
  },

  draw(dt) {
    this.t += dt;
    this.flushPlanet();
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, dpr = this.dpr;
    if (!this.bg) this.buildBg();
    const vt = this.view.top * dpr, vb = H - this.view.bottom * dpr, vh = Math.max(80, vb - vt);
    const fit = Math.min(W, vh) / (R.radius * 2 + 14);
    const combat = R.ship.target >= 0 && !R.transition;
    const ts = fit * (combat ? 1.04 : .96);
    const sh = R.ship;
    const tx = combat ? 64 + (sh.x - 64) * .12 : 64, ty = combat ? 64 + (sh.y - 64) * .12 : 64;
    const cam = this.cam;
    if (this.snapCamera) { cam.x = tx; cam.y = ty; cam.s = ts; this.snapCamera = false; }
    const k = Math.min(1, dt * 2.2);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (ts - cam.s) * Math.min(1, dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - .5) * this.shake * 6 * dpr, sy = (Math.random() - .5) * this.shake * 6 * dpr;
    const ox = W / 2 - cam.x * cam.s + sx, oy = vt + vh / 2 - cam.y * cam.s + sy;
    this.ox = ox; this.oy = oy;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(this.bg, 0, 0);
    // isle shadow + planet texture
    const px = ox + 64 * cam.s, py = oy + 64 * cam.s, pr = R.radius * cam.s, left = R.cells ? R.solid / R.cells : 0;
    if (left > 0) { ctx.fillStyle = `rgba(20,30,60,${.18 * left})`; ctx.beginPath(); ctx.ellipse(px, py + pr * 1.12, pr * .9, pr * .14, 0, 0, 7); ctx.fill(); }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.pcv, ox, oy, N * cam.s, N * cam.s);

    ctx.setTransform(cam.s, 0, 0, cam.s, ox, oy);
    // special cells twinkle
    ctx.globalCompositeOperation = 'lighter';
    const pulse = .35 + .3 * Math.sin(this.t * 5);
    for (let n = this.specials.length - 1; n >= 0; n--) {
      const i = this.specials[n], kd = R.kind[i];
      if (kd < 2) { this.specials.splice(n, 1); continue; }
      ctx.fillStyle = kd === 2 ? `rgba(255,110,50,${pulse})` : kd === 3 ? `rgba(60,220,255,${pulse})` : `rgba(255,220,80,${pulse})`;
      ctx.fillRect(i % N - .25, ((i / N) | 0) - .25, 1.5, 1.5);
    }
    FX.drawWorld(ctx, cam.s);
    ctx.globalCompositeOperation = 'source-over';
    this.drawLyn(ctx, dt);
    FX.drawText(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  /* ---------- Lyn: idle / run / sword combo, facing her target ---------- */
  drawLyn(ctx, dt) {
    const L = this.lyn, sh = R.ship, now = performance.now();
    // pick the animation
    const firing = now - (R.lastFire || 0) < 350 && !R.transition;
    const A = LYN.anims;
    let want = L.anim;
    if (L.lock > 0) { L.lock -= dt; }
    else if (firing) { if (!/^attack|dash_attack/.test(L.anim) || L.done) { const ch = ['attack', 'attack_1', 'attack_2', 'attack_3', 'dash_attack']; want = ch[L.chain++ % ch.length]; L.done = false; L.t = 0; } }
    else if (sh.moving || R.transition) want = 'move';
    else want = 'idle';
    if (want !== L.anim) { L.anim = want; L.t = 0; L.done = false; }
    const a = A[L.anim] || A.idle;
    L.t += dt * (ST.adBoost > 1 ? 1.4 : 1);
    let t = L.t, fi = 0, acc = 0;
    const total = a.f.reduce((s, f) => s + (f.d || LYN.dt), 0);
    if (a.loop) t %= total; else if (t >= total) { L.done = true; t = total - .001; }
    for (let k = 0; k < a.f.length; k++) { const d = a.f[k].d || LYN.dt; if (t < acc + d) { fi = k; break; } acc += d; fi = k; }
    const fr = LYN.frames[a.f[fi].id]; if (!fr || !IMG.lyn) return;
    const [x, y, w, h, ax, ay, fs] = fr;
    // face the target (sheet faces left)
    if (sh.target >= 0 && !R.transition) { const tx = sh.target % N + .5; if (Math.abs(tx - sh.x) > .5) L.face = tx > sh.x ? 1 : -1; }
    else if (Math.abs(sh.vx) > 1) L.face = sh.vx > 0 ? 1 : -1;
    const dpr = this.dpr, k = 2.2 * dpr * (fs || 1);
    const bob = Math.sin(this.t * 3) * 3 * dpr;
    const [X0, Y0] = this.toScreen(sh.x, sh.y); const X = X0 * dpr, Y = Y0 * dpr + bob;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // wind under her feet (she flies on the Sacae wind)
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(140,255,190,${.18 + .1 * Math.sin(this.t * 8)})`;
    ctx.beginPath(); ctx.ellipse(X, Y + 2 * dpr, 16 * dpr, 4 * dpr, 0, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(X, Y);
    if (L.face > 0) ctx.scale(-1, 1);       // mirror to face right
    ctx.drawImage(IMG.lyn, x, y, w, h, -ax * k, -(h - ay) * k, w * k, h * k);
    ctx.restore();
    // Sol Blades orbit
    for (const rt of R.weaponsRT) if (rt.blades) for (let b = 0; b < rt.blades; b++) {
      const bx = rt['bx' + b], by = rt['by' + b]; if (bx === undefined) continue;
      const [sx2, sy2] = this.toScreen(bx, by);
      FX.lynFx(ctx, 'nick', sx2 * dpr, sy2 * dpr, this.t * 12 + b, 1.6 * dpr, .95);
    }
  },
  toScreen(x, y) { return [(this.ox + x * this.cam.s) / this.dpr, (this.oy + y * this.cam.s) / this.dpr]; },
  lynSkill(k) { const i = SKILL_KEYS.indexOf(k); this.lyn.anim = 'skill_' + (i % 8); this.lyn.t = 0; this.lyn.lock = .8; },
};

/* ---------------- FX (pooled) ---------------- */
const FX = (() => {
  const live = [], free = [], parts = [], pfree = [], sheets = [], sfree = [], texts = [];
  let popAcc = 0, popX = 0, popY = 0, popT = 0, hitCount = 0;
  const get = () => free.pop() || {};
  const add = o => { live.push(o); return o; };
  function part(x, y, vx, vy, life, col, size) {
    const p = pfree.pop() || {}; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.t = 0; p.col = col; p.size = size;
    if (parts.length > 260) pfree.push(parts.shift());
    parts.push(p);
  }
  function text(x, y, str, col, big, life) {
    if (!big && texts.filter(t => !t.big).length >= CFG.floatMax) return;   // GDD: at most 4 at once
    texts.push({ x, y, str, col, big, t: 0, life: life || (big ? 1.4 : .9) });
  }
  /* a GBA spell sheet played at (x, y) in cell units; size = height in cells */
  function sheet(name, x, y, size, o = {}) {
    const D = FX_DATA[name]; if (!D || !IMG['fx_' + name]) return null;
    if (name === 'hit' && hitCount >= 6) return null;
    const s = sfree.pop() || {};
    s.name = name; s.D = D; s.x = x; s.y = y; s.size = size; s.t = 0; s.loop = o.loop || 0; s.life = o.life || D.n * D.dt; s.rot = o.rot || 0; s.alpha = o.alpha ?? 1; s.speed = o.speed || 1; s.follow = o.follow || null;
    if (name === 'hit') hitCount++;
    sheets.push(s); return s;
  }
  function lynFx(ctx, key, x, y, rot, k, alpha) {   // a frame from Lyn's own sheet (sword arcs) at screen px
    const id = LYN.fx && LYN.fx[key]; const fr = id !== undefined && LYN.frames[id]; if (!fr || !IMG.lyn) return;
    const [fx, fy, w, h] = fr;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
    ctx.drawImage(IMG.lyn, fx, fy, w, h, -w * k / 2, -h * k / 2, w * k, h * k); ctx.restore(); ctx.globalAlpha = 1;
  }
  return {
    lynFx,
    hit(x, y) { if (Math.random() < .55) sheet('hit', x, y, 5, { speed: 1.3 }); },
    bolt(x0, y0, x1, y1, col, cb, style) { const o = get(); Object.assign(o, { k: 'bolt', x0, y0, x1, y1, t: 0, dur: Math.max(.05, Math.hypot(x1 - x0, y1 - y0) / (style === 'arrow' ? 90 : 60)), col, cb, style }); add(o); },
    drill(x, y, a, col, len) { const o = get(); Object.assign(o, { k: 'drill', x, y, a, t: 0, dur: .22, col, len: Math.max(4, len + 2), cb: null }); add(o); },
    star(x, y, arms, len, col, cb) { const o = get(); Object.assign(o, { k: 'star', x, y, arms, len, t: 0, dur: 1, col, cb, tick: 0, ang: rnd(0, 6) }); add(o); sheet('tornado', x, y + len * .2, len * 2.4, { life: 1, loop: 1 }); },
    shell(x0, y0, x1, y1, col, cb) { const o = get(); Object.assign(o, { k: 'shell', x0, y0, x1, y1, t: 0, dur: .45, col, cb }); add(o); },
    ring(x, y, r, col, dur, big) { const o = get(); Object.assign(o, { k: 'ring', x, y, r, t: 0, dur: dur || .3, col, cb: null }); add(o); if (big) sheet('crit', x, y, r * 2.2); },
    blast(x, y, r) { sheet('pillars', x, y - r * .3, r * 2.6, { speed: 1.6 }); },
    nova(x, y, r, col, cb) { const o = get(); Object.assign(o, { k: 'nova', x, y, r, t: 0, dur: .4, col, cb, pr: 0 }); add(o); sheet('ice', x, y, r * 2.2, { speed: 1.4 }); },
    lightning(pts, col, dur, big) { const o = get(); Object.assign(o, { k: 'zap', pts, t: 0, dur, col, cb: null }); add(o); if (big) sheet('bolt', pts[pts.length - 1][0], pts[pts.length - 1][1] - 2, 7, { speed: 1.5 }); },
    shuriken(sh, tx, ty, dist, col, delay, cb) {
      const a = Math.atan2(ty - sh.y, tx - sh.x), L = Math.hypot(tx - sh.x, ty - sh.y) + dist;
      const o = get(); Object.assign(o, { k: 'shur', sh, a, L, t: -delay, dur: .9, col, cb, seen: new Set(), x: sh.x, y: sh.y }); add(o);
    },
    burst(x, y, col, n) { for (let k = 0; k < n; k++) { const a = rnd(0, 6.28), v = rnd(4, 16); part(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(.3, .6), col, rnd(.25, .55)); } },
    debris(x, y, col) { const a = rnd(0, 6.28), v = rnd(3, 9); part(x, y, Math.cos(a) * v, Math.sin(a) * v - 4, rnd(.3, .6), col, rnd(.35, .7)); },
    special(name, x, y) { sheet(name, x, y, name === 'barrier' ? 6 : 7, { speed: 1.3 }); },
    shipPulse() { sheet('aura', R.ship.x, R.ship.y - 1, 9, { speed: 1.2, follow: R.ship }); },
    crPop(i, cr) { popAcc += cr; popX = i % N + .5; popY = ((i / N) | 0) + .5; },
    text(i, str, col) { text(i % N + .5, ((i / N) | 0) - .5, str, col); },
    comboMark(m) { text(R.ship.x, R.ship.y - 8, m + ' COMBO', '#ffe9a8', true, 1); },
    comboCash(n, b) { text(R.ship.x, R.ship.y - 6, `${n} COMBO  +${fmtN(b)} CR`, '#ffd94a', true, 1.6); },
    update(dt) {
      for (let n = live.length - 1; n >= 0; n--) {
        const o = live[n]; o.t += dt;
        if (o.k === 'star') { o.ang += dt * 9; o.tick -= dt; if (o.tick <= 0 && o.t > 0) { o.tick = .1; o.cb(o.x, o.y, o.ang); } }
        else if (o.k === 'nova') { const r = Math.min(1, o.t / o.dur) * o.r; if (r > o.pr) { o.cb(o.pr, r); o.pr = r; } }
        else if (o.k === 'shur' && o.t > 0) {
          const q = o.t / o.dur, d = (q < .5 ? q * 2 : (1 - q) * 2) * o.L;
          o.x = o.sh.x + Math.cos(o.a) * d; o.y = o.sh.y + Math.sin(o.a) * d; o.cb(o.x, o.y, o.seen);
          if (q > .5 && !o.back) { o.back = 1; o.seen.clear(); }
        }
        if (o.t >= o.dur) {
          if ((o.k === 'bolt' || o.k === 'shell') && o.cb) o.cb();
          live.splice(n, 1); o.cb = null; o.pts = null; o.sh = null; o.seen = null; o.back = 0; free.push(o);
        }
      }
      for (let n = sheets.length - 1; n >= 0; n--) {
        const s = sheets[n]; s.t += dt * s.speed;
        if (s.follow) { s.x = s.follow.x; s.y = s.follow.y - 1; }
        if (s.t >= s.life) { sheets.splice(n, 1); if (s.name === 'hit') hitCount--; s.follow = null; sfree.push(s); }
      }
      for (let n = parts.length - 1; n >= 0; n--) { const p = parts[n]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 22 * dt; p.vx *= .94; if (p.t >= p.life) { parts.splice(n, 1); pfree.push(p); } }
      for (let n = texts.length - 1; n >= 0; n--) { const t = texts[n]; t.t += dt; if (t.t >= t.life) texts.splice(n, 1); }
      popT -= dt;
      if (popAcc > 0 && popT <= 0) { popT = .28; text(popX, popY - 1, '+' + fmtN(popAcc) + ' CR', '#ffd94a'); popAcc = 0; }
    },
    drawWorld(ctx, s) {
      const lw = 1 / s, dpr = RENDER.dpr;
      // spell sheets (black background → additive)
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = false;
      for (const sp of sheets) {
        const D = sp.D, im = IMG['fx_' + sp.name];
        let i = Math.floor(sp.t / D.dt); i = sp.loop ? i % D.n : Math.min(D.n - 1, i);
        const c = i % D.cols, r = (i / D.cols) | 0, h = sp.size, w = h * D.w / D.h;
        ctx.globalAlpha = sp.alpha * (sp.loop && sp.t > sp.life - .2 ? (sp.life - sp.t) / .2 : 1);
        ctx.drawImage(im, c * D.w, r * D.h, D.w, D.h, sp.x - w / 2, sp.y - h / 2, w, h);
      }
      ctx.globalAlpha = 1;
      for (const o of live) {
        const q = clamp(o.t / o.dur, 0, 1);
        ctx.strokeStyle = o.col; ctx.fillStyle = o.col;
        switch (o.k) {
          case 'bolt': {
            const x = o.x0 + (o.x1 - o.x0) * q, y = o.y0 + (o.y1 - o.y0) * q, a = Math.atan2(o.y1 - o.y0, o.x1 - o.x0);
            if (o.style === 'slash') {   // Lyn's wind crescent
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              const [sx, sy] = RENDER.toScreen(x, y);
              lynFx(ctx, 'arc', sx * dpr, sy * dpr, a, 1.15 * dpr, .9);
              ctx.setTransform(s, 0, 0, s, RENDER.ox, RENDER.oy);
            } else {                      // arrow
              const b = Math.max(0, q - .12), bx = o.x0 + (o.x1 - o.x0) * b, by = o.y0 + (o.y1 - o.y0) * b;
              ctx.lineWidth = 2 * lw; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke();
            }
            break;
          }
          case 'drill': {
            ctx.globalAlpha = 1 - q; ctx.lineWidth = Math.max(.4, 6 * lw);
            const ex = o.x + Math.cos(o.a) * o.len, ey = o.y + Math.sin(o.a) * o.len;
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(.15, 2 * lw); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.globalAlpha = 1; break;
          }
          case 'star': break;    // drawn by the tornado sheet
          case 'shell': {
            const x = o.x0 + (o.x1 - o.x0) * q, y = o.y0 + (o.y1 - o.y0) * q - Math.sin(q * Math.PI) * 6;
            ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(x, y, .8, 0, 7); ctx.fill();
            ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(x, y, .35, 0, 7); ctx.fill(); break;
          }
          case 'ring': case 'nova': {
            ctx.globalAlpha = 1 - q; ctx.lineWidth = 2.5 * lw; ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(.1, o.r * (o.k === 'nova' ? q : .3 + .7 * q)), 0, 7); ctx.stroke(); ctx.globalAlpha = 1; break;
          }
          case 'zap': {
            ctx.globalAlpha = 1 - q; ctx.lineWidth = 2.2 * lw; ctx.beginPath();
            const p = o.pts; ctx.moveTo(p[0][0], p[0][1]);
            for (let i = 1; i < p.length; i++) { const mx = (p[i - 1][0] + p[i][0]) / 2 + rnd(-.7, .7), my = (p[i - 1][1] + p[i][1]) / 2 + rnd(-.7, .7); ctx.lineTo(mx, my); ctx.lineTo(p[i][0], p[i][1]); }
            ctx.stroke(); ctx.globalAlpha = 1; break;
          }
          case 'shur': {        // FE hand axe, spinning out and back
            if (o.t < 0) break;
            ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.t * 22);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#7a4a22'; ctx.fillRect(-.15, -1.1, .3, 2.2);
            ctx.fillStyle = '#d8dde8'; ctx.beginPath(); ctx.moveTo(.1, -1.1); ctx.quadraticCurveTo(1.2, -.6, .1, .1); ctx.fill();
            ctx.restore(); ctx.globalCompositeOperation = 'lighter'; break;
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const p of parts) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      ctx.globalAlpha = 1;
    },
    drawText(ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = RENDER.dpr;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const t of texts) {
        const [x, y] = RENDER.toScreen(t.x, t.y), q = t.t / t.life;
        const pop = t.t < .16 ? .6 + t.t / .16 * .4 : 1;
        ctx.globalAlpha = q > .7 ? (1 - q) / .3 : 1;
        ctx.font = `${Math.round((t.big ? 22 : 15) * pop * dpr)}px "Phantasia", "JetBrains Mono", monospace`;
        ctx.lineWidth = 4 * dpr; ctx.strokeStyle = '#1c0e04'; ctx.lineJoin = 'round';
        const yy = (y - q * (t.big ? 16 : 22)) * dpr;
        ctx.strokeText(t.str, x * dpr, yy); ctx.fillStyle = t.col; ctx.fillText(t.str, x * dpr, yy);
      }
      ctx.globalAlpha = 1;
    },
  };
})();

/* ---------------- audio: Blazing Blade BGM + synth SFX (start on first tap) ---------------- */
const SFX = (() => {
  let ac = null, master = null, music = null, lastShot = 0;
  function init() {
    if (ac) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .32; master.connect(ac.destination); } catch (e) { ac = null; }
    try { music = new Audio('audio/main_heroine.mp3'); music.loop = true; music.volume = .45; if (S.sound && S.music !== false) music.play().catch(() => { }); } catch (e) { music = null; }
  }
  function on() { return ac && S.sound; }
  function tone(f, d, type, vol, f2) {
    if (!on()) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol || .2, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02);
  }
  function noise(d, vol, hp) {
    if (!on()) return; const t = ac.currentTime, len = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, len, ac.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = ac.createGain(); g.gain.value = vol || .2; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  window.addEventListener('pointerdown', () => { init(); if (ac && ac.state === 'suspended') ac.resume(); }, { capture: true });
  return {
    setSound(v) { if (music) { if (v) music.play().catch(() => { }); else music.pause(); } },
    shot(type) { const n = performance.now(); if (n - lastShot < 90) return; lastShot = n; if (type === 'Basic' || type === 'OrbitingSaw') noise(.06, .05, 3000); else tone(type === 'Mortar' ? 220 : 700 + Math.random() * 200, .08, 'triangle', .04, type === 'Mortar' ? 110 : 400); },
    boom() { noise(.35, .22, 200); tone(90, .3, 'sine', .25, 40); },
    thud() { noise(.12, .08, 400); },
    gold() { tone(1320, .12, 'triangle', .12); setTimeout(() => tone(1760, .16, 'triangle', .1), 60); },
    gem() { tone(1046, .1, 'sine', .14); setTimeout(() => tone(1568, .2, 'sine', .12), 80); },
    buy() { tone(784, .06, 'triangle', .08, 1175); },
    unlock() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .12), i * 70)); },
    skill() { noise(.25, .12, 1500); tone(330, .4, 'sawtooth', .06, 990); },
    planet() { [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .4, 'triangle', .13), i * 90)); },
    prestige() { [262, 392, 523, 784, 1046, 1568].forEach((f, i) => setTimeout(() => tone(f, .6, 'sine', .14), i * 110)); },
    click() { tone(1200, .03, 'square', .03); },
  };
})();
