'use strict';
/* data.js — every balance number comes from the td-003 v29 GDD (sections 3–8, 14, 19, 21). Names follow the GDD. */
const CFG = {
  grid: 128,
  planetRadius: [20, 22, 24, 28, 32, 38, 44, 52, 60, 60],
  planetHpMult: [1, 11.1963, 7.4666, 2.58, 2.5, 2.42, 2.34, 2.26, 2.18, 2.1],
  planetHpBase: 10986,
  coreRim: [11.29, 5.86, 3.70, 3.30, 3.30, 3.30, 3.30, 3.30, 3.30, 3.30],
  special: { explosive: { rate: .005, from: 3, radius: 2 }, energy: { rate: .005, from: 4, gain: 10 }, gold: { rate: .005, from: 5, mult: 10 } },
  combo: { window: 2.7, marks: [5, 10, 25, 50, 100, 250, 500, 750, 999] },
  galaxyHp: 2, galaxyIncome: 1.2, planetsPerGalaxy: 10,
  gemsPerPlanet: 10, gemsPerMilestone: 1,
  arrivalExtra: 1.25,
  // weapon tiers: the n-th weapon you unlock gets tier n
  tierCost: [10, 500, 3e3, 18e3, 200e3, 1.5e6, 20e6, 200e6, 1.5e9, 10e9],
  tierDmg: [1, 5, 30, 150, 750, 5e3, 25e3, 125e3, 1e6, 5e6],
  levelGrowth: 1.2,
  milestones: (() => { const m = [10, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1750, 2000]; for (let v = 2250; v <= 20000; v += 250) m.push(v); return m; })(),
  baseSlots: 3, maxOwned: 10,
  energy: { max: 400, regen: 1 },
  skillRoll: 100,
  rarityCopies: [2, 5, 8, 12],         // copies needed to go Common→Rare→Epic→Legendary→Ultimate
  rarityNames: ['Common', 'Rare', 'Epic', 'Legendary', 'Ultimate'],
  rarityColors: ['#9fb3c8', '#4fb7ff', '#c06bff', '#ffb531', '#ff4f7a'],
  skillSlots: 6,
  prestige: { fromPlanet: 3, scaler: 200, exp: .15, mult: 10, min: 30 },
  offline: { minSec: 180, baseCapH: 4, eff: .10, adMult: 2 },
  boosts: { gem2: { mult: 2, sec: 1200, gems: 45 }, gem5: { mult: 5, sec: 300, gems: 75 }, ad: { mult: 2, addSec: 300, maxSec: 1500 } },
  onboarding: { boost: .10, prestige: .45, skills: .30, done: .10 },   // % of the planet mined that reveals each stage
  floatMax: 4,
};

/* 10 weapon types — GDD §4 parameters; `kind` picks the behaviour in game.js */
const WEAPONS = {
  Basic:         { name: 'Wind Slash', gdd: 'Basic Laser',     icon: 'lyn_3',   color: '#7dffb0', p: { pierce: 1 }, summon: 20,  spec: 'Pierce' },
  RotatingStar:  { name: 'Whirlwind', gdd: 'Rotating Star',   icon: 'lyn_1',    color: '#8dffc2', p: { arms: 3, armLen: 4 }, summon: 100, spec: 'Arm Count' },
  DrillLance:    { name: 'Sacaean Javelin', gdd: 'Drill Lance',     icon: 'lyn_2',   color: '#ffd27a', p: { pierce: 10 }, summon: 110, spec: 'Pierce' },
  Mortar:        { name: 'Bolganone', gdd: 'Mortar',          icon: 'hector_2',  color: '#ff7a3a', p: { radius: 5 }, summon: 120, spec: 'Radius' },
  OrbitingSaw:   { name: 'Sol Blades', gdd: 'Orbiting Saw',    icon: 'lyn_5',     color: '#c8f7ff', p: { blades: 2, orbit: 8 }, summon: 140, spec: 'Blade Count' },
  ChainArc:      { name: 'Thoron Chain', gdd: 'Chain Arc',       icon: 'lyn_6',   color: '#9fd8ff', p: { bounces: 8 }, summon: 160, spec: 'Bounce Count' },
  ScatterBurst:  { name: 'Arrow Volley', gdd: 'Scatter Burst',   icon: 'lyn_7', color: '#ffe58a', p: { pellets: 3, pierce: 2 }, summon: 180, spec: 'Pellet Count' },
  ShockwaveNova: { name: 'Fimbulvetr', gdd: 'Shockwave Nova',  icon: 'hector_p_1',    color: '#9ff0ff', p: { radius: 6 }, summon: 200, spec: 'Radius' },
  TreeLightning: { name: 'Bolting', gdd: 'Tree Lightning',  icon: 'hector_6',    color: '#d6b8ff', p: { depth: 1 }, summon: 300, spec: 'Branch Depth' },
  Shuriken:      { name: 'Hand Axe', gdd: 'Shuriken',        icon: 'hector_0', color: '#ffcf8a', p: { count: 1, dist: 5 }, summon: 250, spec: 'Shuriken Count' },
};
const WEAPON_KEYS = Object.keys(WEAPONS);

