'use strict';
/* game.js — Mining Planet core: grid planet, auto ship, 10 weapons, CR economy, specials, combo, skills, prestige, offline, boosts. */
const N = CFG.grid, NN = N * N;
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------------- persistent state ---------------- */
const SAVE_KEY = 'mp_td003_save_v1';
function freshState() {
  return {
    v: 1, cr: 0, gems: 0, pp: 0, galaxy: 1, planet: 0, runCr: 0,
    weapons: [{ type: 'Basic', tier: 0, lv: 1 }],
    cleared: {},                       // galaxy → highest planet index cleared (for the first-clear gem bonus)
    gen: {}, revealed: 0, freeGeneral: true,
    wgrid: {}, freeWeapon: true,       // type → nodes bought (-1 / missing = not summoned)
    skills: {}, equipped: [], freeRoll: true, autoSkills: false,
    energy: 100, onboard: 0, gemBoostEnd: 0, gemBoostMult: 1, adBoostEnd: 0,
    buyMode: 1, lastSeen: Date.now(), incomeRate: 0, sound: true,
    stats: { play: 0, prestiges: 0, planets: 0, cells: 0 },
    grid: null,
  };
}
let S = freshState();
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
function save() {
  try {
    S.lastSeen = Date.now();
    S.grid = encodeGrid();
    const j = JSON.stringify(S);
    localStorage.setItem(SAVE_KEY, j); localStorage.setItem(SAVE_KEY + '_h', hashStr(j));
  } catch (e) { /* storage blocked: the game still runs, progress just isn't kept */ }
}
function load() {
  try {
    const j = localStorage.getItem(SAVE_KEY); if (!j) return false;
    if (localStorage.getItem(SAVE_KEY + '_h') !== hashStr(j)) return false;   // tampered or corrupt → fresh start
    S = Object.assign(freshState(), JSON.parse(j));
    return true;
  } catch (e) { return false; }
}

/* ---------------- derived stats ---------------- */
function gv(id) { const u = GENERAL.find(g => g.id === id); return generalValue(u, S.gen[id] || 0); }
const ST = {};   // recomputed each frame
function recalc() {
  const g = S.galaxy;
  ST.galaxyInc = Math.pow(CFG.galaxyIncome, g - 1);
  ST.crUp = gv('crMult') || 1;
  ST.dmgUp = gv('dmgMult') || 1;
  ST.bonusDmg = gv('bonusDmg') || 0;
  ST.bonusCr = gv('bonusCr') || 0;
  ST.atkSpd = gv('atkSpd') || 1;
  ST.move = gv('move') || 1;
  ST.specFreq = gv('specFreq') || 1;
  ST.goldVal = gv('goldVal') || 1;
  ST.enVal = gv('enVal') || 1;
  ST.maxEnergy = CFG.energy.max + (gv('maxEn') || 0);
  ST.regen = CFG.energy.regen + (gv('regen') || 0);
  ST.slots = Math.min(CFG.maxOwned, CFG.baseSlots + (gv('slots') || 0));
  ST.offCapH = CFG.offline.baseCapH + (gv('offDur') || 0);
  ST.offInc = gv('offInc') || 1;
  const now = Date.now();
  ST.gemBoost = S.gemBoostEnd > now ? S.gemBoostMult : 1;
  ST.adBoost = S.adBoostEnd > now ? CFG.boosts.ad.mult : 1;
  ST.overcharge = skillOn('Overcharge') ? 1.5 + .2 * skLv('Overcharge') : 1;
  ST.resonance = skillOn('Resonance') ? 1 + Math.min((100 + 25 * skLv('Resonance')) / 100, R.resStacks * (3 + .1 * skLv('Resonance')) / 100) : 1;
  ST.surge = skillOn('Surge') ? 2 + .5 * skLv('Surge') : 1;
  ST.thrust = skillOn('Thrusters') ? 1.5 + .1 * skLv('Thrusters') : 1;
  ST.amp = skillOn('Amplifier') ? 1.5 + .25 * skLv('Amplifier') : 1;
  if (skillOn('Compounding')) {
    const cap = .5 + .625 * skLv('Compounding'), x = S.cr / Math.max(1, S.incomeRate || 1);
    ST.compound = 1 + cap * x / (x + 1000);
  } else ST.compound = 1;
  ST.dmgMult = ST.dmgUp * ST.overcharge * ST.resonance;
  ST.crMult = ST.galaxyInc * ST.crUp * ST.gemBoost * ST.adBoost * ST.surge * ST.compound;
}
function milestonesAt(lv) { let m = 0; for (const x of CFG.milestones) { if (lv >= x) m++; else break; } return m; }
function gridBonus(type) {
  const n = S.wgrid[type] ?? -1, out = { dmg: 1, as: 1 }, P = Object.assign({}, WEAPONS[type].p);
  for (let i = 0; i <= n && i < 18; i++) { const r = WGRID[type][i]; if (r.stat === 'dmg' || r.stat === 'as') out[r.stat] = r.val; else P[r.stat] = r.val; }
  out.p = P; return out;
}
function weaponDamage(w) {   // damage per "hit unit" (D) — displayed DPS = 2 × D (GDD v29 HUD)
  const gb = gridBonus(w.type);
  return (CFG.tierDmg[w.tier] * w.lv * Math.pow(2, milestonesAt(w.lv)) * gb.dmg + ST.bonusDmg) * ST.dmgMult;
}
function weaponDps(w) { return 2 * weaponDamage(w); }
function levelCost(w, lv) { return Math.floor(CFG.tierCost[w.tier] * Math.pow(CFG.levelGrowth, lv - 1)); }
function buyCost(w, n) {   // n levels from current (n = Infinity → max affordable)
  let c = 0, k = 0, lv = w.lv;
  while (k < n) { const x = levelCost(w, lv); if (n === Infinity && c + x > S.cr) break; c += x; lv++; k++; if (k > 5000) break; }
  return { cost: c, levels: k };
}
function totalDps() { let d = 0; for (const w of S.weapons) d += weaponDps(w); return d; }

