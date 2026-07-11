/* ========================================
   IDLE FEEDERISM V2 — script.js
   ======================================== */

/* ==========================================
   STATE
   ========================================== */

const UPGRADE_COST = 10;
const ATTACK_CYCLE_MS = 5000;
const DIGEST_TICK_MS = 1000;
const GOLD_PER_KILL = 10;

const HERO_SPRITES = [
  { maxPct: 19,  src: 'assets/images/normal.png' },
  { maxPct: 39,  src: 'assets/images/leger_gonfler.png' },
  { maxPct: 59,  src: 'assets/images/gonfler.png' },
  { maxPct: 79,  src: 'assets/images/tres_gonfle.png' },
  { maxPct: 99,  src: 'assets/images/super_gonfler.png' },
  { maxPct: 100, src: 'assets/images/full.png' }
];

const MONSTER_SPRITES = {
  slime: { src: 'assets/images/slime.png', name: 'Reine des Slimes' },
  champi: { src: 'assets/images/champi.png', name: 'Reine des Champis' },
  abeille: { src: 'assets/images/abeille.png', name: 'Reine des Abeilles' },
  ogresse: { src: 'assets/images/ogresse.png', name: 'Ogresse Cuisto' },
  sorciere: { src: 'assets/images/sorciere.png', name: 'Sorcière Gourmande' },
  succube: { src: 'assets/images/succube.png', name: 'Succube' }
};

const MONSTER_ORDER = ['slime', 'champi', 'abeille', 'ogresse', 'sorciere', 'succube'];

let state;

function createFreshState() {
  return {
    gold: 0,
    wave: 1,
    stomach: 0,
    damage: 10,
    attackCount: 1,
    digestion: 1,
    capacity: 100,
    monsterHp: 100,
    monsterMaxHp: 100,
    monsterDamage: 10,
    currentMonsterKey: 'slime',
    defeated: false
  };
}

/* ==========================================
   AUDIO — Web Audio API
   ========================================== */

let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, endFreq, type, duration, volume) {
  try {
    ensureAudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume || 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* silent fail */ }
}

function playSound(name) {
  switch (name) {
    case 'hero_attack':
      playTone(200, 80, 'sawtooth', 0.1, 0.2);
      break;
    case 'monster_attack':
      playTone(120, 50, 'square', 0.15, 0.18);
      break;
    case 'monster_kill':
      playTone(520, 700, 'sine', 0.12, 0.15);
      setTimeout(() => playTone(660, 900, 'sine', 0.15, 0.15), 100);
      break;
    case 'upgrade':
      playTone(440, 660, 'sine', 0.12, 0.12);
      setTimeout(() => playTone(660, 880, 'sine', 0.15, 0.1), 80);
      break;
    case 'click':
      playTone(800, 600, 'sine', 0.06, 0.1);
      break;
    case 'defeat':
      playTone(300, 60, 'sawtooth', 0.4, 0.2);
      break;
  }
}

/* ==========================================
   DOM REFERENCES
   ========================================== */

const dom = {};

function cacheDom() {
  dom.goldDisplay    = document.getElementById('gold-display');
  dom.waveDisplay    = document.getElementById('wave-display');
  dom.heroSprite     = document.getElementById('hero-sprite');
  dom.heroImg        = document.getElementById('hero-img');
  dom.heroBar        = document.getElementById('hero-bar');
  dom.heroLabel      = document.getElementById('hero-label');
  dom.monsterSprite  = document.getElementById('monster-sprite');
  dom.monsterImg     = document.getElementById('monster-img');
  dom.monsterName    = document.getElementById('monster-name');
  dom.monsterBar     = document.getElementById('monster-bar');
  dom.monsterLabel   = document.getElementById('monster-label');
  dom.log            = document.getElementById('log');
  dom.btnAttack      = document.getElementById('btn-attack');
  dom.btnRestart     = document.getElementById('btn-restart');
  dom.defeatScreen   = document.getElementById('defeat-screen');
  dom.floatLayer     = document.getElementById('float-layer');
  dom.valDamage      = document.getElementById('val-damage');
  dom.valAttacks     = document.getElementById('val-attacks');
  dom.valDigestion   = document.getElementById('val-digestion');
  dom.valCapacity    = document.getElementById('val-capacity');
}