/* prestige weapon grid — 18 sequential nodes per weapon (GDD §7, all 180 rows). [stat, value, cost] */
const WGRID = (() => {
  const S = (spec, a, b, c, d, e, f) => [[spec, a], ['as', 1.1], ['dmg', 1.1], [b[0], b[1]], ['dmg', 1.5], ['as', 1.2], [c[0], c[1]], ['dmg', 2], ['as', 1.3], [d[0], d[1]], ['dmg', 4], ['as', 1.5], [e[0], e[1]], ['dmg', 8], ['as', 1.7], [f[0], f[1]], ['dmg', 16], ['as', 2]];
  const rows = {
    Basic: [['pierce', 2], ['as', 1.1], ['dmg', 1.1], ['as', 1.2], ['dmg', 1.5], ['as', 1.3], ['pierce', 4], ['as', 1.5], ['dmg', 2], ['as', 1.7], ['dmg', 4], ['as', 2], ['pierce', 6], ['as', 2.5], ['dmg', 8], ['as', 3], ['dmg', 16], ['as', 4]],
    RotatingStar: [['arms', 4], ['dmg', 1.1], ['as', 1.1], ['armLen', 6], ['dmg', 1.5], ['as', 1.2], ['arms', 8], ['dmg', 2], ['as', 1.3], ['armLen', 8], ['dmg', 4], ['as', 1.5], ['arms', 12], ['dmg', 8], ['as', 1.7], ['armLen', 12], ['dmg', 16], ['as', 2]],
    DrillLance: [['pierce', 12], ['dmg', 1.1], ['as', 1.1], ['pierce', 14], ['dmg', 1.5], ['as', 1.2], ['pierce', 16], ['dmg', 2], ['as', 1.3], ['pierce', 18], ['dmg', 4], ['as', 1.5], ['pierce', 20], ['dmg', 8], ['as', 1.7], ['pierce', 24], ['dmg', 16], ['as', 2]],
    Mortar: [['radius', 6], ['dmg', 1.1], ['as', 1.1], ['radius', 7], ['dmg', 1.5], ['as', 1.2], ['radius', 8], ['dmg', 2], ['as', 1.3], ['radius', 9], ['dmg', 4], ['as', 1.5], ['radius', 10], ['dmg', 8], ['as', 1.7], ['radius', 12], ['dmg', 16], ['as', 2]],
    OrbitingSaw: [['blades', 3], ['dmg', 1.1], ['as', 1.1], ['blades', 4], ['dmg', 1.5], ['as', 1.2], ['blades', 5], ['dmg', 2], ['as', 1.3], ['blades', 6], ['dmg', 4], ['as', 1.5], ['blades', 8], ['dmg', 8], ['as', 1.7], ['blades', 10], ['dmg', 16], ['as', 2]],
    ChainArc: [['bounces', 10], ['dmg', 1.1], ['as', 1.1], ['bounces', 11], ['dmg', 1.5], ['as', 1.2], ['bounces', 12], ['dmg', 2], ['as', 1.3], ['bounces', 13], ['dmg', 4], ['as', 1.5], ['bounces', 14], ['dmg', 8], ['as', 1.7], ['bounces', 16], ['dmg', 16], ['as', 2]],
    ScatterBurst: [['pellets', 6], ['dmg', 1.1], ['as', 1.1], ['pierce', 3], ['dmg', 1.5], ['as', 1.2], ['pellets', 8], ['dmg', 2], ['as', 1.3], ['pierce', 4], ['dmg', 4], ['as', 1.5], ['pellets', 12], ['dmg', 8], ['as', 1.7], ['pierce', 6], ['dmg', 16], ['as', 2]],
    ShockwaveNova: [['radius', 7], ['dmg', 1.1], ['as', 1.1], ['radius', 8], ['dmg', 1.5], ['as', 1.2], ['radius', 10], ['dmg', 2], ['as', 1.3], ['radius', 12], ['dmg', 4], ['as', 1.5], ['radius', 14], ['dmg', 8], ['as', 1.7], ['radius', 16], ['dmg', 16], ['as', 2]],
    TreeLightning: [['depth', 2], ['dmg', 1.1], ['as', 1.1], ['depth', 3], ['dmg', 1.5], ['as', 1.2], ['depth', 4], ['dmg', 2], ['as', 1.3], ['depth', 5], ['dmg', 4], ['as', 1.5], ['depth', 6], ['dmg', 8], ['as', 1.7], ['depth', 7], ['dmg', 16], ['as', 2]],
    Shuriken: [['count', 2], ['dmg', 1.1], ['as', 1.1], ['dist', 7], ['dmg', 1.5], ['as', 1.2], ['count', 3], ['dmg', 2], ['as', 1.3], ['dist', 9], ['dmg', 4], ['as', 1.5], ['count', 4], ['dmg', 8], ['as', 1.7], ['dist', 10], ['dmg', 16], ['as', 2]],
  };
  const costs = {
    Basic: [10, 30, 60, 80, 100, 150, 220, 320, 470, 700, 1000, 1500, 2200, 3200, 4700, 7000, 10000, 15000],
    RotatingStar: [50, 70, 80, 100, 130, 200, 300, 440, 660, 1000, 1500, 2200, 3400, 5000, 7600, 11000, 17000, 26000],
    DrillLance: [50, 60, 70, 90, 110, 160, 230, 340, 500, 700, 1100, 1600, 2300, 3400, 5000, 7000, 11000, 16000],
    Mortar: [50, 70, 80, 110, 140, 200, 300, 460, 700, 1000, 1600, 2400, 3600, 5400, 8000, 12000, 18000, 27000],
    OrbitingSaw: [60, 70, 80, 110, 140, 210, 320, 500, 700, 1100, 1600, 2400, 3700, 5500, 8000, 12000, 19000, 28000],
    ChainArc: [60, 70, 80, 90, 120, 170, 250, 370, 540, 800, 1200, 1700, 2500, 3700, 5400, 8000, 12000, 17000],
    ScatterBurst: [60, 70, 80, 100, 120, 180, 260, 380, 560, 800, 1200, 1800, 2600, 4000, 5600, 8000, 12000, 18000],
    ShockwaveNova: [70, 80, 90, 120, 150, 230, 350, 500, 800, 1200, 1800, 2700, 4000, 6000, 9000, 14000, 20000, 30000],
    TreeLightning: [70, 90, 100, 130, 160, 250, 370, 550, 800, 1300, 1900, 2800, 4300, 6400, 10000, 14000, 22000, 33000],
    Shuriken: [70, 80, 90, 100, 130, 190, 270, 400, 600, 900, 1300, 1900, 2800, 4000, 6000, 9000, 13000, 19000],
  };
  void S;
  const out = {};
  for (const k in rows) out[k] = rows[k].map((r, i) => ({ stat: r[0], val: r[1], cost: costs[k][i] }));
  return out;
})();
const STAT_LABEL = { pierce: 'Pierce', as: 'Attack Speed', dmg: 'Damage', arms: 'Arm Count', armLen: 'Arm Length', radius: 'Radius', blades: 'Blade Count', bounces: 'Bounce Count', pellets: 'Pellet Count', depth: 'Branch Depth', count: 'Shuriken Count', dist: 'Shuriken Distance' };