/* ---------------- planet grid ---------------- */
const R = {   // runtime (not saved, rebuilt)
  hp: new Float32Array(NN), max: new Float32Array(NN), kind: new Uint8Array(NN),   // kind: 0 empty, 1 rock, 2 explosive, 3 energy, 4 gold
  solid: 0, cells: 0, totalHp: 0, maxCell: 1, radius: 20, dirty: new Set(), islandDirty: false, islandT: 0,
  ship: { x: 64, y: 2, vx: 0, vy: 0, a: Math.PI / 2, target: -1, retarget: 0 },
  arriving: 0, transition: 0, combo: { n: 0, t: 0, cr: 0, lastMark: 0 }, resStacks: 0, resCount: 0,
  skills: {}, weaponsRT: [], incomeAcc: 0, incomeT: 0, flash: new Float32Array(NN),
};
const idx = (x, y) => y * N + x;
function planetHp(p, g) { let m = 1; for (let i = 0; i <= p; i++) m *= CFG.planetHpMult[i]; return CFG.planetHpBase * m * Math.pow(CFG.galaxyHp, g - 1); }
function genPlanet(saved) {
  const p = S.planet, g = S.galaxy, r = CFG.planetRadius[p], cr = CFG.coreRim[p];
  LATER.length = 0;                       // pending explosion rings belong to the old planet
  R.radius = r; R.hp.fill(0); R.max.fill(0); R.kind.fill(0); R.flash.fill(0);
  let seed = (g * 7919 + p * 104729) >>> 0;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let wsum = 0;
  const w = new Float32Array(NN);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + .5 - 64, dy = y + .5 - 64, d = Math.hypot(dx, dy);
    if (d > r + .5) continue;
    const t = clamp(1 - d / (r + .5), 0, 1);
    const wt = (1 + (cr - 1) * Math.pow(t, 1.35)) * (0.85 + rng() * .3);   // rim → core gets tougher
    w[idx(x, y)] = wt; wsum += wt;
  }
  const total = planetHp(p, g);
  R.cells = 0; R.solid = 0; R.totalHp = total; R.maxCell = 1;
  const sf = ST.specFreq || 1;
  for (let i = 0; i < NN; i++) if (w[i] > 0) {
    const h = Math.max(1, total * w[i] / wsum);
    R.max[i] = h; R.hp[i] = h; R.kind[i] = 1; R.cells++; R.solid++;
    if (h > R.maxCell) R.maxCell = h;
    const q = rng();
    const sp = CFG.special;
    if (p + 1 >= sp.explosive.from && q < sp.explosive.rate * sf) R.kind[i] = 2;
    else if (p + 1 >= sp.energy.from && q < (sp.explosive.rate + sp.energy.rate) * sf) R.kind[i] = 3;
    else if (p + 1 >= sp.gold.from && q < (sp.explosive.rate + sp.energy.rate + sp.gold.rate) * sf) R.kind[i] = 4;
  }
  if (saved && saved.length === NN) {     // restore mined progress (quantised HP fraction per cell)
    for (let i = 0; i < NN; i++) if (R.kind[i]) {
      const f = saved.charCodeAt(i) - 32;
      if (f <= 0) { R.kind[i] = 0; R.hp[i] = 0; R.solid--; } else R.hp[i] = R.max[i] * Math.min(1, f / 90);
    }
  }
  R.destroyedCells = R.cells - R.solid;
  R.paletteIdx = (g - 1) % PALETTES.length;
  R.islandDirty = true;
  R.ship.target = -1;
  RENDER.planetChanged();
}
function encodeGrid() {
  let s = '';
  for (let i = 0; i < NN; i++) s += String.fromCharCode(32 + (R.max[i] > 0 ? (R.kind[i] ? Math.max(1, Math.round(R.hp[i] / R.max[i] * 90)) : 0) : 0));
  return S.planet + '|' + S.galaxy + '|' + s;
}
function minedFrac() { return R.cells ? 1 - R.solid / R.cells : 0; }

