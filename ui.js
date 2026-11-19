'use strict';
/* ui.js — DOM console over the canvas. Every per-frame write is change-only (no layout churn on phones). */
const svg = (k) => `<img src="sprites/icons/${k}.png" alt="" draggable="false">`;   // Fire Emblem tile icons
function sTe(e, v) { v = String(v); if (e._t !== v) { e._t = v; e.textContent = v; } }
function sT(id, v) { sTe($(id), v); }
function sW(el, v) { if (el._w !== v) { el._w = v; el.style.width = v; } }
function sCls(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }
function sDis(el, v) { if (el.disabled !== !!v) el.disabled = !!v; }
function sHid(el, v) { if (el.hidden !== !!v) el.hidden = !!v; }

const UI = {
  wsig: '', sheetFn: null, sheetT: 0, pointing: null, miniT: 0, confirm: null,
  init() {
    $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.buyMode = b.dataset.m === 'max' ? 'max' : +b.dataset.m; SFX.click(); this.modeRender(); });
    this.modeRender();
    $('unlockBtn').addEventListener('click', () => this.unlockClick());
    $('wlist').addEventListener('click', e => { const b = e.target.closest('.buy'); if (!b) return; const n = S.buyMode === 'max' ? Infinity : S.buyMode; levelWeapon(+b.dataset.i, n); });
    $('navShop').addEventListener('click', () => this.openShop());
    $('navSkills').addEventListener('click', () => this.openSkills());
    $('navBoost').addEventListener('click', () => this.adBoost());
    $('navPrestige').addEventListener('click', () => this.openPrestige());
    $('multBtn').addEventListener('click', () => this.openMult());
    $('setBtn').addEventListener('click', () => this.openSettings());
    $('statBtn').addEventListener('click', () => this.openStats());
    $('autoBtn').addEventListener('click', () => { S.autoSkills = !S.autoSkills; SFX.click(); });
    $('shClose').addEventListener('click', () => this.close());
    $('scrim').addEventListener('click', () => this.close());
    $('slots').addEventListener('click', e => { const b = e.target.closest('.sk'); if (!b || !b.dataset.k) return; if (!activateSkill(b.dataset.k)) SFX.click(); });
    document.addEventListener('click', e => { if (this.pointing && (e.target === this.pointing || this.pointing.contains(e.target))) this.unpoint(); }, true);
    const slots = $('slots'); slots.innerHTML = '';
    for (let i = 0; i < CFG.skillSlots; i++) { const b = document.createElement('button'); b.className = 'sk empty'; b.innerHTML = '<span class="fill"></span><span class="tm"></span><span class="c"></span><span class="skimg"></span>'; slots.appendChild(b); }
    this.applyReveals();
    this.measure();
    new ResizeObserver(() => this.measure()).observe($('panel'));
  },
  measure() {
    const hud = $('hud').getBoundingClientRect(), pan = $('panel').getBoundingClientRect();
    RENDER.view.top = hud.bottom + 6; RENDER.view.bottom = Math.max(0, window.innerHeight - pan.top + 4);
  },
  modeRender() { for (const b of $('mode').children) sCls(b, 'on', (b.dataset.m === 'max' ? 'max' : +b.dataset.m) === S.buyMode); },
  applyReveals() {
    const o = S.onboard;
    sCls($('navBoost'), 'locked', o < 1); sCls($('navPrestige'), 'locked', o < 2);
    sCls($('navSkills'), 'locked', o < 4); sCls($('navShop'), 'locked', o < 5);
    sHid($('skillbar'), o < 4);
    sCls($('nav'), 'none', o < 1);
    sCls($('panel'), 'flat', o < 1);
  },
  reveal(what) {
    this.applyReveals();
    const map = { boost: ['navBoost', 'CR Boost unlocked — watch an ad for ×2 CR and ×2 speed'], prestige: ['navPrestige', 'Prestige unlocked — from Planet 3 you can reset for Prestige Points'], skills: ['navSkills', 'Skills unlocked — your first roll is free'], shop: ['navShop', 'Shop unlocked — gem boosts'] };
    const m = map[what]; if (!m) return;
    this.toast(m[1], '#5ff7ff'); this.point($(m[0])); SFX.unlock();
    setTimeout(() => this.measure(), 50);
  },
  point(el) { this.pointing = el; $('hand').hidden = false; this.placeHand(); },
  unpoint() { this.pointing = null; $('hand').hidden = true; },
  placeHand() { if (!this.pointing) return; const r = this.pointing.getBoundingClientRect(), h = $('hand'); h.style.left = (r.left + r.width / 2 - 4) + 'px'; h.style.top = (r.top - 26) + 'px'; },

  /* ---------- per-frame ---------- */
  tick(dt) {
    sTe($('crTxt').firstChild, fmtN(S.cr));
    sT('multBtn', '×' + fmtN(ST.crMult < 1000 ? +ST.crMult.toFixed(2) : ST.crMult));
    sT('gemTxt', fmtN(S.gems));
    sHid($('ppPill'), !S.pp && !S.stats.prestiges); sT('ppTxt', fmtN(S.pp));
    sT('dpsTxt', fmtN(totalDps()));
    const now = Date.now(), bl = Math.max(S.gemBoostEnd, S.adBoostEnd) - now;
    sHid($('boostPill'), bl <= 0);
    if (bl > 0) sT('boostTxt', `×${fmtN(ST.gemBoost * ST.adBoost)} ${fmtT(bl / 1000)}`);
    sT('galTxt', `Galaxy ${S.galaxy} · ${PALETTES[R.paletteIdx][4]}`);
    sT('plTxt', `Planet ${S.planet + 1}/${CFG.planetsPerGalaxy}`);
    sT('cellTxt', `${(R.cells - R.solid).toLocaleString('en-US')} / ${R.cells.toLocaleString('en-US')} cells`);
    sW($('mineBar'), (minedFrac() * 100).toFixed(1) + '%');
    // energy + skills
    if (S.onboard >= 4) {
      sW($('enBar'), (S.energy / ST.maxEnergy * 100).toFixed(1) + '%');
      sT('enTxt', `${Math.floor(S.energy)}/${ST.maxEnergy}`);
      sCls($('autoBtn'), 'on', S.autoSkills);
      const slots = $('slots').children;
      for (let i = 0; i < slots.length; i++) {
        const b = slots[i], k = S.equipped[i];
        if (b.dataset.k !== (k || '')) {
          b.dataset.k = k || ''; b.querySelector('.skimg').innerHTML = k ? svg(SKILLS[k].icon) : '';
          sCls(b, 'empty', !k); b.setAttribute('aria-label', k ? SKILLS[k].fe + ' (' + k + ')' : 'Empty skill slot');
        }
        if (!k) continue;
        const on = skillOn(k), rem = R.skills[k] || 0;
        sCls(b, 'on', on); sCls(b, 'poor', !on && S.energy < skillCost(k));
        sTe(b.children[2], on ? '' : skillCost(k)); sTe(b.children[1], on ? Math.ceil(rem) + 's' : '');
        const fh = on ? (rem / skillDur(k) * 100).toFixed(0) + '%' : '0%'; if (b.children[0]._h !== fh) { b.children[0]._h = fh; b.children[0].style.height = fh; }
      }
    }
    // weapons
    const sig = S.weapons.map(w => w.type).join(',');
    if (sig !== this.wsig) { this.wsig = sig; this.buildWeapons(); }
    const rows = $('wlist').children;
    for (let i = 0; i < S.weapons.length; i++) {
      const w = S.weapons[i], r = rows[i]; if (!r) break;
      sTe(r._lv, `T${w.tier + 1} · Lv ${w.lv}`); sTe(r._dps, fmtN(weaponDps(w)) + '/s');
      const ms = milestonesAt(w.lv), prev = ms ? CFG.milestones[ms - 1] : 1, nx = CFG.milestones[ms];
      sW(r._ms, ((w.lv - prev) / (nx - prev) * 100).toFixed(1) + '%');
      sTe(r._nx, '×2 at ' + nx);
      const n = S.buyMode === 'max' ? Infinity : S.buyMode, b = buyCost(w, n === Infinity ? Infinity : n);
      const shown = n === Infinity ? (b.levels ? b : { cost: levelCost(w, w.lv), levels: 1 }) : b;
      sTe(r._cost, fmtN(shown.cost)); sTe(r._sub, '+' + shown.levels + ' LV');
      sDis(r._buy, shown.cost > S.cr || !shown.levels);
    }
    // unlock
    const ub = $('unlockBtn');
    if (S.weapons.length >= ST.slots) { sT('unlockLbl', S.weapons.length >= CFG.maxOwned ? 'ALL WEAPONS OWNED' : 'MORE SLOTS VIA PRESTIGE'); sT('unlockCost', ''); sDis(ub, true); }
    else { const c = CFG.tierCost[nextTier()]; sT('unlockLbl', `NEW WEAPON ${S.weapons.length + 1}/${ST.slots}`); sT('unlockCost', fmtN(c) + ' CR'); sDis(ub, S.cr < c); }
    // nav highlights
    sCls($('navPrestige'), 'hot', canPrestige());
    sCls($('navBoost'), 'hot', S.adBoostEnd > now);
    // minimap
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = .5; const m = $('mini').getContext('2d'); m.clearRect(0, 0, 64, 64); m.imageSmoothingEnabled = false; const r = R.radius + 2; m.drawImage(RENDER.pcv, (64 - r) * CP, (64 - r) * CP, r * 2 * CP, r * 2 * CP, 0, 0, 64, 64); }
    if (this.pointing) this.placeHand();
    this.sheetT -= dt; if (this.sheetFn && this.sheetT <= 0 && !this.sheetFn.static) { this.sheetT = 1; this.renderSheet(); }
  },
  buildWeapons() {
    const L = $('wlist'); L.innerHTML = '';
    S.weapons.forEach((w, i) => {
      const W = WEAPONS[w.type], r = document.createElement('div'); r.className = 'w';
      r.innerHTML = `<div class="ic">${svg(W.icon)}</div>
        <div style="min-width:0"><div class="nm tx">${W.name}</div><div class="meta num"><span class="lv"></span><b class="dps"></b><span class="nx"></span></div><div class="ms"><i></i></div></div>
        <button class="buy num" data-i="${i}"><span class="cost"></span><small class="sub"></small></button>`;
      r._lv = r.querySelector('.lv'); r._dps = r.querySelector('.dps'); r._nx = r.querySelector('.nx'); r._ms = r.querySelector('.ms i');
      r._buy = r.querySelector('.buy'); r._cost = r.querySelector('.cost'); r._sub = r.querySelector('.sub');
      L.appendChild(r);
    });
  },
  unlockClick() {
    if (!canUnlock() || S.cr < CFG.tierCost[nextTier()]) return;
    this.pickOpts = unlockOptions();
    this.openPick();
  },

  /* ---------- sheets ---------- */
  open(title, fn) { this.sheetFn = fn; $('shTitle').textContent = title; $('scrim').hidden = false; $('sheet').hidden = false; this.sheetT = 1; this.renderSheet(); SFX.click(); },
  renderSheet() { if (!this.sheetFn) return; const b = $('shBody'), st = b.scrollTop; b.innerHTML = ''; this.sheetFn(b); b.scrollTop = st; },
  close() { this.sheetFn = null; this.confirm = null; $('scrim').hidden = true; $('sheet').hidden = true; },
  h(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; },
  on(el, sel, fn) { el.querySelectorAll(sel).forEach(x => x.addEventListener('click', fn)); },

  openPick() {
    const fn = (b) => {
      const t = nextTier();
      b.appendChild(this.h(`<div class="t2">Weapon ${t + 1} gets tier ${t + 1} stats (cost ${fmtN(CFG.tierCost[t])} CR, base damage ${fmtN(CFG.tierDmg[t])}). Pick one.</div>`));
      const pick = this.h('<div class="pick"></div>');
      for (const k of this.pickOpts) {
        const W = WEAPONS[k], gb = gridBonus(k), p = Object.entries(gb.p).map(([a, v]) => `${STAT_LABEL[a] || a} ${v}`).join(' · ');
        const c = this.h(`<button class="wcard tx" data-k="${k}">${svg(W.icon)}<div class="t1">${W.name}</div><div class="t2">${W.gdd} · ${p}</div><div class="t2 num">DPS ${fmtN(2 * ((CFG.tierDmg[t] * gb.dmg + ST.bonusDmg) * ST.dmgMult))}/s at Lv 1</div></button>`);
        c.addEventListener('click', () => { if (unlockWeapon(k)) { this.close(); this.toast(W.name + ' online', W.color); } });
        pick.appendChild(c);
      }
      b.appendChild(pick);
      const rr = this.h('<button class="btn alt">↻ Reroll both · watch ad</button>');
      rr.addEventListener('click', () => this.ad(() => { this.pickOpts = unlockOptions(); this.open('Choose a weapon', fn); }));
      if (WEAPON_KEYS.length - S.weapons.length > 2) b.appendChild(rr);
    };
    fn.static = true;
    this.open('Choose a weapon', fn);
  },
  openShop() {
    this.open('Shop', (b) => {
      const B = CFG.boosts;
      const mk = (id, title, sub, price, cls, cb) => { const c = this.h(`<div class="card"><div class="row"><div><div class="t1">${title}</div><div class="t2">${sub}</div></div><button class="btn ${cls}">${price}</button></div></div>`); c.querySelector('button').addEventListener('click', cb); if (id && S.gems < B[id].gems) c.querySelector('button').disabled = true; return c; };
      b.appendChild(this.h(`<div class="t2">Boosts multiply all CR. Gem boosts replace each other; the ad boost stacks on top.</div>`));
      b.appendChild(mk('gem2', 'CR ×2 · 20 min', 'Gem boost', `◆ ${B.gem2.gems}`, 'violet', () => this.gemBoost('gem2')));
      b.appendChild(mk('gem5', 'CR ×5 · 5 min', 'Gem boost', `◆ ${B.gem5.gems}`, 'violet', () => this.gemBoost('gem5')));
      b.appendChild(mk(null, 'CR ×2 + speed ×2', `+5 min per ad, up to 25 min · now ${fmtT(Math.max(0, S.adBoostEnd - Date.now()) / 1000)}`, '▶ Watch ad', 'green', () => this.adBoost()));
      b.appendChild(this.h(`<div class="t2">Gem packs, Starter/Epic packs, Lifetime boost and No-Ads are IAP in the GDD and are not part of this prototype.</div>`));
    });
  },
  gemBoost(id) {
    const B = CFG.boosts[id]; if (S.gems < B.gems) return;
    S.gems -= B.gems; S.gemBoostMult = B.mult; S.gemBoostEnd = Date.now() + B.sec * 1000;
    SFX.gem(); this.toast(`CR ×${B.mult} for ${B.sec / 60} min`, '#b98cff'); this.renderSheet();
  },
  adBoost() {
    const B = CFG.boosts.ad, now = Date.now(), rem = Math.max(0, S.adBoostEnd - now);
    if (rem >= B.maxSec * 1000 - 1000) { this.toast('Ad boost is full (25 min)', '#4dff9a'); return; }
    this.ad(() => { S.adBoostEnd = now + Math.min(B.maxSec * 1000, rem + B.addSec * 1000); this.toast('Boost: CR ×2 · speed ×2', '#4dff9a'); SFX.gem(); this.renderSheet(); });
  },
  ad(cb) {
    const el = $('ad'); el.hidden = false; let n = 3; $('adCd').textContent = n;
    const iv = setInterval(() => { n--; $('adCd').textContent = n; if (n <= 0) { clearInterval(iv); el.hidden = true; cb(); } }, 800);
  },
  openSkills() {
    this.open('Skills', (b) => {
      const can = S.freeRoll || S.gems >= CFG.skillRoll;
      const top = this.h(`<div class="card"><div class="row"><div><div class="t1">Roll a skill</div><div class="t2">Duplicates raise rarity: 2 / 5 / 8 / 12 copies. Equip up to ${CFG.skillSlots}. Skills have no cooldown — only energy.</div></div><button class="btn violet">${S.freeRoll ? 'FREE' : '◆ ' + CFG.skillRoll}</button></div></div>`);
      const rb = top.querySelector('button'); rb.disabled = !can;
      rb.addEventListener('click', () => { const k = rollSkill(); if (k) { SFX.gem(); this.toast(`${SKILLS[k].fe} · ${CFG.rarityNames[skLv(k)]}`, SKILLS[k].color); this.renderSheet(); } });
      b.appendChild(top);
      const eb = this.h('<button class="btn alt">Equip best</button>');
      eb.addEventListener('click', () => { S.equipped = SKILL_KEYS.filter(k => S.skills[k]).sort((a, c) => skLv(c) - skLv(a)).slice(0, CFG.skillSlots); this.renderSheet(); });
      b.appendChild(eb);
      for (const k of SKILL_KEYS) {
        const D = SKILLS[k], s = S.skills[k], l = s ? s.lv : 0;
        const need = l < 4 ? CFG.rarityCopies[l] : 0, eq = S.equipped.includes(k);
        const c = this.h(`<div class="card" style="${s ? '' : 'opacity:.45'}"><div class="row"><div style="display:flex;gap:10px;align-items:center"><span class="ico">${svg(D.icon).replace('<img', '<img class="ico"')}</span><div><div class="t1">${D.fe} <span class="t2">${k}</span> ${s ? `<span class="rar" style="color:${CFG.rarityColors[l]}">${CFG.rarityNames[l].toUpperCase()}</span>` : ''}</div><div class="t2">${D.desc(l)} · ${Math.round(D.cost[0] + D.cost[1] * l)}⚡ · ${Math.round(D.dur[0] + D.dur[1] * l)}s</div>${s ? `<div class="t2 num">${l < 4 ? `${s.copies}/${need} copies to ${CFG.rarityNames[l + 1]}` : 'Max rarity'}</div>` : '<div class="t2">Not found yet</div>'}</div></div>${s ? `<button class="btn ${eq ? 'alt' : ''}">${eq ? 'Unequip' : 'Equip'}</button>` : ''}</div></div>`);
        const btn = c.querySelector('button');
        if (btn) { if (!eq && S.equipped.length >= CFG.skillSlots) btn.disabled = true; btn.addEventListener('click', () => { if (eq) S.equipped = S.equipped.filter(x => x !== k); else S.equipped.push(k); this.renderSheet(); }); }
        b.appendChild(c);
      }
    });
  },
  openPrestige(tab) {
    this.ptab = tab || this.ptab || 'gen';
    this.open('Prestige', (b) => {
      const gain = prestigeGain(), ok = canPrestige();
      const top = this.h(`<div class="card"><div class="row"><div><div class="t2">Run CR ${fmtN(S.runCr)} → Prestige Points</div><div class="big num" style="color:#7dffcf">+${fmtN(gain)} PP</div><div class="t2">${ok ? 'Resets CR, weapons and planet progress. Keeps PP, upgrades, gems and skills.' : 'Reach Planet 3 to prestige.'}</div></div><button class="btn green">${this.confirm === 'prestige' ? 'Confirm' : 'Prestige'}</button></div></div>`);
      const pb = top.querySelector('button'); pb.disabled = !ok;
      pb.addEventListener('click', () => {
        if (this.confirm !== 'prestige') { this.confirm = 'prestige'; this.renderSheet(); return; }
        this.confirm = null; const g = doPrestige(false); this.close(); this.banner('PRESTIGE', `+${fmtN(g)} PP`);
      });
      b.appendChild(top);
      b.appendChild(this.h(`<div class="row"><div class="t1 num" style="color:#7dffcf">${fmtN(S.pp)} PP available</div></div>`));
      const tabs = this.h('<div class="tabs"><button data-t="gen">UPGRADES</button><button data-t="grid">WEAPON GRID</button></div>');
      for (const t of tabs.children) { sCls(t, 'on', t.dataset.t === this.ptab); t.addEventListener('click', () => { this.ptab = t.dataset.t; this.renderSheet(); }); }
      b.appendChild(tabs);
      if (this.ptab === 'gen') this.prestigeGeneral(b); else this.prestigeGrid(b);
    });
  },
  prestigeGeneral(b) {
    for (let i = 0; i < S.revealed; i++) {
      const u = GENERAL[i], lv = S.gen[u.id] || 0, n = u.costs.length, cost = generalCost(u, lv), cur = generalValue(u, lv), nxt = generalValue(u, lv + 1);
      const maxed = !isFinite(cost);
      const c = this.h(`<div class="card"><div class="row"><div><div class="t1">${u.name} <span class="t2 num">Lv ${lv}/${n}${u.uncapped ? '+' : ''}</span></div><div class="t2">${u.desc}</div><div class="t2 num">${cur === null ? '—' : u.fmt(cur)}${maxed ? '' : ' → <b style="color:var(--text)">' + u.fmt(nxt) + '</b>'}</div></div><button class="btn amber num">${maxed ? 'MAX' : fmtN(cost) + ' PP'}</button></div></div>`);
      const btn = c.querySelector('button'); btn.disabled = maxed || S.pp < cost;
      btn.addEventListener('click', () => { if (S.pp < cost) return; S.pp -= cost; S.gen[u.id] = lv + 1; SFX.buy(); recalc(); this.renderSheet(); });
      b.appendChild(c);
    }
    if (S.revealed < GENERAL.length) {
      const u = GENERAL[S.revealed], free = S.freeGeneral, cost = free ? 0 : u.reveal;
      const c = this.h(`<div class="card" style="border-style:dashed"><div class="row"><div><div class="t1">??? Upgrade ${S.revealed + 1}/${GENERAL.length}</div><div class="t2">Upgrades are revealed in a fixed order.</div></div><button class="btn violet num">${free ? 'Reveal FREE' : 'Reveal ' + fmtN(cost) + ' PP'}</button></div></div>`);
      const btn = c.querySelector('button'); btn.disabled = S.pp < cost;
      btn.addEventListener('click', () => { if (S.pp < cost) return; S.pp -= cost; S.freeGeneral = false; S.revealed++; SFX.unlock(); this.toast(u.name + ' revealed', '#b98cff'); this.renderSheet(); });
      b.appendChild(c);
    }
  },
  prestigeGrid(b) {
    b.appendChild(this.h('<div class="t2">Add a weapon to the grid, then buy its 18 upgrades in order. Grid bonuses apply whenever you own that weapon in a run.</div>'));
    for (const k of WEAPON_KEYS) {
      const W = WEAPONS[k], n = S.wgrid[k] ?? -1, owned = k in S.wgrid;
      let right, sub;
      if (!owned) {
        const free = S.freeWeapon, cost = free ? 0 : W.summon;
        right = `<button class="btn violet num" data-a="sum">${free ? 'Add FREE' : 'Add ' + fmtN(cost) + ' PP'}</button>`;
        sub = 'Not in grid';
      } else if (n + 1 >= 18) { right = '<button class="btn" disabled>MAX</button>'; sub = 'Grid complete'; }
      else { const r = WGRID[k][n + 1]; right = `<button class="btn amber num" data-a="up">${fmtN(r.cost)} PP</button>`; sub = `Next: ${STAT_LABEL[r.stat]} ${r.stat === 'dmg' || r.stat === 'as' ? '×' + r.val : r.val}`; }
      const dots = owned ? `<div class="dots">${Array.from({ length: 18 }, (_, i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>` : '';
      const c = this.h(`<div class="card"><div class="row"><div style="display:flex;gap:10px;align-items:center">${svg(W.icon).replace('<img', '<img class="ico"')}<div><div class="t1">${W.name} <span class="t2">${W.gdd}</span></div><div class="t2">${sub}</div></div></div>${right}</div>${dots}</div>`);
      const btn = c.querySelector('button[data-a]');
      if (btn) {
        if (btn.dataset.a === 'sum') { const cost = S.freeWeapon ? 0 : W.summon; btn.disabled = S.pp < cost; btn.addEventListener('click', () => { if (S.pp < cost) return; S.pp -= cost; S.freeWeapon = false; S.wgrid[k] = -1; SFX.unlock(); this.renderSheet(); }); }
        else { const r = WGRID[k][n + 1]; btn.disabled = S.pp < r.cost; btn.addEventListener('click', () => { if (S.pp < r.cost) return; S.pp -= r.cost; S.wgrid[k] = n + 1; SFX.buy(); this.renderSheet(); }); }
      }
      b.appendChild(c);
    }
  },
  openMult() {
    this.open('CR multipliers', (b) => {
      const rows = [['Galaxy ' + S.galaxy + ' income', ST.galaxyInc], ['Prestige · Credit Multiplier', ST.crUp], ['Gem boost', ST.gemBoost], ['Ad boost', ST.adBoost], ['Surge skill', ST.surge], ['Compounding skill', ST.compound]];
      b.appendChild(this.h(`<div class="t2">All bonuses are multiplicative.</div>`));
      b.appendChild(this.h(`<table class="mtable num">${rows.map(r => `<tr><td>${r[0]}</td><td>×${r[1] < 100 ? (+r[1].toFixed(2)) : fmtN(r[1])}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td>×${fmtN(ST.crMult < 1000 ? +ST.crMult.toFixed(2) : ST.crMult)}</td></tr></table>`));
      b.appendChild(this.h(`<div class="t2 num">Plus +${fmtN(ST.bonusCr)} flat CR per cell (Bonus Credits). Gold cells ×${fmtN(10 * ST.goldVal)}.</div>`));
    });
  },
  openSettings() {
    this.open('Settings', (b) => {
      const s = this.h(`<div class="card"><div class="row"><div class="t1">Music & sound</div><button class="btn ${S.sound ? '' : 'alt'}">${S.sound ? 'On' : 'Off'}</button></div></div>`);
      s.querySelector('button').addEventListener('click', () => { S.sound = !S.sound; SFX.setSound(S.sound); this.renderSheet(); });
      b.appendChild(s);
      const sk = this.h(`<div class="card"><div class="row"><div><div class="t1">Show everything</div><div class="t2">Skip the onboarding reveals</div></div><button class="btn alt">Skip</button></div></div>`);
      sk.querySelector('button').disabled = S.onboard >= 5;
      sk.querySelector('button').addEventListener('click', () => { S.onboard = 5; this.applyReveals(); this.measure(); this.renderSheet(); });
      b.appendChild(sk);
      const r = this.h(`<div class="card"><div class="row"><div><div class="t1">Reset progress</div><div class="t2">Deletes this browser's save</div></div><button class="btn red">${this.confirm === 'reset' ? 'Tap to confirm' : 'Reset'}</button></div></div>`);
      r.querySelector('button').addEventListener('click', () => {
        if (this.confirm !== 'reset') { this.confirm = 'reset'; this.renderSheet(); return; }
        try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + '_h'); } catch (e) { }
        S = freshState(); recalc(); genPlanet(); placeShipEntry(); buildWeaponsRT(); this.wsig = ''; this.applyReveals(); this.close();
      });
      b.appendChild(r);
      b.appendChild(this.h(`<div class="t2">Systems follow the td-003 v29 GDD (core mining loop, 10 weapons, skills, prestige, offline earnings, boosts); art and music are from Blazing Blade. Ads are simulated; IAP, gear, drones, events and leagues are out of scope.</div>`));
    });
  },
  openStats() {
    this.open('Run stats', (b) => {
      const rows = [['Run CR', fmtN(S.runCr)], ['Income (avg)', fmtN(S.incomeRate) + ' CR/s'], ['Total DPS', fmtN(totalDps()) + '/s'], ['Planets broken', S.stats.planets], ['Cells destroyed', fmtN(S.stats.cells)], ['Prestiges', S.stats.prestiges], ['Play time', fmtT(S.stats.play)], ['Planet HP', fmtN(R.totalHp)]];
      b.appendChild(this.h(`<table class="mtable num">${rows.map(r => `<tr><td>${r[0]}</td><td style="color:var(--text)">${r[1]}</td></tr>`).join('')}</table>`));
    });
  },
  offline(o) {
    const fn = (b) => {
      b.appendChild(this.h(`<div class="card"><div class="t2">You were away ${fmtT(o.away)}${o.capped ? ` (capped at ${ST.offCapH} h)` : ''}. Your ship kept mining at 10% efficiency.</div><div class="big num" style="color:var(--amber)">+${fmtN(o.amount)} CR</div></div>`));
      const row = this.h('<div class="row" style="justify-content:flex-end;gap:8px"><button class="btn alt">Claim</button><button class="btn green">Claim ×2 · watch ad</button></div>');
      const [a, c] = row.querySelectorAll('button');
      a.addEventListener('click', () => { earn(o.amount); this.close(); SFX.gem(); });
      c.addEventListener('click', () => this.ad(() => { earn(o.amount * CFG.offline.adMult); this.close(); SFX.gem(); }));
      b.appendChild(row);
    };
    fn.static = true;
    S.lastSeen = Date.now();
    this.open('Welcome back', fn);
  },
  toast(msg, col) {
    const t = document.createElement('div'); t.className = 'toast'; t.style.color = col || '#dbe7ff'; t.textContent = msg;
    const box = $('toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 2700);
  },
  banner(a, b) { const el = $('banner'); $('ban1').textContent = a; $('ban2').textContent = b || ''; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); },
  planetBanner(p, first) { this.banner(`PLANET ${p + 1} BROKEN`, first ? `+${CFG.gemsPerPlanet} ◆ first clear` : ''); },
};