/* 15 general prestige upgrades — revealed in this fixed order (GDD §7 table) */
const GENERAL = [
  { id: 'slots', name: 'Weapon Slots', curve: 'lin', min: 1, max: 7, reveal: 10, costs: [20, 570, 1200, 1800, 3500, 4600, 9000], fmt: v => '+' + v, desc: 'Extra weapon slots' },
  { id: 'bonusDmg', name: 'Bonus Damage', curve: 'exp', min: 1, max: 50, reveal: 20, costs: [10, 20, 30, 120, 480], fmt: v => '+' + fmtN(v), desc: 'Flat damage added to every hit' },
  { id: 'bonusCr', name: 'Bonus Credits', curve: 'lin', min: 1, max: 100, reveal: 30, costs: [30, 40, 50, 180, 480], fmt: v => '+' + fmtN(v), desc: 'Flat CR for every cell destroyed' },
  { id: 'offDur', name: 'Offline Duration', curve: 'lin', min: .25, max: 4, reveal: 40, costs: [10, 20, 30, 40, 50, 60, 80, 120, 180, 270, 400, 600, 900, 1300, 2000, 3000], fmt: v => '+' + (+v.toFixed(2)) + ' h', desc: 'Longer offline earnings cap' },
  { id: 'offInc', name: 'Offline Income', curve: 'exp', min: 1.2, max: 4, reveal: 50, costs: [70, 110, 260, 500, 1000, 2000, 3700, 7000], fmt: v => '×' + v.toFixed(2), desc: 'Multiplies offline earnings' },
  { id: 'move', name: 'Move Speed', curve: 'lin', min: 1.1, max: 2, reveal: 70, costs: [50, 100, 200, 400, 800, 1600, 3200, 6400], fmt: v => '×' + v.toFixed(2), desc: 'Ship flight speed' },
  { id: 'atkSpd', name: 'Attack Speed', curve: 'exp', min: 1.1, max: 3, reveal: 90, costs: [50, 100, 160, 270, 500, 850, 1500, 2600, 4600, 8000], fmt: v => '×' + v.toFixed(2), desc: 'All weapons fire faster' },
  { id: 'startCr', name: 'Starting Income', curve: 'exp', min: 100, max: 6000, reveal: 110, costs: [60, 80, 140, 200, 300, 470, 700, 1100, 1600, 2400], fmt: v => fmtN(v) + ' CR', desc: 'CR you start every run with' },
  { id: 'regen', name: 'Energy Regen', curve: 'lin', min: .25, max: 5, reveal: 150, costs: [70, 90, 220, 400, 700, 1200, 2200, 4000], fmt: v => '+' + (+v.toFixed(2)) + '/s', desc: 'Faster energy regeneration' },
  { id: 'specFreq', name: 'Special Block Frequency', curve: 'lin', min: 1.1, max: 2, reveal: 170, costs: [70, 90, 240, 450, 2400, 6000], fmt: v => '×' + v.toFixed(2), desc: 'More explosive, energy and gold cells' },
  { id: 'crMult', name: 'Credit Multiplier', curve: 'exp', min: 1.25, max: 10, reveal: 250, uncapped: true, costs: [100, 200, 320, 600, 1000, 1800, 3300, 6000, 11000, 19000], fmt: v => '×' + fmtN(v), desc: 'Multiplies all CR' },
  { id: 'goldVal', name: 'Gold Block Value', curve: 'exp', min: 1.5, max: 10, reveal: 400, uncapped: true, costs: [100, 120, 300, 600, 1200, 2600, 5300, 11000], fmt: v => '×' + fmtN(v), desc: 'Gold cells pay even more' },
  { id: 'maxEn', name: 'Max Energy', curve: 'lin', min: 25, max: 500, reveal: 500, costs: [80, 100, 190, 300, 450, 700, 1100, 1600, 2500, 4000], fmt: v => '+' + Math.round(v), desc: 'Bigger energy tank' },
  { id: 'enVal', name: 'Energy Block Value', curve: 'lin', min: 1.5, max: 8, reveal: 1200, costs: [90, 120, 280, 570, 2300, 5000], fmt: v => '×' + v.toFixed(2), desc: 'Energy cells give more energy' },
  { id: 'dmgMult', name: 'Damage Multiplier', curve: 'exp', min: 1.25, max: 10, reveal: 1800, uncapped: true, costs: [200, 300, 600, 1000, 1600, 2800, 4700, 8000, 13000, 23000], fmt: v => '×' + fmtN(v), desc: 'Multiplies all damage' },
];
function generalValue(u, lv) {
  if (lv <= 0) return null;
  const n = u.costs.length;
  if (lv > n) return u.max * Math.pow(1.25, lv - n);          // uncapped: ×1.25 per level past max
  const t = n === 1 ? 1 : (lv - 1) / (n - 1);
  return u.curve === 'lin' ? u.min + (u.max - u.min) * t : u.min * Math.pow(u.max / u.min, t);
}
function generalCost(u, lv) {   // cost to go lv → lv+1
  const n = u.costs.length;
  if (lv < n) return u.costs[lv];
  return u.uncapped ? Math.round(u.costs[n - 1] * Math.pow(1.7, lv - n + 1)) : Infinity;
}