/* nearest solid cell to a point — ring search outward (MiningGrid.FindNearestSolid) */
function nearestSolid(px, py, maxR = 128) {
  const cx = Math.floor(px), cy = Math.floor(py);
  let best = -1, bd = Infinity;
  for (let d = 0; d < maxR; d++) {
    if (d * d > bd + 2 * d + 1 && best >= 0) break;
    for (let k = -d; k <= d; k++) {
      const pts = d === 0 ? [[cx, cy]] : [[cx + k, cy - d], [cx + k, cy + d], [cx - d, cy + k], [cx + d, cy + k]];
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const i = idx(x, y); if (!R.kind[i]) continue;
        const dd = (x + .5 - px) ** 2 + (y + .5 - py) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      if (d === 0) break;
    }
  }
  return best;
}

/* ---------------- damage & payouts ---------------- */
const SPEC_NAME = { 2: 'explosive', 3: 'energy', 4: 'gold' };
function damageCell(i, dmg, src) {
  if (!R.kind[i]) return 0;
  R.flash[i] = 1; R.dirty.add(i);
  R.hp[i] -= dmg;
  if (R.hp[i] <= 0) { destroyCell(i, src); return 1; }
  return 0;
}
function destroyCell(i, src, noCombo) {
  const k = R.kind[i]; if (!k) return;
  R.kind[i] = 0; R.hp[i] = 0; R.solid--; R.destroyedCells++; S.stats.cells++;
  markDirtyAround(i);
  R.islandDirty = true;
  let pay = R.max[i] * ST.crMult + ST.bonusCr * ST.galaxyInc;
  if (skillOn('Jackpot') && Math.random() < (5 + skLv('Jackpot')) / 100) { pay *= 10; FX.text(i, 'JACKPOT', '#ffd94a'); }
  const x = i % N, y = (i / N) | 0;
  if (k === 4) { pay *= CFG.special.gold.mult * ST.goldVal * ST.amp; FX.burst(x + .5, y + .5, '#ffd23b', 14); FX.special('twin', x + .5, y + .5); SFX.gold(); }
  if (k === 3) { const e = CFG.special.energy.gain * ST.enVal * ST.amp; S.energy = Math.min(ST.maxEnergy, S.energy + e); FX.special('barrier', x + .5, y + .5); FX.text(i, '+' + Math.round(e) + ' ⚡', '#5ff7ff'); }
  if (k === 2) explode(x, y);
  earn(pay, i);
  // resonance stacks every 50 cells while active
  if (skillOn('Resonance')) { R.resCount++; if (R.resCount >= 50) { R.resCount = 0; R.resStacks++; } }
  if (!noCombo) { const c = R.combo; c.n++; c.t = CFG.combo.window; c.cr += pay; }
  if (Math.random() < .35) FX.debris(x + .5, y + .5, PALETTES[R.paletteIdx][2]);
}
function explode(cx, cy) {
  const rad = CFG.special.explosive.radius * ST.amp;
  FX.ring(cx + .5, cy + .5, rad + .5, '#ff7a3b', .35, true);
  SFX.boom();
  RENDER.shake = Math.min(1, RENDER.shake + .35);
  const r2 = Math.ceil(rad);
  for (let ring = 1; ring <= r2; ring++) {
    later(ring * .05, () => {
      for (let y = cy - ring; y <= cy + ring; y++) for (let x = cx - ring; x <= cx + ring; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const d = Math.hypot(x - cx, y - cy); if (d > ring || d <= ring - 1 || d > rad) continue;
        const i = idx(x, y); if (R.kind[i]) destroyCell(i, 'boom');
      }
    });
  }
}
function earn(cr, cellIdx) {
  S.cr += cr; S.runCr += cr; R.incomeAcc += cr;
  if (cellIdx !== undefined) FX.crPop(cellIdx, cr);
}
function markDirtyAround(i) { const x = i % N, y = (i / N) | 0; R.dirty.add(i); if (x > 0) R.dirty.add(i - 1); if (x < N - 1) R.dirty.add(i + 1); if (y > 0) R.dirty.add(i - N); if (y < N - 1) R.dirty.add(i + N); }