/* ==========================================
   UI
   ========================================== */

function updateUI() {
  dom.goldDisplay.textContent = `💰 ${state.gold}`;
  dom.waveDisplay.textContent = `Vague ${state.wave}`;

  const stomachPct = Math.min(100, (state.stomach / state.capacity) * 100);
  dom.heroBar.style.width = stomachPct + '%';
  dom.heroLabel.textContent = `${Math.floor(state.stomach)} / ${state.capacity}`;
  updateHeroSprite();

  const monsterPct = (state.monsterHp / state.monsterMaxHp) * 100;
  dom.monsterBar.style.width = monsterPct + '%';
  dom.monsterLabel.textContent = `${Math.max(0, state.monsterHp)} / ${state.monsterMaxHp}`;

  dom.valDamage.textContent    = state.damage;
  dom.valAttacks.textContent   = state.attackCount;
  dom.valDigestion.textContent = state.digestion;
  dom.valCapacity.textContent  = state.capacity;

  document.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.classList.toggle('cannot-afford', state.gold < UPGRADE_COST);
  });
}

function addLog(msg) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  dom.log.appendChild(entry);
  if (dom.log.children.length > 20) dom.log.removeChild(dom.log.firstChild);
  dom.log.scrollTop = dom.log.scrollHeight;
}

/* ==========================================
   FLOATING NUMBERS
   ========================================== */

function spawnFloat(text, color, targetEl) {
  const el = document.createElement('div');
  el.className = `float-num ${color}`;
  el.textContent = text;

  const rect = targetEl.getBoundingClientRect();
  const appRect = dom.floatLayer.getBoundingClientRect();
  el.style.left = (rect.left - appRect.left + rect.width / 2) + 'px';
  el.style.top  = (rect.top - appRect.top) + 'px';

  dom.floatLayer.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

/* ==========================================
   ANIMATIONS
   ========================================== */

function animateShake(el, intensity, duration) {
  el.animate([
    { transform: 'translateX(0)' },
    { transform: `translateX(-${intensity}px)` },
    { transform: `translateX(${intensity}px)` },
    { transform: `translateX(-${intensity / 2}px)` },
    { transform: 'translateX(0)' }
  ], { duration: duration, easing: 'ease-out' });
}

function animateFlash(el) {
  el.animate([
    { filter: 'brightness(1)' },
    { filter: 'brightness(3)' },
    { filter: 'brightness(1)' }
  ], { duration: 150 });
}

function animateAttack(el) {
  el.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.12)' },
    { transform: 'scale(1)' }
  ], { duration: 180, easing: 'ease-out' });
}

/* ==========================================
   SPRITES
   ========================================== */

function getHeroSprite() {
  const pct = (state.stomach / state.capacity) * 100;
  for (const tier of HERO_SPRITES) {
    if (pct <= tier.maxPct) return tier.src;
  }
  return HERO_SPRITES[HERO_SPRITES.length - 1].src;
}

function updateHeroSprite() {
  dom.heroImg.src = getHeroSprite();
}

/* ==========================================
   MONSTER
   ========================================== */

function spawnMonster() {
  state.monsterHp = 100;
  state.monsterMaxHp = 100;
  state.monsterDamage = 10;
  state.currentMonsterKey = MONSTER_ORDER[(state.wave - 1) % MONSTER_ORDER.length];
  const m = MONSTER_SPRITES[state.currentMonsterKey];
  dom.monsterImg.src = m.src;
  dom.monsterName.textContent = m.name;
}

/* ==========================================
   PLAYER ATTACK
   ========================================== */

function performAttacks(count) {
  const dmg = state.damage;
  for (let i = 0; i < count; i++) {
    if (state.monsterHp <= 0) break;
    state.monsterHp = Math.max(0, state.monsterHp - dmg);
  }

  const totalDmg = dmg * Math.min(count, Math.ceil(state.monsterHp / dmg + 1));
  addLog(`⚔️ ${count} coup(s) → ${dmg * count} dégâts`);
  playSound('hero_attack');
  animateAttack(dom.heroSprite);

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      animateShake(dom.monsterSprite, 6, 200);
      animateFlash(dom.monsterSprite);
      spawnFloat(`-${dmg}`, 'red', dom.monsterSprite);
    }, i * 120);
  }

  if (state.monsterHp <= 0) {
    onMonsterKilled();
  }

  updateUI();
}