/* 9 skills — GDD §5 (value = base + per level × level; level = rarity index) */
const SKILLS = {
  Overcharge:  { code: 'BaseDamage',       icon: 'lyn_0', fe: 'Astra',   color: '#ff6b4a', cost: [120, 30], dur: [120, 90], val: [1.5, .2], desc: l => `Damage ×${(1.5 + .2 * l).toFixed(1)}` },
  Resonance:   { code: 'StackingDamage',   icon: 'hector_p_3', fe: 'Wrath',   color: '#ff4fd8', cost: [140, 40], dur: [180, 105], val: [3, .1], cap: [100, 25], desc: l => `+${(3 + .1 * l).toFixed(1)}% damage per 50 cells (max ${100 + 25 * l}%)` },
  Thrusters:   { code: 'MoveSpeed',        icon: 'lyn_p_2', fe: 'Galeforce', color: '#5ff7ff', cost: [100, 30], dur: [120, 75], val: [1.5, .1], desc: l => `Flight speed ×${(1.5 + .1 * l).toFixed(1)}` },
  Jackpot:     { code: 'RevenueProc',      icon: 'lyn_p_1', fe: 'Lucky Seven',   color: '#ffd94a', cost: [130, 30], dur: [120, 60], val: [5, 1], desc: l => `${5 + l}% of cells pay ×10` },
  Override:    { code: 'SystemicOverride', icon: 'hector_5', fe: 'Rally Spectrum',   color: '#9d8cff', cost: [160, 40], dur: [90, 15], val: [30, 2.5], ext: [10, 2], desc: l => `Other skills cost ${(30 + 2.5 * l).toFixed(1)}% less and last +${10 + 2 * l}s` },
  Surge:       { code: 'IncomeMultiplier', icon: 'hector_7', fe: 'Paragon',  color: '#4dff9a', cost: [180, 45], dur: [40, 10], val: [2, .5], desc: l => `CR ×${(2 + .5 * l).toFixed(1)}` },
  Compounding: { code: 'CapitalYield',     icon: 'hector_p_2', fe: 'Gold Membership',   color: '#ffb531', cost: [130, 30], dur: [120, 60], val: [.5, .625], desc: l => `Bonus CR from your balance, up to ×${(1 + .5 + .625 * l).toFixed(2)}` },
  Catalyst:    { code: 'SpecialBlockGen',  icon: 'lyn_4', fe: 'Dance',  color: '#7dffcf', cost: [170, 40], dur: [50, 10], val: [3, 1], desc: l => `Turns ${3 + l} cells near the ship into special cells` },
  Amplifier:   { code: 'SpecialBlockAmp',  icon: 'lyn_p_3', fe: 'Bond',    color: '#ff9b42', cost: [160, 40], dur: [60, 15], val: [1.5, .25], desc: l => `Special cell effects ×${(1.5 + .25 * l).toFixed(2)}` },
};
const SKILL_KEYS = Object.keys(SKILLS);