/* small islands: leftover fragments are cleared and paid out (MiningGrid.RemoveSmallIslands) */
const _lab = new Int32Array(NN), _q = new Int32Array(NN);
function removeSmallIslands() {
  _lab.fill(-1);
  const comps = [];
  for (let s = 0; s < NN; s++) {
    if (!R.kind[s] || _lab[s] >= 0) continue;
    let h = 0, t = 0; _q[t++] = s; _lab[s] = comps.length; const cells = [];
    while (h < t) {
      const i = _q[h++]; cells.push(i);
      const x = i % N, y = (i / N) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1];
      for (const j of nb) if (j >= 0 && R.kind[j] && _lab[j] < 0) { _lab[j] = comps.length; _q[t++] = j; }
    }
    comps.push(cells);
  }
  if (!comps.length) return;
  const minKeep = Math.max(6, Math.round(R.cells * .004));
  let largest = 0; for (let c = 1; c < comps.length; c++) if (comps[c].length > comps[largest].length) largest = c;
  for (let c = 0; c < comps.length; c++) {
    if (comps[c].length >= minKeep && c === largest) continue;
    if (comps[c].length >= minKeep) continue;
    for (const i of comps[c]) { FX.debris((i % N) + .5, ((i / N) | 0) + .5, '#ffffff'); destroyCell(i, 'island', true); }
  }
}

/* ---------------- timers ---------------- */
const LATER = [];
function later(t, fn) { LATER.push({ t, fn }); }
function tickLater(dt) { for (let i = LATER.length - 1; i >= 0; i--) { const L = LATER[i]; L.t -= dt; if (L.t <= 0) { LATER.splice(i, 1); L.fn(); } } }

/* ---------------- skills ---------------- */
function skLv(k) { return (S.skills[k] && S.skills[k].lv) || 0; }
function skillOn(k) { return (R.skills[k] || 0) > 0; }
function skillCost(k) {
  const D = SKILLS[k], l = skLv(k);
  let c = D.cost[0] + D.cost[1] * l;
  if (k !== 'Override' && skillOn('Override')) c *= 1 - (30 + 2.5 * skLv('Override')) / 100;
  return Math.round(c);
}
function skillDur(k) {
  const D = SKILLS[k], l = skLv(k);
  let d = D.dur[0] + D.dur[1] * l;
  if (k !== 'Override' && skillOn('Override')) d += 10 + 2 * skLv('Override');
  return d;
}
function activateSkill(k) {
  if (!S.skills[k] || skillOn(k)) return false;
  const c = skillCost(k); if (S.energy < c) return false;
  S.energy -= c; R.skills[k] = skillDur(k);
  if (k === 'Resonance') { R.resStacks = 0; R.resCount = 0; }
  SFX.skill(); FX.shipPulse(); RENDER.lynSkill(k);
  UI.toast(SKILLS[k].fe + ' · ' + k, SKILLS[k].color);
  return true;
}
function tickSkills(dt) {
  for (const k in R.skills) if (R.skills[k] > 0) { R.skills[k] -= dt; if (R.skills[k] <= 0) { R.skills[k] = 0; if (k === 'Resonance') R.resStacks = 0; } }
  if (S.autoSkills) for (const k of S.equipped) if (!skillOn(k) && S.energy >= skillCost(k)) activateSkill(k);
  if (skillOn('Catalyst')) {
    R.catT = (R.catT || 0) - dt;
    if (R.catT <= 0) {
      R.catT = 1;
      const n = 3 + skLv('Catalyst'), sh = R.ship;
      for (let k = 0; k < n * 5 && k < 60; k++) {
        if (Math.random() > .2) continue;
        const a = Math.random() * Math.PI * 2, d = Math.random() * 8;
        const x = Math.floor(sh.x + Math.cos(a) * d), y = Math.floor(sh.y + Math.sin(a) * d);
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const i = idx(x, y); if (R.kind[i] !== 1) continue;
        R.kind[i] = 2 + (Math.random() * 3 | 0); R.dirty.add(i); RENDER.specials.push(i); FX.burst(x + .5, y + .5, '#7dffcf', 6);
      }
    }
  }
}
function rollSkill() {
  const free = S.freeRoll;
  if (!free && S.gems < CFG.skillRoll) return null;
  if (free) S.freeRoll = false; else S.gems -= CFG.skillRoll;
  // the onboarding roll is fixed to Thrusters (PL·v29); later rolls are uniform
  const k = free && !Object.keys(S.skills).length ? 'Thrusters' : SKILL_KEYS[Math.random() * SKILL_KEYS.length | 0];
  const s = S.skills[k] || (S.skills[k] = { copies: 0, lv: 0 });
  s.copies++;
  while (s.lv < 4 && s.copies >= CFG.rarityCopies[s.lv]) { s.copies -= CFG.rarityCopies[s.lv]; s.lv++; }
  if (S.equipped.length < CFG.skillSlots && !S.equipped.includes(k)) S.equipped.push(k);
  return k;
}