function heroAutoAttack() {
  if (state.defeated) return;
  if (state.monsterHp <= 0) return;
  performAttacks(state.attackCount);
}

function heroManualAttack() {
  if (state.defeated) return;
  playSound('click');
  if (state.monsterHp <= 0) return;
  performAttacks(1);
}

/* ==========================================
   MONSTER ATTACK
   ========================================== */

function monsterAttack() {
  if (state.defeated) return;
  if (state.monsterHp <= 0) return;

  const dmg = state.monsterDamage;
  state.stomach += dmg;

  addLog(`💢 ${MONSTER_SPRITES[state.currentMonsterKey].name} → +${dmg} estomac`);
  playSound('monster_attack');
  animateShake(dom.heroSprite, 5, 200);
  animateFlash(dom.heroSprite);
  spawnFloat(`+${dmg}`, 'gold', dom.heroSprite);

  if (state.stomach >= state.capacity) {
    onDefeat();
  }

  updateUI();
}

/* ==========================================
   DIGESTION
   ========================================== */

function digest() {
  if (state.defeated) return;
  if (state.stomach > 0) {
    state.stomach = Math.max(0, state.stomach - state.digestion);
    updateUI();
  }
}

/* ==========================================
   MONSTER KILL
   ========================================== */

function onMonsterKilled() {
  state.gold += GOLD_PER_KILL;
  state.wave++;
  playSound('monster_kill');
  addLog(`🏆 Vaincu ! +${GOLD_PER_KILL}💰`);

  spawnMonster();
}

/* ==========================================
   DEFEAT
   ========================================== */

function onDefeat() {
  state.defeated = true;
  state.stomach = state.capacity;
  playSound('defeat');
  dom.defeatScreen.classList.remove('hidden');
  updateUI();
}

function restartGame() {
  state = createFreshState();
  dom.defeatScreen.classList.add('hidden');
  dom.log.innerHTML = '';
  spawnMonster();
  addLog(`⚔️ Vague 1 — ${MONSTER_SPRITES[state.currentMonsterKey].name} apparaît !`);
  updateUI();
}

/* ==========================================
   UPGRADES
   ========================================== */

function buyUpgrade(stat) {
  if (state.gold < UPGRADE_COST) return;
  state.gold -= UPGRADE_COST;
  state[stat] += 1;
  playSound('upgrade');
  addLog(`⬆️ ${stat} → ${state[stat]}`);
  updateUI();
}

/* ==========================================
   TIMERS
   ========================================== */

let autoAttackTimer = null;
let monsterTimer = null;
let digestTimer = null;

function startTimers() {
  stopTimers();
  autoAttackTimer = setInterval(heroAutoAttack, ATTACK_CYCLE_MS);
  monsterTimer = setInterval(monsterAttack, ATTACK_CYCLE_MS);
  digestTimer = setInterval(digest, DIGEST_TICK_MS);
}

function stopTimers() {
  if (autoAttackTimer) clearInterval(autoAttackTimer);
  if (monsterTimer) clearInterval(monsterTimer);
  if (digestTimer) clearInterval(digestTimer);
}

/* ==========================================
   INIT
   ========================================== */

function init() {
  cacheDom();
  state = createFreshState();
  spawnMonster();
  addLog(`⚔️ Vague 1 — ${MONSTER_SPRITES[state.currentMonsterKey].name} apparaît !`);
  updateUI();
  startTimers();

  dom.btnAttack.addEventListener('click', heroManualAttack);
  dom.btnRestart.addEventListener('click', restartGame);
  document.getElementById('up-damage').addEventListener('click', () => buyUpgrade('damage'));
  document.getElementById('up-attacks').addEventListener('click', () => buyUpgrade('attackCount'));
  document.getElementById('up-digestion').addEventListener('click', () => buyUpgrade('digestion'));
  document.getElementById('up-capacity').addEventListener('click', () => buyUpgrade('capacity'));
}

document.addEventListener('DOMContentLoaded', init);