/* 10 galaxies = 10 regions of Elibe; each planet is a floating isle: [turf, soil, stone, core ore, name] */
const PALETTES = [
  ['#68b040', '#7a5030', '#5d6470', '#3fa7ff', 'Sacae'],
  ['#4f9a3a', '#6b4a2c', '#6b6a62', '#ffcf3f', 'Lycia'],
  ['#9a7a3a', '#8a4a28', '#6a3a30', '#ff5a3a', 'Bern'],
  ['#d8c070', '#b08850', '#8a7058', '#ffb84a', 'Nabata'],
  ['#e8f4ff', '#7c8aa8', '#56607a', '#8ff0ff', 'Ilia'],
  ['#78c868', '#8a7a68', '#a8a8b0', '#ff7ad9', 'Etruria'],
  ['#5a7a3a', '#4a3a2a', '#3e3a44', '#b56bff', 'Valor'],
  ['#3a6a4a', '#3a3040', '#2e2a3a', '#7dffcf', 'Dread Isle'],
  ['#86d0a0', '#6a5a7a', '#585070', '#ff9be6', 'Arcadia'],
  ['#b0a080', '#706050', '#4a4040', '#ff4f4f', "Dragon's Gate"],
];

/* number format: 1.23K, 4.5M … then aa, ab … */
function fmtN(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmtN(-n);
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  const u = ['K', 'M', 'B', 'T'];
  let e = Math.floor(Math.log10(n) / 3);
  let s;
  if (e <= 4) s = u[e - 1];
  else { const k = e - 5; s = String.fromCharCode(97 + Math.floor(k / 26)) + String.fromCharCode(97 + k % 26); }
  const v = n / Math.pow(1000, e);
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + s;
}
function fmtT(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(ss).padStart(2, '0')}`;
}