/* ---------------- weapons ---------------- */
function nextTier() { return S.weapons.length; }
function canUnlock() { return S.weapons.length < ST.slots && nextTier() < CFG.tierCost.length; }
function unlockOptions() {
  const own = new Set(S.weapons.map(w => w.type));
  const pool = WEAPON_KEYS.filter(k => !own.has(k));
  const a = pool.splice(Math.random() * pool.length | 0, 1)[0];
  const b = pool.length ? pool.splice(Math.random() * pool.length | 0, 1)[0] : null;
  return [a, b].filter(Boolean);
}
function unlockWeapon(type) {
  const t = nextTier(), c = CFG.tierCost[t];
  if (S.cr < c || !canUnlock()) return false;
  S.cr -= c; S.weapons.push({ type, tier: t, lv: 1 });
  buildWeaponsRT(); SFX.unlock();
  return true;
}
function levelWeapon(i, n) {
  const w = S.weapons[i], b = buyCost(w, n);
  if (!b.levels || b.cost > S.cr) return false;
  const before = milestonesAt(w.lv);
  S.cr -= b.cost; w.lv += b.levels;
  const gained = milestonesAt(w.lv) - before;
  if (gained > 0) { S.gems += gained * CFG.gemsPerMilestone; UI.toast(`${WEAPONS[w.type].name} milestone · damage ×${Math.pow(2, gained)} · +${gained} gem`, '#b98cff'); SFX.gem(); }
  SFX.buy();
  return true;
}
function buildWeaponsRT() {
  R.weaponsRT = S.weapons.map((w, i) => ({ i, t: rnd(0, .5), ang: rnd(0, 6.28) }));
}
/* per-weapon behaviour: base rate (shots/s) and per-cell factor of D, tuned so HP/s ≈ 1.3 × D at base parameters */
const WB = {
  Basic: { rate: 3, per: .433 }, DrillLance: { rate: .65, per: .2 }, RotatingStar: { rate: .5, per: .0217 }, Mortar: { rate: .5, per: .033 },
  OrbitingSaw: { per: .0145 }, ChainArc: { rate: 1, per: .145 }, ScatterBurst: { rate: .8, per: .27 }, ShockwaveNova: { rate: .5, per: .023 },
  TreeLightning: { rate: .8, per: .4 }, Shuriken: { rate: .6, per: .2 },
};
function fireWeapons(dt) {
  const sh = R.ship;
  const ti = sh.target;
  const tx = ti >= 0 ? (ti % N) + .5 : 0, ty = ti >= 0 ? ((ti / N) | 0) + .5 : 0;
  const inRange = ti >= 0 && Math.hypot(tx - sh.x, ty - sh.y) < 15 && !R.transition;
  for (const rt of R.weaponsRT) {
    const w = S.weapons[rt.i]; if (!w) continue;
    const B = WB[w.type], gb = gridBonus(w.type), P = gb.p, D = weaponDamage(w);
    const spd = ST.atkSpd * gb.as * (ST.adBoost > 1 ? 1.25 : 1);
    if (w.type === 'OrbitingSaw') {      // continuous: blades orbit the ship
      rt.ang += dt * 3.2 * spd;
      rt.t -= dt; const tick = rt.t <= 0; if (tick) rt.t = .1 / spd;
      for (let b = 0; b < P.blades; b++) {
        const a = rt.ang + b * Math.PI * 2 / P.blades, bx = sh.x + Math.cos(a) * P.orbit * .55, by = sh.y + Math.sin(a) * P.orbit * .55;
        rt['bx' + b] = bx; rt['by' + b] = by;
        if (tick && !R.transition) hitDisc(bx, by, 1.3, D * B.per);
      }
      rt.blades = P.blades;
      continue;
    }
    if (!inRange) { rt.t = Math.min(rt.t, .2); continue; }
    rt.t -= dt * spd;
    if (rt.t > 0) continue;
    rt.t += 1 / B.rate * rnd(.92, 1.08);
    R.lastFire = performance.now();
    SFX.shot(w.type);
    const col = WEAPONS[w.type].color;
    switch (w.type) {
      case 'Basic': FX.bolt(sh.x, sh.y, tx, ty, col, () => { const e = lineHits(sh.x, sh.y, tx, ty, P.pierce, D * B.per, 0); FX.hit(e[0], e[1]); }, 'slash'); break;
      case 'DrillLance': { const a = Math.atan2(ty - sh.y, tx - sh.x); const e = lineHits(sh.x, sh.y, tx, ty, P.pierce, D * B.per, 0, true); FX.drill(sh.x, sh.y, a, col, Math.hypot(e[0] - sh.x, e[1] - sh.y)); break; }
      case 'RotatingStar': FX.star(tx, ty, P.arms, P.armLen, col, (x, y, ang) => starHits(x, y, ang, P.arms, P.armLen, D * B.per)); break;
      case 'Mortar': FX.shell(sh.x, sh.y, tx, ty, col, () => { FX.blast(tx, ty, P.radius); RENDER.shake = Math.min(1, RENDER.shake + .12); SFX.thud(); hitDisc(tx, ty, P.radius, D * B.per); }); break;
      case 'ChainArc': chainArc(sh.x, sh.y, ti, P.bounces, D * B.per, col); break;
      case 'ScatterBurst': { const a = Math.atan2(ty - sh.y, tx - sh.x); for (let k = 0; k < P.pellets; k++) { const aa = a + (k - (P.pellets - 1) / 2) * .16; const ex = sh.x + Math.cos(aa) * 16, ey = sh.y + Math.sin(aa) * 16; FX.bolt(sh.x, sh.y, ex, ey, col, null, 'arrow'); lineHits(sh.x, sh.y, ex, ey, P.pierce, D * B.per, 0); } break; }
      case 'ShockwaveNova': FX.nova(tx, ty, P.radius, col, (r0, r1) => ringHits(tx, ty, r0, r1, D * B.per)); break;
      case 'TreeLightning': treeLightning(sh.x, sh.y, ti, P.depth, D * B.per, col); break;
      case 'Shuriken': for (let k = 0; k < P.count; k++) FX.shuriken(sh, tx, ty, P.dist, col, k * .12, (x, y, seen) => discOnce(x, y, .8, D * B.per, seen)); break;
    }
  }
}
const _seen = new Set();
function lineHits(x0, y0, x1, y1, pierce, dmg, _, drill) {
  // the shot carries a damage budget (damage × pierce) along the ray: each cell it breaks passes the leftover on,
  // so strong shots tunnel through soft rim cells instead of wasting overkill on one cell
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  let budget = dmg * pierce; _seen.clear();
  const maxL = drill ? L + 40 : L + 30;
  let lx = x1, ly = y1;
  for (let s = 0; s < maxL && budget > 0; s += .35) {
    const x = Math.floor(x0 + ux * s), y = Math.floor(y0 + uy * s);
    if (x < 0 || y < 0 || x >= N || y >= N) break;
    const i = idx(x, y); if (_seen.has(i)) continue; _seen.add(i);
    if (R.kind[i]) { const h = R.hp[i]; damageCell(i, budget); budget -= h; lx = x + .5; ly = y + .5; }
  }
  return [lx, ly];
}
function hitDisc(cx, cy, rad, dmg) {
  const r = Math.ceil(rad);
  for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 > rad * rad) continue;
    const i = idx(x, y); if (R.kind[i]) damageCell(i, dmg);
  }
}
function discOnce(cx, cy, rad, dmg, seen) {
  const r = Math.ceil(rad);
  for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const i = idx(x, y); if (!R.kind[i] || seen.has(i)) continue;
    if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 > rad * rad) continue;
    seen.add(i); damageCell(i, dmg);
  }
}
function ringHits(cx, cy, r0, r1, dmg) {
  const r = Math.ceil(r1);
  for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const d = Math.hypot(x + .5 - cx, y + .5 - cy); if (d < r0 || d >= r1) continue;
    const i = idx(x, y); if (R.kind[i]) damageCell(i, dmg);
  }
}
function starHits(cx, cy, ang, arms, len, dmg) {
  const seen = new Set();
  for (let a = 0; a < arms; a++) {
    const aa = ang + a * Math.PI * 2 / arms;
    for (let s = .5; s <= len; s += .5) {
      const x = Math.floor(cx + Math.cos(aa) * s), y = Math.floor(cy + Math.sin(aa) * s);
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = idx(x, y); if (seen.has(i)) continue; seen.add(i);
      if (R.kind[i]) damageCell(i, dmg);
    }
  }
}
function chainArc(sx, sy, first, bounces, dmg, col) {
  const pts = [[sx, sy]]; const used = new Set(); let cur = first;
  for (let b = 0; b <= bounces && cur >= 0; b++) {
    used.add(cur); const x = cur % N + .5, y = ((cur / N) | 0) + .5; pts.push([x, y]);
    damageCell(cur, dmg);
    cur = nearestUnused(x, y, used, 4);
  }
  FX.lightning(pts, col, .18, true);
}
function nearestUnused(x, y, used, rad) {
  let best = -1, bd = Infinity; const r = Math.ceil(rad);
  for (let yy = Math.floor(y) - r; yy <= Math.floor(y) + r; yy++) for (let xx = Math.floor(x) - r; xx <= Math.floor(x) + r; xx++) {
    if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
    const i = idx(xx, yy); if (!R.kind[i] || used.has(i)) continue;
    const d = (xx + .5 - x) ** 2 + (yy + .5 - y) ** 2 + Math.random() * 1.5; if (d < bd && d <= rad * rad + 2) { bd = d; best = i; }
  }
  return best;
}
function treeLightning(sx, sy, root, depth, dmg, col) {
  const used = new Set([root]);
  const rx = root % N + .5, ry = ((root / N) | 0) + .5;
  FX.lightning([[sx, sy], [rx, ry]], col, .16, true);
  damageCell(root, dmg);
  let frontier = [root];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const c of frontier) {
      const x = c % N + .5, y = ((c / N) | 0) + .5;
      for (let b = 0; b < 3; b++) {
        const n = nearestUnused(x, y, used, 3.5); if (n < 0) break;
        used.add(n); next.push(n);
        FX.lightning([[x, y], [n % N + .5, ((n / N) | 0) + .5]], col, .16);
        damageCell(n, dmg);
      }
    }
    frontier = next;
  }
}

/* ---------------- ship ---------------- */
function tickShip(dt) {
  const sh = R.ship;
  if (R.transition > 0) {      // fly off / arrive between planets
    R.transition -= dt;
    sh.x += sh.vx * dt; sh.y += sh.vy * dt;
    if (R.transition <= 0) { R.transition = 0; nextPlanetArrive(); }
    return;
  }
  sh.retarget -= dt;
  if (sh.target < 0 || !R.kind[sh.target] || sh.retarget <= 0) { sh.target = nearestSolid(sh.x, sh.y); sh.retarget = .4; }
  if (sh.target < 0) return;
  const tx = sh.target % N + .5, ty = ((sh.target / N) | 0) + .5;
  const dx = sh.x - tx, dy = sh.y - ty, d = Math.hypot(dx, dy) || 1;
  const stand = 4.5;
  const gx = tx + dx / d * stand, gy = ty + dy / d * stand;
  const spd = 14 * ST.move * ST.thrust * (ST.adBoost > 1 ? 2 : 1);
  const ex = gx - sh.x, ey = gy - sh.y, ed = Math.hypot(ex, ey);
  const want = ed > .3 ? Math.min(spd, ed * 4) : 0;
  const tvx = ed > .01 ? ex / ed * want : 0, tvy = ed > .01 ? ey / ed * want : 0;
  sh.vx += (tvx - sh.vx) * Math.min(1, dt * 6); sh.vy += (tvy - sh.vy) * Math.min(1, dt * 6);
  sh.x += sh.vx * dt; sh.y += sh.vy * dt;
  const ta = Math.atan2(ty - sh.y, tx - sh.x);
  let da = ta - sh.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  sh.a += da * Math.min(1, dt * 10);
  sh.moving = Math.hypot(sh.vx, sh.vy) > 2;
}

/* ---------------- planet flow ---------------- */
function planetDone() {
  const g = S.galaxy, p = S.planet;
  const first = (S.cleared[g] ?? -1) < p;
  if (first) { S.cleared[g] = p; S.gems += CFG.gemsPerPlanet; }
  S.stats.planets++;
  cashCombo();
  SFX.planet();
  UI.planetBanner(p, first);
  if (S.onboard < 3) S.onboard = 3;
  // fly off, then the next planet (or the next galaxy after planet 10)
  const sh = R.ship; const a = rnd(0, Math.PI * 2);
  sh.vx = Math.cos(a) * 40; sh.vy = Math.sin(a) * 40;
  R.transition = CFG.arrivalExtra + .6;
  R.pendingGalaxy = p === CFG.planetsPerGalaxy - 1;
}
function nextPlanetArrive() {
  if (R.pendingGalaxy) { R.pendingGalaxy = false; travelGalaxy(); return; }
  S.planet++;
  recalc(); genPlanet(); placeShipEntry(); save();
}
function placeShipEntry() {
  const sh = R.ship, a = rnd(0, Math.PI * 2), d = R.radius + 14;
  sh.x = 64 + Math.cos(a) * d; sh.y = 64 + Math.sin(a) * d; sh.vx = -Math.cos(a) * 25; sh.vy = -Math.sin(a) * 25; sh.target = -1;
  RENDER.snapCamera = true;
}
function prestigeGain() {
  const P = CFG.prestige;
  return Math.floor(Math.max(P.min, P.mult * Math.pow(S.runCr / P.scaler, P.exp)));
}
function canPrestige() { return S.planet + 1 >= CFG.prestige.fromPlanet; }
function doPrestige(travel) {
  const gain = prestigeGain();
  S.pp += gain; S.stats.prestiges++;
  if (travel) S.galaxy++;
  S.cr = gv('startCr') || 0; S.runCr = 0; S.planet = 0;
  S.weapons = [{ type: 'Basic', tier: 0, lv: 1 }];
  R.skills = {}; R.combo = { n: 0, t: 0, cr: 0, lastMark: 0 };
  recalc(); buildWeaponsRT(); genPlanet(); placeShipEntry(); save();
  SFX.prestige();
  return gain;
}
function travelGalaxy() {
  const gain = doPrestige(true);
  UI.toast(`Galaxy ${S.galaxy} reached · +${fmtN(gain)} PP`, '#b98cff');
}
function cashCombo() {
  const c = R.combo; if (c.n < 5) { c.n = 0; c.cr = 0; return; }
  const n = Math.min(999, c.n), bonus = c.cr * .10 * Math.pow(n / (n + 300), 2);
  if (bonus >= 1) { earn(bonus); FX.comboCash(n, bonus); }
  c.n = 0; c.cr = 0; c.lastMark = 0;
}
function tickCombo(dt) {
  const c = R.combo;
  if (c.n > 0) { c.t -= dt; if (c.t <= 0) cashCombo(); }
  for (const m of CFG.combo.marks) if (c.n >= m && c.lastMark < m) { c.lastMark = m; FX.comboMark(m); }
}

/* ---------------- onboarding (stages unlock by % of the planet mined) ---------------- */
const STAGES = ['Fresh', 'BoostRevealed', 'PrestigeRevealed', 'FirstPlanetDone', 'SkillsRevealed', 'Completed'];
function tickOnboarding() {
  const f = minedFrac(), O = CFG.onboarding;
  if (S.onboard === 0 && S.planet === 0 && f >= O.boost) { S.onboard = 1; UI.reveal('boost'); }
  if (S.onboard === 1 && S.planet === 0 && f >= O.prestige) { S.onboard = 2; UI.reveal('prestige'); }
  if (S.onboard <= 2 && S.planet >= 1) S.onboard = Math.max(S.onboard, 3);
  if (S.onboard === 3 && S.planet >= 1 && (S.planet > 1 || f >= O.skills)) { S.onboard = 4; UI.reveal('skills'); }
  if (S.onboard === 4 && S.planet >= 2 && f >= O.done) { S.onboard = 5; UI.reveal('shop'); }
}

/* ---------------- offline ---------------- */
function offlineCheck() {
  const away = (Date.now() - (S.lastSeen || Date.now())) / 1000;
  if (away < CFG.offline.minSec || S.onboard < 2 || !S.incomeRate) return null;
  const capS = ST.offCapH * 3600, t = Math.min(away, capS);
  const planetCap = R.totalHp * ST.crMult * .016667;
  const amount = t * Math.min(S.incomeRate * CFG.offline.eff, planetCap) * ST.offInc;
  return { away, t, amount, capped: away > capS };
}

/* ---------------- main loop ---------------- */
let lastT = performance.now(), saveT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (document.hidden) return;
  const reps = window.__speed || 1;            // test hook: run several sim steps per frame
  for (let k = 0; k < reps; k++) step(dt);
  RENDER.draw(dt);
  UI.tick(dt);
}
function step(dt) {
  S.stats.play += dt;
  recalc();
  S.energy = Math.min(ST.maxEnergy, S.energy + ST.regen * dt);
  tickLater(dt);
  tickShip(dt);
  fireWeapons(dt);
  FX.update(dt);
  tickSkills(dt);
  tickCombo(dt);
  R.islandT -= dt;
  if (R.islandDirty && R.islandT <= 0 && !R.transition) { R.islandDirty = false; R.islandT = .8; removeSmallIslands(); }
  if (R.solid <= 0 && !R.transition && R.cells) planetDone();
  tickOnboarding();
  R.incomeT += dt;
  if (R.incomeT >= 5) { const rate = R.incomeAcc / R.incomeT; S.incomeRate = S.incomeRate ? S.incomeRate * .7 + rate * .3 : rate; R.incomeAcc = 0; R.incomeT = 0; }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
}

async function boot() {
  await assetsReady();
  const had = load();
  recalc();
  let saved = null;
  if (S.grid) { const [p, g, s] = [S.grid.split('|')[0], S.grid.split('|')[1], S.grid.slice(S.grid.indexOf('|', S.grid.indexOf('|') + 1) + 1)]; if (+p === S.planet && +g === S.galaxy) saved = s; }
  S.grid = null;
  RENDER.init();
  genPlanet(saved);
  placeShipEntry();
  buildWeaponsRT();
  UI.init();
  if (had) { const off = offlineCheck(); if (off) UI.offline(off); }
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else { lastT = performance.now(); const off = offlineCheck(); if (off) UI.offline(off); } });
  const ld = $('loading'); if (ld) ld.remove();
  requestAnimationFrame(frame);
}
