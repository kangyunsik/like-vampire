import {
  ABSOLUTE_ZERO, AREA_PERCENT, BASE_REGEN_INTERVAL, BLIZZARD_RADIUS_PER_RANK, BLIZZARD_SLOW_PERCENT, BLIZZARD_TICK_SECONDS,
  BOLT_SLOW_PERCENT, BOMB_MIN_SPREAD_POWER, BOMB_RADIUS_PERCENT, BOMB_SPREAD_BY_RANK, CHAIN_LIGHTNING,
  BOSS_HEALTH_MULTIPLIER, CAST_TIMES, CINDER_MARKS, CINDER_VORTEX, COMMON_TALENTS, COOLDOWNS,
  CRIT_CHANCE_PERCENT, CRIT_DAMAGE_PERCENT, EMBER_BRAND, FIELD_X, FIELD_Z, FIRE_BARRIER, FIRE_UNLOCKS, FLASHPOINT,
  FROST_BIND, FROST_CHAIN, FROST_CRITICAL, FROZEN_DAMAGE_PERCENT, FROZEN_ORB, GLACIER_WALL, GLOBAL_DAMAGE_PERCENT,
  GUST_FORWARD_DOT, HASTE_COOLDOWN_PERCENT,
  IGNITE_PERCENT, IGNITE_TICKS, IGNITE_UPGRADE_PERCENT, INFERNO_BURN_BOOST_PERCENT, INFERNO_HEART, MAGE_CLASSES, MAX_STATUS_DURATION_BONUS,
  MIN_REGEN_INTERVAL, PHOENIX, PILLAR_RADIUS_PERCENT, QUEST_BOSS, QUEST_BOSS_ATTACKS, RARITIES, RUN_TIME, RUN_XP_PERCENT,
  SLOW_MAX_PERCENT, SLOW_UPGRADE_PERCENT, SPELL_DAMAGE_PERCENT, SPELL_DAMAGE_PERK, SPELL_IGNITE_PERK, SPELL_LEARN_INTERVAL, SPELL_RARITY,
  SPELL_UNLOCKS, STAFF_RELEASE_PHASE, STAGES, STAGE_TIME, UPGRADES, WAVE_COUNT, WAVE_MOB_LIMIT, WAVE_TIME, isBoss, rangedElite,
  type BossAttackCue, type DamageSpell, type EnemyKind, type LearnableSpell, type MageClass, type Obstacle, type PerkId, type PickupTier,
  type PerkUpgrade, type Rarity, type SlowDebuff, type Spell, type SpellUnlock, type Upgrade, type UpgradeId,
} from './data';
import {
  COMMON_TALENT_PRICE, QUESTS, QUEST_BUFFS, QUEST_BUFF_IDS, QUEST_BUFF_SECONDS, QUEST_TALK_RADIUS,
  SUPPLIES, SUPPLY_KINDS, SUPPLY_LIFETIME, expeditionSites,
  type ActiveQuest, type QuestBuff, type QuestKind, type QuestNpc, type Supply, type SupplyKind,
} from './expedition';
import { permanentBonuses, type PermanentRanks } from './progression';
import { fieldDistanceSquared, nearestImage } from './field';

export type Point = { x: number; z: number };
type CastFront = Point & { dx: number; dz: number };
type Aimed = { front?: CastFront };
const STATS = {
  puff: { hp: 27, speed: 1.95, contact: 10, radius: .55, size: .95, xp: 3 },
  hare: { hp: 35, speed: 3.38, contact: 13, radius: .56, size: .89, xp: 4 },
  imp: { hp: 82, speed: 1.86, contact: 19, radius: .84, size: 1.34, xp: 7 },
  shard: { hp: 94, speed: 1.64, contact: 16, radius: .76, size: 1.15, xp: 8 },
  wisp: { hp: 51, speed: 3.28, contact: 14, radius: .56, size: 1, xp: 6 },
  warden: { hp: 460, speed: 2.10, contact: 30, radius: 1.38, size: 2.30, xp: 85 },
  prism: { hp: 940, speed: 1.65, contact: 30, radius: 1.5, size: 2.13, xp: 130 },
  queen: { hp: 1520, speed: 2.12, contact: 34, radius: 1.44, size: 2.35, xp: 190 },
  glacier: { hp: 2250, speed: 1.88, contact: 39, radius: 1.67, size: 2.68, xp: 250 },
  eclipse: { hp: 3250, speed: 2.24, contact: 44, radius: 1.64, size: 2.72, xp: 330 },
  scarab: { hp: 69, speed: 3.45, contact: 24, radius: .65, size: 1.08, xp: 9 },
  sentinel: { hp: 142, speed: 2.05, contact: 31, radius: .81, size: 1.28, xp: 13 },
  manta: { hp: 96, speed: 3.67, contact: 29, radius: .69, size: 1.12, xp: 11 },
  bloom: { hp: 162, speed: 2.18, contact: 35, radius: .88, size: 1.32, xp: 16 },
  archivist: { hp: 6900, speed: 2.30, contact: 50, radius: 1.71, size: 2.52, xp: 430 },
  leviathan: { hp: 9600, speed: 2.43, contact: 56, radius: 1.88, size: 2.72, xp: 560 },
  riftKeeper: { hp: 400, speed: 2.02, contact: 21, radius: 1.12, size: 1.88, xp: 85 },
  stormAdept: { hp: 119, speed: 2.86, contact: 0, radius: .68, size: 1.34, xp: 17 },
  riftOracle: { hp: 135, speed: 2.40, contact: 0, radius: .71, size: 1.44, xp: 19 },
  dawnArtillerist: { hp: 176, speed: 2.17, contact: 0, radius: .78, size: 1.53, xp: 22 },
  stormRegent: { hp: 12_600, speed: 2.34, contact: 56, radius: 1.78, size: 2.60, xp: 660 },
  riftMonarch: { hp: 16_000, speed: 2.48, contact: 60, radius: 1.80, size: 2.73, xp: 780 },
  dawnColossus: { hp: 21_000, speed: 2.37, contact: 64, radius: 1.93, size: 2.88, xp: 920 },
};
type SpawnVisibility = (x: number, z: number, size: number) => boolean;
type BossKind = typeof STAGES[number]['boss']['kind'];
type ChillSource = Spell | 'frost-critical';
type Chill = { time: number; power: number };
type Ignite = { remaining: number; ticks: number; next: number; interval?: number; sources: Map<DamageSpell, number> };

export type Enemy = Point & {
  id: number; kind: EnemyKind; maxHp: number; hp: number; size: number; radius: number; speed: number; contact: number;
  frozen: number; slow: number; flash: number; phase: number; angle: number; born: number; attackAt?: number;
  slowPower?: number; chills?: Partial<Record<ChillSource, Chill>>; ignite?: Ignite;
  freezeSource?: ChillSource;
  frostMarkUntil?: number; frostFreezeReadyAt?: number;
  attackPattern?: number; questNpcId?: number; detour?: { obstacle: Obstacle; side: number };
  bracing?: true; recoveringUntil?: number;
  dash?: { from: Point; to: Point; duration: number; elapsed: number; radius: number; damage: number; hit: boolean };
};
type Flight = Point & Aimed & { vx: number; vz: number; life: number; age?: number; target?: Enemy };
export type Shot = Flight & { kind: keyof typeof SHOT_SPEED; charged: boolean; hits: Set<number> };
export type Pickup = Point & { age: number; value: number; phase: number; tier: PickupTier; pull?: number };
export type Storm = Point & Aimed & { radius: number; life: number; maxLife: number; tick: number; fire?: boolean; pulses?: number; mobile?: boolean };
type Orb = Flight & { radius: number; baseRadius: number; tick: number };
type Lightning = { from: Point; front: CastFront; radius: number; delay: number; hit: Set<number>;
  limit: number; damage: number; decay: number; amplify: number; charged: boolean };
type Comet = Point & Aimed & { target: Enemy; radius: number; delay: number; windup: number };
type GroundImpact = Point & Aimed & { radius: number; delay: number; windup: number; spell: 'iceBloom' | 'meteor' };
type GlacierWall = Aimed & { from: Point; to: Point; width: number; life: number; maxLife: number; hits: Set<number> };
type Bomb = Point & { target: Enemy; delay: number; radius: number; spread: boolean; power: number };
export type Hazard = Point & {
  radius: number; delay: number; windup: number; damage: number; follow?: Point; cue?: BossAttackCue; elite?: true;
  slow?: SlowDebuff; charge?: { enemy: Enemy; to: Point; travel: number };
};
export type CombatEvent =
  | { kind: 'cast'; spell: Spell; x: number; z: number; radius?: number; to?: Point; path?: Point[]; heading?: number; bombPower?: number }
  | ({ kind: 'chain-lightning-hit'; from: Point; hop: number; charged: boolean; consumedChill: boolean } & Point)
  | ({ kind: 'lightning-charge' } & Point)
  | { kind: 'strike'; x: number; z: number; damage: number; frozen: boolean; fire?: true; critical?: true; dot?: true; spell?: DamageSpell }
  | { kind: 'spell-impact'; spell: Spell; x: number; z: number; radius: number; heading?: number }
  | { kind: 'ignite-burst'; spell: 'flashpoint' | 'livingBomb' | 'supernova'; x: number; z: number; radius: number; bombPower?: number }
  | { kind: 'hot-streak'; x: number; z: number }
  | ({ kind: 'frost-crit-freeze' } & Point)
  | { kind: 'interrupt'; source: ChillSource }
  | { kind: 'vanish' | 'collect'; x: number; z: number }
  | { kind: 'hurt'; x: number; z: number; damage: number }
  | { kind: 'wave'; wave: number }
  | { kind: 'boss'; boss: BossKind }
  | { kind: 'stage'; index: number }
  | ({ kind: 'enemy-warning' | 'enemy-blast'; radius: number; cue?: BossAttackCue; elite?: true; to?: Point } & Point)
  | { kind: 'comet-impact'; x: number; z: number; radius: number }
  | { kind: 'fireburst'; x: number; z: number; radius: number; spell: 'pyro' | 'livingBomb'; bombPower?: number }
  | ({ kind: 'supply'; count: number; supply: SupplyKind } & Point)
  | { kind: 'quest-boss' }
  | ({ kind: 'quest-signal' } & Point)
  | { kind: 'quest-complete'; quest: QuestKind; xp: number; gold: number; buff: QuestBuff }
  | { kind: 'block'; x: number; z: number; absorbed: number }
  | { kind: 'level' };

const cap = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function randomStream(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const dist = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const chilled = (enemy: Enemy) => enemy.slow > 0 || enemy.frozen > 0;
const forwardDepth = (front: CastFront, point: Point) => (point.x - front.x) * front.dx + (point.z - front.z) * front.dz;
const inFront = (point: Point, front?: CastFront) => !front || forwardDepth(front, point) >= -1e-7;
const angleFrom = (from: Point, to: Point) => Math.atan2(to.x - from.x, to.z - from.z);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function clipFrontEdge(point: Point, other: Point, front: CastFront) {
  if (inFront(point, front)) return point;
  const depth = forwardDepth(front, point);
  const t = -depth / (forwardDepth(front, other) - depth);
  return { x: point.x + (other.x - point.x) * t, z: point.z + (other.z - point.z) * t };
}
function segmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x, dz = to.z - from.z, x = point.x - from.x, z = point.z - from.z;
  const t = cap((x * dx + z * dz) / Math.max(1e-6, dx * dx + dz * dz), 0, 1);
  return (x - t * dx) ** 2 + (z - t * dz) ** 2;
}
type Boss = typeof STAGES[number]['boss'];
type Attack = NonNullable<Boss['attack']>;
type ChargeAttack = NonNullable<Boss['charge']>;
const bossAttacks = new Map<EnemyKind, Pick<Boss, 'attack' | 'alternate' | 'charge'> & { tempo: number }>(
  STAGES.map(({ boss }, index) => [boss.kind, { ...boss, tempo: 1 - index * .026 }]),
);
bossAttacks.set(QUEST_BOSS, { attack: QUEST_BOSS_ATTACKS[0], alternate: QUEST_BOSS_ATTACKS[1], tempo: 1 });
const SHOT_SPEED = { bolt: 20, lance: 31, fireball: 21, pyro: 24, phoenix: 19 };
const ADVANCED_RANGE = {
  frostChain: 12, iceBloom: 13, whiteout: 15, winterMoon: 14, absoluteZero: 0,
  emberFan: 0, flashpoint: 12.5, phoenix: 14, supernova: 15,
  rimeVolley: 0, frostBind: 11, glacierWall: 12.5, glacialCollapse: 14,
  frostGale: 0, auroraStrike: 15, chainLightning: 15,
  cinderMarks: 12, emberBrand: 13, meteor: 15, cinderVortex: 0, infernoHeart: 0,
};
type Advanced = keyof typeof ADVANCED_RANGE;
const FROST_ROTATION = ['absoluteZero', 'whiteout', 'winterMoon', 'iceBloom', 'glacierWall', 'frostBind',
  'frostChain', 'frostGale', 'chainLightning', 'auroraStrike', 'rimeVolley'] as const;
const FIRE_ROTATION = ['supernova', 'infernoHeart', 'flamestrike', 'meteor', 'phoenix', 'emberFan',
  'livingBomb', 'flashpoint', 'cinderVortex', 'cinderMarks', 'emberBrand'] as const;
const RARITY_ORDER = ['unique', 'epic', 'rare', 'common'] satisfies Rarity[];
const FOUNDATION: PerkId[] = ['precision', 'critical-force', 'study', 'reach', 'regeneration', 'status-time', 'shards', 'kindling', 'frozen-power'];
const BARRIER_TICK = .85;
const BOMB_FUSE = 1.3;
const BOMB_SPLIT_DECAY = .72;
const BOMB_SPLIT_EXPONENT = .75;
const IGNITE_TICK = .8;
const IGNITE_WEIGHTS: Partial<Record<DamageSpell, number>> = { emberFan: 1.75, phoenix: 1.8, cinderMarks: 1.7 };
const EMBER_FAN_RADIUS = 7.7;
const INFERNO_IMPACT = 146;
const SUPERNOVA_IMPACT = 78;
const SUPERNOVA_IGNITE_SHARE = .44;
const MOB_RECYCLE_RANGE = 135;
const RING_SECTORS = 12;
const RING_FULL = (1 << RING_SECTORS) - 1;
const RING_BURST = 4;
const RING_OPEN_SECONDS = 6;
const RING_INTERVAL = .57;
const RING_SPACING = 2 * Math.PI / RING_SECTORS;
const RING_ARCS = [0, .09, -.09, .18, -.18];
const RING_REACHES = [0, 4, 10, 18, 30, 49, 67, 88, 106, 118];
const TRAVEL_THRESHOLD = 22;
const TRAVEL_LANES = [1.40, -1.40, .67, -.67, 1.66, -1.66, Math.PI] as const;
const TRAVEL_ARCS = [0, .18, -.18, .34, -.34];
const MAGNET_PULL_TIME = 1.15;
const ELITE_HAZARD_LIMIT = 6;
const HEAVY_BOSSES = new Set<EnemyKind>(['archivist', 'leviathan', 'stormRegent', 'riftMonarch', 'dawnColossus']);
const spawnIntervals = STAGES.map(({ intervals }, stage) => {
  // A new atmosphere can switch the enemy roster, not pause an already busy wave.
  const ceiling = Math.min(...STAGES.slice(0, stage).map((prior) => prior.intervals[WAVE_COUNT - 1]));
  return intervals.map((interval) => Math.min(ceiling, interval));
});

export class Combat {
  time = 0;
  stageIndex = 0;
  wave = 1;
  kills = 0;
  status: 'playing' | 'upgrade' | 'lost' | 'won' = 'playing';
  level = 1;
  xp = 0;
  fingers = 0;
  hp = 100;
  maxHp = 100;
  barrier = 0;
  barrierTime = 0;
  private barrierTick = 0;
  private frostBindReclaim?: { target: Enemy; until: number };
  heat = 0;
  combustion = 0;
  inferno = 0;
  lightningCharge = false;
  cooldown = Object.fromEntries(Object.keys(COOLDOWNS).map((spell) => [spell, 0])) as Record<Spell, number>;
  limits = { ...COOLDOWNS };
  player = { x: 0, z: 0, heading: Math.PI, angle: Math.PI, moveAngle: Math.PI, moving: false, casting: 0, castSide: 0,
    pose: 'bolt' as Spell, immunity: 0, hurt: 0, slow: 0, slowPercent: 0 };
  readonly movement: Point = { x: 0, z: 0 };
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  pickups: Pickup[] = [];
  supplies: Supply[] = [];
  quest: ActiveQuest | null = null;
  gold = 0;
  readonly buffs: Record<QuestBuff, number> = { power: 0, swift: 0, vital: 0 };
  storms: Storm[] = [];
  orbs: Orb[] = [];
  private lightning: Lightning[] = [];
  comets: Comet[] = [];
  impacts: GroundImpact[] = [];
  walls: GlacierWall[] = [];
  bombs: Bomb[] = [];
  hazards: Hazard[] = [];
  events: CombatEvent[] = [];
  readonly spellDamage = new Map<DamageSpell, number>();
  readonly spells: Set<Spell>;
  perks: Partial<Record<PerkId, number>> = {};
  choices: Upgrade[] = [];
  private nextSpawn = .68;
  private waveRing = RING_FULL;
  private waveRingCursor = 0;
  private reinforcementSlot = 0;
  private spawnDirection = 0;
  private trailDirection = 0;
  private trailDistance = 0;
  private trailRedistributeAt = 0;
  private trailShiftSide = 1;
  private opening = 0;
  private pendingBosses: BossKind[] = [];
  private retryBossAt = 0;
  private serial = 0;
  private xpRemainder = 0;
  private recoveryElapsed = 0;
  private readonly expedition;
  private readonly obstacles: Obstacle[];
  private obstacleColumn = Infinity;
  private obstacleRow = Infinity;
  private readonly expeditionRng: () => number;
  private readonly attackRng: () => number;
  private nextSupply: Record<SupplyKind, number> = { heart: SUPPLIES.heart.first, magnet: SUPPLIES.magnet.first };
  private readonly permanent;

  constructor(
    private readonly terrainObstacles: readonly Obstacle[] = [],
    private rng = Math.random,
    private visibleSpawn?: SpawnVisibility,
    readonly mageClass: MageClass = 'frost',
    ranks?: PermanentRanks,
  ) {
    this.obstacles = terrainObstacles.map((obstacle) => ({ ...obstacle }));
    this.permanent = permanentBonuses(ranks);
    this.maxHp = Math.round(this.maxHp * this.permanent.health);
    this.hp = this.maxHp;
    this.spells = new Set([MAGE_CLASSES[mageClass].starter]);
    if (visibleSpawn) this.opening = 4;
    else for (const [x, z] of [[-5.2, -3], [5.6, -2.1], [-1.4, 7.4], [2.8, -7.8]]) this.spawnAt('puff', x, z);
    const seed = Math.floor(this.rng() * 0x100000000) >>> 0;
    this.expeditionRng = randomStream(seed);
    // Warning placement shouldn't change the random stream for crits, loot or spawns.
    this.attackRng = randomStream(seed ^ 0x9e3779b9);
    this.expedition = expeditionSites(this.expeditionRng, terrainObstacles);
  }

  get stage() { return STAGES[this.stageIndex]; }
  get clearedStages() { return this.status === 'won' ? STAGES.length : this.stageIndex; }
  get stageTime() { return cap(this.time - this.stageIndex * STAGE_TIME, 0, STAGE_TIME); }
  get goal() { return 9 + (this.level - 1) * 4 + Math.floor(Math.max(0, this.level - 22) ** 2 * .28); }
  get waveRecovery() { return Math.round(14 * this.permanent.recovery); }
  get recoveryInterval() { return Math.max(MIN_REGEN_INTERVAL, BASE_REGEN_INTERVAL - this.permanent.regeneration - this.perk('regeneration')); }
  get moveSpeed() {
    return 5.35 * this.permanent.speed * (1 + this.perk('stride') * .12) *
      this.buffMultiplier('swift') * (1 - this.player.slowPercent / 100);
  }
  get questNpcs() { return this.expedition.npcs; }
  get closestQuestNpc() {
    if (this.quest) return undefined;
    let closest = Infinity;
    return this.questNpcs.reduce<QuestNpc | undefined>((nearest, npc) => {
      if (npc.done) return nearest;
      const distance = fieldDistanceSquared(this.player, npc);
      if (distance >= closest) return nearest;
      closest = distance;
      return npc;
    }, undefined);
  }
  get nearbyQuestNpc() {
    const npc = this.closestQuestNpc;
    return npc && fieldDistanceSquared(this.player, npc) <= QUEST_TALK_RADIUS ** 2 ? npc : undefined;
  }
  get questBoss() {
    return this.quest?.npc.quest === 'guardian' ? this.enemies.find((enemy) => enemy.kind === QUEST_BOSS && enemy.hp > 0) : undefined;
  }
  get nextQuestSignal() {
    let nearest: Point | undefined, min = Infinity;
    for (const point of this.quest?.signals ?? []) {
      const distance = fieldDistanceSquared(this.player, point);
      if (distance < min) { nearest = point; min = distance; }
    }
    return nearest;
  }
  questXp(kind: QuestKind) { return Math.round(QUESTS[kind].xp * this.stage.hpScale); }
  buffTime(kind: QuestBuff) { return Math.max(0, this.buffs[kind] - this.time); }
  private buffMultiplier(kind: QuestBuff) { return this.buffTime(kind) > 0 ? QUEST_BUFFS[kind].multiplier : 1; }
  acceptQuest(id: number) {
    const npc = this.nearbyQuestNpc;
    if (this.status !== 'playing' || !npc || npc.id !== id) return false;
    const signals = npc.quest === 'signals' ? this.expedition.signalSites(npc, this.supplies) : [];
    if (npc.quest === 'signals' && signals.length !== QUESTS.signals.target) return false;
    this.quest = { npc, progress: 0, xp: this.questXp(npc.quest), spawned: 0, nextSpawn: this.time + .65, signals };
    return true;
  }

  buyCommonTalent(id: PerkId) {
    const talent = COMMON_TALENTS.find((entry) => entry.id === id);
    if (!talent || this.status !== 'playing' || this.gold < COMMON_TALENT_PRICE || !this.canUpgrade(talent)) return false;
    this.gold -= COMMON_TALENT_PRICE;
    this.applyPerk(talent);
    return true;
  }
  perkRankLimit(upgrade: PerkUpgrade) {
    if (upgrade.id === 'regeneration') return Math.ceil(BASE_REGEN_INTERVAL - MIN_REGEN_INTERVAL - this.permanent.regeneration);
    if (upgrade.id === 'status-time') return Math.ceil(MAX_STATUS_DURATION_BONUS - this.permanent['status-time']);
    return upgrade.max;
  }
  private canUpgrade(upgrade: PerkUpgrade) {
    const max = this.perkRankLimit(upgrade);
    return (max === null || this.perk(upgrade.id) < max) && (!('requires' in upgrade) || this.spells.has(upgrade.requires));
  }
  private perk(id: PerkId | null) { return id === null ? 0 : this.perks[id] ?? 0; }
  private get statusDurationBonus() { return Math.min(this.permanent['status-time'] + this.perk('status-time'), MAX_STATUS_DURATION_BONUS); }
  private area(base: number, extraPercent = 0) { return base * (1 + (this.perk('reach') * AREA_PERCENT + extraPercent) / 100); }
  private get novaRadius() { return this.area(4.1, this.perk('wide') * 25); }
  private get blizzardRadius() { return this.area(3.65, this.perk('storm') * BLIZZARD_RADIUS_PER_RANK); }
  private get flameRadius() { return this.area(3.4, this.perk('flamestrike-radius') * PILLAR_RADIUS_PERCENT); }
  private get bombRadius() { return this.area(3.0, this.perk('bomb-radius') * BOMB_RADIUS_PERCENT); }

  step(dt: number, input: Point) {
    if (this.status !== 'playing') return;
    this.time = Math.min(RUN_TIME, this.time + dt);
    if (this.time >= RUN_TIME - 1e-6) {
      this.time = RUN_TIME;
      this.status = 'won';
      return;
    }
    this.expireBuffs();
    const stageIndex = Math.floor((this.time + 1e-6) / STAGE_TIME);
    if (stageIndex !== this.stageIndex) {
      this.time = Math.max(this.time, stageIndex * STAGE_TIME);
      this.enterStage(stageIndex);
    }
    const wave = Math.min(WAVE_COUNT, Math.floor((this.stageTime + 1e-6) / WAVE_TIME) + 1);
    if (wave !== this.wave) {
      this.wave = wave;
      this.resetWaveRing();
      this.hp = Math.min(this.maxHp, this.hp + this.waveRecovery);
      this.events.push({ kind: 'wave', wave });
      if (wave === WAVE_COUNT) this.pendingBosses.push(this.stage.boss.kind);
    }

    const p = this.player;
    this.alignObstacles();
    for (const key of Object.keys(this.cooldown) as Spell[]) this.cooldown[key] = Math.max(0, this.cooldown[key] - dt);
    p.casting = Math.max(0, p.casting - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.immunity = Math.max(0, p.immunity - dt);
    p.slow = Math.max(0, p.slow - dt);
    if (p.slow <= 1e-7) { p.slow = 0; p.slowPercent = 0; }
    this.combustion = Math.max(0, this.combustion - dt);
    this.inferno = Math.max(0, this.inferno - dt);
    if (this.barrierTime > 0) {
      this.barrierTime = Math.max(0, this.barrierTime - dt);
      if (!this.barrierTime) this.barrier = 0;
    }
    const length = Math.hypot(input.x, input.z);
    p.moving = length > .01;
    p.angle = p.heading;
    const prevX = p.x, prevZ = p.z;
    if (p.moving) {
      const dx = input.x / length, dz = input.z / length;
      const speed = this.moveSpeed;
      p.moveAngle = Math.atan2(dx, dz);
      p.x += dx * speed * dt;
      p.z += dz * speed * dt;
      this.alignObstacles();
      this.resolveObstacles(p, .34);
    }
    const movedX = p.x - prevX, movedZ = p.z - prevZ;
    this.movement.x = dt > 0 ? movedX / dt : 0;
    this.movement.z = dt > 0 ? movedZ / dt : 0;
    this.trackTravel(movedX, movedZ, dt);
    this.alignEntities();

    const boss = this.pendingBosses[0];
    if (boss && this.time >= this.retryBossAt) {
      if (this.spawn(boss, 9)) {
        this.pendingBosses.shift();
        this.events.push({ kind: 'boss', boss });
      } else this.retryBossAt = this.time + .24;
    }
    if (this.opening && this.stageIndex === 0) {
      while (this.opening && this.spawn('puff', 8.6 + (4 - this.opening) * .6)) this.opening--;
    }

    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) this.spawnPack();
    this.spawnQuestEnemies();
    this.redistributeTrail();

    this.updateLightning(dt);
    this.autoSpells(input);
    this.updateEnemies(dt);
    if (this.status !== 'playing') return;
    this.updateHazards(dt);
    if (this.hp === 0) return;
    this.recoverHealth(dt);
    this.updateBarrierAura(dt);
    this.updateIgnites(dt);
    this.updateShots(dt);
    this.updateStorms(dt);
    this.updateOrbs(dt);
    this.updateComets(dt);
    this.updateImpacts(dt);
    this.updateWalls(dt);
    this.updateBombs(dt);
    this.armEnemyAttacks();
    this.updateQuestSignals();
    this.updateSupplies();
    this.updatePickups(dt);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private enterStage(index: number) {
    this.stageIndex = index;
    this.wave = 1;
    this.resetWaveRing();
    this.hp = this.maxHp;
    this.events.push({ kind: 'stage', index });
  }

  private resetWaveRing() {
    this.waveRing = RING_FULL;
    this.waveRingCursor = 0;
    if (Number.isFinite(this.nextSpawn)) this.nextSpawn = Math.min(this.nextSpawn, .32);
  }

  private alignObstacles() {
    const p = this.player, col = Math.floor(p.x / 32), row = Math.floor(p.z / 32);
    if (col === this.obstacleColumn && row === this.obstacleRow) return;
    this.obstacleColumn = col;
    this.obstacleRow = row;
    for (const [i, obstacle] of this.terrainObstacles.entries()) {
      this.obstacles[i].x = nearestImage(obstacle.x, p.x, FIELD_X);
      this.obstacles[i].z = nearestImage(obstacle.z, p.z, FIELD_Z);
    }
  }

  private alignEntities() {
    // Keep movement and projectiles continuous; only distant periodic copies change sheets.
    const { x, z } = this.player;
    const align = (point: Point) => {
      point.x = nearestImage(point.x, x, FIELD_X);
      point.z = nearestImage(point.z, z, FIELD_Z);
    };
    for (const enemy of this.enemies) {
      const beforeX = enemy.x, beforeZ = enemy.z;
      align(enemy);
      const dx = enemy.x - beforeX, dz = enemy.z - beforeZ;
      if (dx || dz) {
        delete enemy.detour;
        if (enemy.dash) {
          enemy.dash.from.x += dx; enemy.dash.from.z += dz;
          enemy.dash.to.x += dx; enemy.dash.to.z += dz;
        }
      }
    }
    for (const pickup of this.pickups) align(pickup);
    for (const npc of this.questNpcs) align(npc);
    for (const supply of this.supplies) align(supply);
    for (const point of this.quest?.signals ?? []) align(point);
    for (const arc of this.lightning) {
      align(arc.front);
      align(arc.from);
    }
    for (const hazard of this.hazards) {
      const beforeX = hazard.x, beforeZ = hazard.z;
      align(hazard);
      if (hazard.charge) {
        hazard.charge.to.x += hazard.x - beforeX;
        hazard.charge.to.z += hazard.z - beforeZ;
      }
    }
  }

  private recoverHealth(dt: number) {
    this.recoveryElapsed += dt;
    const interval = this.recoveryInterval;
    const ticks = Math.floor((this.recoveryElapsed + 1e-7) / interval);
    if (ticks > 0) {
      this.recoveryElapsed = Math.max(0, this.recoveryElapsed - ticks * interval);
      this.hp = Math.min(this.maxHp, this.hp + ticks);
    }
  }

  private expireBuffs() {
    for (const id of QUEST_BUFF_IDS) {
      if (!this.buffs[id] || this.buffs[id] > this.time + 1e-7) continue;
      this.buffs[id] = 0;
      if (id === 'vital') {
        this.maxHp /= QUEST_BUFFS.vital.multiplier;
        this.hp = Math.ceil(this.hp / QUEST_BUFFS.vital.multiplier);
      }
    }
  }

  private advanceQuest(kind: QuestKind, count = 1) {
    const quest = this.quest;
    if (!quest || quest.npc.quest !== kind) return;
    const rule = QUESTS[kind];
    quest.progress += count;
    if (quest.progress < rule.target) return;
    this.quest = null;
    quest.npc.done = true;
    this.gold += rule.gold;
    const xp = this.gainXp(quest.xp);
    const buff = QUEST_BUFF_IDS[Math.floor(this.expeditionRng() * QUEST_BUFF_IDS.length)];
    if (buff === 'vital' && !this.buffs.vital) {
      this.maxHp *= QUEST_BUFFS.vital.multiplier;
      this.hp *= QUEST_BUFFS.vital.multiplier;
    }
    this.buffs[buff] = this.time + QUEST_BUFF_SECONDS;
    this.events.push({ kind: 'quest-complete', quest: kind, xp, gold: rule.gold, buff });
  }

  private mobKind() {
    const pool = this.stage.pools[Math.min(this.wave - 1, 2)];
    const roll = this.rng();
    return (pool.find(([, limit]) => roll < limit) ?? pool[pool.length - 1])[0];
  }

  private get mobApproachBuffer() {
    return Math.min(11, this.stageIndex * 1.18 + (this.wave - 1) * .52);
  }

  private trackTravel(dx: number, dz: number, dt: number) {
    if (!this.visibleSpawn) return;
    const distance = Math.hypot(dx, dz);
    if (distance < dt * .5) {
      this.trailDistance = Math.max(0, this.trailDistance - dt * 13);
      return;
    }
    const direction = Math.atan2(dx, dz), turn = angleDelta(direction, this.trailDirection);
    if (Math.abs(turn) > Math.PI * .35) {
      this.trailDistance = 0;
      this.trailDirection = direction;
    } else this.trailDirection += turn * Math.min(1, 6 * dt);
    this.trailDistance = Math.min(TRAVEL_THRESHOLD + 10, this.trailDistance + distance);
  }

  private redistributeTrail() {
    if (!this.visibleSpawn || this.trailDistance < TRAVEL_THRESHOLD || this.time < this.trailRedistributeAt) return;
    this.trailRedistributeAt = this.time + 1.08;
    const { x, z } = this.player, forwardX = Math.sin(this.trailDirection), forwardZ = Math.cos(this.trailDirection);
    const trailing = this.enemies.find((enemy) => {
      if (enemy.hp <= 0 || isBoss(enemy.kind) || enemy.questNpcId !== undefined || rangedElite(enemy.kind) ||
        this.time - enemy.born < 3 || enemy.frozen || enemy.slow || enemy.ignite) return false;
      const dx = enemy.x - x, dz = enemy.z - z;
      return dx * dx + dz * dz > 43 ** 2 && dx * forwardX + dz * forwardZ < -34 &&
        !this.visibleSpawn!(enemy.x, enemy.z, enemy.size);
    });
    if (!trailing) return;
    const side = this.trailShiftSide;
    const point = this.reinforcementPoint(trailing.kind, 15, this.trailDirection + side * 1.39, [0, 5, 12, 22, 40, 67, 91]) ??
      this.reinforcementPoint(trailing.kind, 15, this.trailDirection - side * 1.39, [0, 5, 12, 22, 40, 67, 91]);
    if (!point) return;
    this.trailShiftSide = -side;
    trailing.x = point.x; trailing.z = point.z;
    delete trailing.detour;
  }

  private spawnPack() {
    const wave = this.wave - 1;
    const cadence = this.stageIndex === 0 && wave < 2 ? .88 : .97;
    this.nextSpawn = spawnIntervals[this.stageIndex][wave] * cadence * (.88 + this.rng() * .24);
    // The first stage eases the player in. Later stages never reset to small packs.
    const pressure = this.stageIndex ? WAVE_COUNT : this.wave;
    const pack = (pressure >= 3 ? 3 : 2) + Number(pressure === WAVE_COUNT && this.rng() < .23);
    const regular = (enemy: Enemy) => enemy.hp > 0 && enemy.questNpcId === undefined && !isBoss(enemy.kind);
    let population = 0, nearby = 0;
    for (const enemy of this.enemies) {
      if (!regular(enemy)) continue;
      population++;
      if (dist(enemy, this.player) < 18 ** 2) nearby++;
    }
    // Keep the same number of arrivals while giving players time to react when they
    // are already surrounded. Later stages also have faster monsters.
    const approach = this.mobApproachBuffer + Math.min(13, Math.max(0, nearby - 9) * .85);
    const reserve = () => {
      if (population < WAVE_MOB_LIMIT) return -1;
      const remote = this.enemies.findIndex((enemy) => regular(enemy) && dist(enemy, this.player) > MOB_RECYCLE_RANGE ** 2 &&
        !this.visibleSpawn?.(enemy.x, enemy.z, enemy.size));
      return remote < 0 ? null : remote;
    };
    const arrive = (kind: EnemyKind, point: Point, remote: number) => {
      this.spawnAt(kind, point.x, point.z);
      if (remote < 0) population++;
      else this.enemies.splice(remote, 1);
    };

    // Open each wave from interleaved sectors, not four fixed compass points. A slot
    // that is still visible is retried instead of cramming its mobs into the rear.
    if (this.waveRing && this.stageTime - wave * WAVE_TIME < RING_OPEN_SECONDS) {
      let arrived = 0;
      const start = this.waveRingCursor;
      const rotation = (this.stageIndex * WAVE_COUNT + wave) * 2.399963;
      for (let i = 0; i < RING_SECTORS && arrived < RING_BURST; i++) {
        const turn = (start + i) % RING_SECTORS;
        const sector = turn * 5 % RING_SECTORS;
        const slot = 1 << sector;
        if (!(this.waveRing & slot)) continue;
        const remote = reserve();
        if (remote === null) break;
        const kind = this.mobKind(), radius = 13.5 + (sector % 3) * 1.5 + approach;
        const point = this.reinforcementPoint(kind, radius, rotation + sector * RING_SPACING, RING_REACHES, RING_ARCS);
        if (!point) continue;
        arrive(kind, point, remote);
        this.waveRing &= ~slot;
        this.waveRingCursor = (turn + 1) % RING_SECTORS;
        arrived++;
      }
      if (arrived) {
        if (this.waveRing) this.nextSpawn = Math.min(this.nextSpawn, RING_INTERVAL);
        return;
      }
    }

    let tried = false, arrived = false;
    for (let i = 0; i < pack; i++) {
      const remote = reserve();
      if (remote === null) break;
      tried = true;
      const kind = this.mobKind(), point = this.packPoint(kind, approach);
      if (!point) continue;
      arrive(kind, point, remote);
      arrived = true;
    }
    if (tried && !arrived) this.nextSpawn = .26;
  }

  private packPoint(kind: EnemyKind, approach: number) {
    const index = this.reinforcementSlot++;
    const sector = index * 5 % RING_SECTORS;
    const rotation = Math.floor(index / RING_SECTORS) * .71;
    const radius = 11 + this.rng() * 6 + approach, jitter = (this.rng() - .5) * .11;
    if (this.visibleSpawn && this.trailDistance >= TRAVEL_THRESHOLD) {
      const lane = TRAVEL_LANES[index % TRAVEL_LANES.length];
      const forward = this.reinforcementPoint(kind, radius, this.trailDirection + lane + jitter, RING_REACHES) ??
        this.reinforcementPoint(kind, radius, this.trailDirection - lane + jitter, RING_REACHES);
      if (forward) return forward;
    }
    const heading = rotation + sector * RING_SPACING + jitter;
    // Search farther along the selected sector before yielding to the next half-step.
    // In particular, an open view ahead can no longer quietly turn every wave into a rear wave.
    return this.reinforcementPoint(kind, radius, heading, RING_REACHES, RING_ARCS) ??
      this.reinforcementPoint(kind, radius + 2, heading + RING_SPACING * .5, RING_REACHES, RING_ARCS);
  }

  private offscreenPoint(kind: EnemyKind, angle: number, distance: number): Point | undefined {
    const stats = STATS[kind], clearance = stats.radius * .71 + .22;
    const x = this.player.x + Math.sin(angle) * distance, z = this.player.z + Math.cos(angle) * distance;
    if (this.visibleSpawn?.(x, z, stats.size)) return;
    const point = { x, z };
    if (this.obstacles.some((o) => dist(o, point) < (o.radius + clearance) ** 2)) return;
    if (this.enemies.some((e) => e.hp > 0 && dist(e, point) < (e.radius + stats.radius + .45) ** 2)) return;
    return point;
  }

  private reinforcementPoint(kind: EnemyKind, radius: number, angle: number, reaches: readonly number[], arcs = TRAVEL_ARCS) {
    for (const extra of reaches) for (const spread of arcs) {
      const point = this.offscreenPoint(kind, angle + spread, Math.min(MOB_RECYCLE_RANGE - .5, radius + extra));
      if (point) return point;
    }
  }

  private spawnQuestEnemies() {
    const quest = this.quest;
    if (!quest || this.time < quest.nextSpawn) return;
    if (quest.npc.quest === 'guardian') {
      if (!quest.spawned) {
        if (this.spawn(QUEST_BOSS, 11.5, quest.npc.id)) {
          quest.spawned = 1;
          this.events.push({ kind: 'quest-boss' });
        } else quest.nextSpawn = this.time + .35;
      }
      return;
    }
    if (quest.npc.quest !== 'ambush' || quest.spawned >= QUESTS.ambush.target) return;
    const end = Math.min(QUESTS.ambush.target, (Math.floor(quest.spawned / 6) + 1) * 6);
    while (quest.spawned < end) {
      if (!this.spawn(this.mobKind(), 10.5 + quest.spawned % 6 * 1.15, quest.npc.id)) {
        quest.nextSpawn = this.time + .35;
        return;
      }
      quest.spawned++;
    }
    quest.nextSpawn = this.time + 5.5;
  }

  private updateQuestSignals() {
    const quest = this.quest;
    if (quest?.npc.quest !== 'signals') return;
    const visited = quest.signals.findIndex((point) => dist(point, this.player) <= 1.65 ** 2);
    if (visited === -1) return;
    const [point] = quest.signals.splice(visited, 1);
    this.events.push({ kind: 'quest-signal', ...point });
    this.advanceQuest('signals');
  }

  private updateSupplies() {
    this.supplies = this.supplies.filter((supply) => supply.expires > this.time);
    for (const kind of SUPPLY_KINDS) {
      if (this.time < this.nextSupply[kind]) continue;
      const point = this.expedition.supplySite(this.player, [...this.supplies, ...(this.quest?.signals ?? [])]);
      if (point) this.supplies.push({ ...point, kind, expires: this.time + SUPPLY_LIFETIME });
      this.nextSupply[kind] = this.time + (point ? SUPPLIES[kind].interval : 2);
    }
    for (let i = this.supplies.length - 1; i >= 0; i--) {
      const supply = this.supplies[i];
      if (dist(this.player, supply) > 1.55 ** 2) continue;
      this.supplies.splice(i, 1);
      const count = supply.kind === 'magnet' ? this.pickups.length : 0;
      if (supply.kind === 'heart') this.hp = this.maxHp;
      else for (const gem of this.pickups) gem.pull = MAGNET_PULL_TIME;
      this.events.push({ kind: 'supply', supply: supply.kind, x: supply.x, z: supply.z, count });
    }
  }

  private armEnemyAttacks() {
    const { x, z } = this.player;
    let eliteZones = this.hazards.reduce((count, hazard) => count + Number(Boolean(hazard.elite)), 0);
    for (const enemy of this.enemies) {
      if (enemy.attackAt === undefined || enemy.attackAt > this.time || enemy.hp <= 0 || enemy.frozen || enemy.bracing || enemy.dash) continue;
      const ranged = rangedElite(enemy.kind);
      if (dist(enemy, this.player) > (ranged?.range ?? 15) ** 2) continue;
      if (ranged && eliteZones + ranged.attack.offsets.length > ELITE_HAZARD_LIMIT) continue;
      const patterns = bossAttacks.get(enemy.kind);
      const cycle = enemy.attackPattern ?? 0;
      const tempo = patterns?.tempo ?? 1;
      const turn = cycle % (patterns?.charge ? 3 : 2);
      if (turn === 2 && patterns?.charge && this.planCharge(enemy, patterns.charge, tempo)) {
        enemy.attackPattern = cycle + 1;
        continue;
      }
      const attack: Attack | undefined = ranged?.attack ?? (turn === 1 ? patterns?.alternate : undefined) ?? patterns?.attack;
      if (!attack) continue;
      const angle = Math.atan2(z - enemy.z, x - enemy.x);
      const reach = this.attackReach(attack.windup, attack.radius);
      const footprint = Math.max(0, ...attack.offsets.map(Math.abs));
      const spacing = footprint ? Math.min(1, reach * .82 / footprint) : 1;
      const aim = this.enemyAim(Math.max(0, reach - footprint * spacing));
      const mark = (dx: number, dz: number, delay: number) => {
        const offset = { x: aim.x + dx, z: aim.z + dz };
        const hazard: Hazard = {
          x, z,
          radius: attack.radius, delay: attack.windup + delay, windup: attack.windup, damage: attack.damage, cue: attack.cue,
          ...(ranged ? { elite: true } as const : {}),
          ...(delay ? { follow: offset } : {}),
          ...(attack.slow ? { slow: attack.slow } : {}),
        };
        this.placeGroundWarning(hazard, offset);
        this.hazards.push(hazard);
        if (ranged) eliteZones++;
        if (!delay) this.hazardEvent('enemy-warning', hazard);
      };
      for (const [i, distance] of attack.offsets.entries()) {
        const offset = distance * spacing;
        const delay = (attack.cadence ?? 0) * i;
        if (attack.pattern === 'line') {
          mark(Math.cos(angle) * offset, Math.sin(angle) * offset, delay);
        } else if (attack.pattern === 'chase') {
          const a = angle + i * 2.39996;
          mark(Math.cos(a) * offset, Math.sin(a) * offset, delay);
        } else if (attack.pattern === 'ring' && offset) {
          for (let i = 0; i < 6; i++) {
            const a = angle + i * Math.PI / 3;
            mark(Math.cos(a) * offset, Math.sin(a) * offset, delay);
          }
        } else {
          mark(-Math.sin(angle) * offset, Math.cos(angle) * offset, delay);
          if (offset && attack.pattern === 'cross') mark(Math.cos(angle) * offset, Math.sin(angle) * offset, delay);
        }
      }
      enemy.attackPattern = cycle + 1;
      const lastBlast = attack.windup + (attack.cadence ?? 0) * (attack.offsets.length - 1);
      enemy.attackAt = this.time + Math.max(attack.interval * tempo, lastBlast + .95);
    }
  }

  private attackReach(windup: number, radius: number) {
    // Keep the outer edge in the movement budget when the warning is wide enough to permit it.
    return Math.max(0, this.moveSpeed * windup - radius);
  }

  private enemyAim(reach: number) {
    const bearing = this.attackRng();
    const direction = this.player.moving ? this.player.moveAngle + (bearing - .5) * Math.PI * 1.42 : bearing * 2 * Math.PI;
    const offset = reach * (.26 + .40 * this.attackRng());
    return { x: Math.sin(direction) * offset, z: Math.cos(direction) * offset };
  }

  private placeGroundWarning(hazard: Hazard, offset: Point) {
    const reach = this.attackReach(cap(hazard.delay, 0, hazard.windup), hazard.radius);
    const length = Math.hypot(offset.x, offset.z), scale = length > reach ? reach / length : 1;
    hazard.x = this.player.x + offset.x * scale;
    hazard.z = this.player.z + offset.z * scale;
  }

  private planCharge(enemy: Enemy, attack: ChargeAttack, tempo: number) {
    const p = this.player, gap = Math.sqrt(dist(enemy, p));
    if (gap < .01 || gap > attack.distance) return false;
    const reach = this.attackReach(attack.windup, attack.radius);
    const jitter = this.enemyAim(Math.min(3, reach));
    const overshoot = Math.min(2.5, reach * .56);
    const aimX = (p.x - enemy.x) / gap * overshoot + jitter.x, aimZ = (p.z - enemy.z) / gap * overshoot + jitter.z;
    const distance = Math.hypot(aimX, aimZ), scale = distance > reach ? reach / distance : 1;
    const x = p.x + aimX * scale - enemy.x, z = p.z + aimZ * scale - enemy.z, aimed = Math.hypot(x, z);
    if (aimed < .01) return false;
    const dx = x / aimed, dz = z / aimed;
    const length = Math.min(attack.distance, aimed), margin = enemy.radius * .71;
    const steps = Math.ceil(length / .30);
    let clear = 0;
    for (let i = 1; i <= steps; i++) {
      const at = i / steps * length;
      const x = enemy.x + dx * at, z = enemy.z + dz * at;
      if (this.obstacles.some((obstacle) => dist(obstacle, { x, z }) < (obstacle.radius + margin + .12) ** 2)) break;
      clear = at;
    }
    if (clear < 2.7) return false;
    const to = { x: enemy.x + dx * clear, z: enemy.z + dz * clear };
    if (dist(p, to) > reach * reach + 1e-7) return false;
    const hazard: Hazard = { x: enemy.x, z: enemy.z, radius: attack.radius, damage: attack.damage, cue: attack.cue,
      delay: attack.windup, windup: attack.windup, charge: { enemy, to, travel: attack.travel } };
    enemy.bracing = true;
    enemy.angle = Math.atan2(dx, dz);
    enemy.attackAt = this.time + Math.max(attack.interval * tempo, attack.windup + attack.travel + .95);
    this.hazards.push(hazard);
    this.hazardEvent('enemy-warning', hazard);
    return true;
  }

  private hazardEvent(kind: 'enemy-warning' | 'enemy-blast', hazard: Hazard) {
    this.events.push({ kind, x: hazard.x, z: hazard.z, radius: hazard.radius, cue: hazard.cue,
      ...(hazard.elite ? { elite: true } as const : {}), ...(hazard.charge ? { to: hazard.charge.to } : {}) });
  }

  private updateHazards(dt: number) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hazard = this.hazards[i];
      if (hazard.charge && (hazard.charge.enemy.hp <= 0 || hazard.charge.enemy.frozen)) {
        const { enemy } = hazard.charge;
        if (enemy.hp > 0 && enemy.freezeSource) this.events.push({ kind: 'interrupt', source: enemy.freezeSource });
        delete enemy.bracing;
        this.hazards.splice(i, 1);
        continue;
      }
      const waiting = hazard.delay > hazard.windup;
      hazard.delay -= dt;
      if (hazard.follow && hazard.delay <= hazard.windup) {
        this.placeGroundWarning(hazard, hazard.follow);
        delete hazard.follow;
      }
      if (waiting && hazard.delay <= hazard.windup) this.hazardEvent('enemy-warning', hazard);
      if (hazard.delay > 0) continue;
      this.hazards.splice(i, 1);
      this.hazardEvent('enemy-blast', hazard);
      if (hazard.charge) {
        const { enemy, to, travel } = hazard.charge;
        delete enemy.bracing;
        enemy.dash = { from: { x: hazard.x, z: hazard.z }, to, duration: travel, elapsed: 0,
          radius: hazard.radius, damage: hazard.damage, hit: false };
      } else if (dist(hazard, this.player) <= hazard.radius ** 2) this.hurtPlayer(hazard.damage, hazard.slow);
    }
  }

  private spawn(kind: EnemyKind, radius: number, questNpcId?: number) {
    const a = this.rng() * Math.PI * 2;
    if (this.visibleSpawn) {
      const sector = this.spawnDirection++;
      const heading = sector * 2.399963 + (a - Math.PI) * .16;
      let point = this.reinforcementPoint(kind, radius, heading, [0, 4, 8, 15, 23]);
      if (point) {
        this.spawnAt(kind, point.x, point.z, questNpcId);
        return true;
      }
      for (const extra of [0, 4, 8, 14, 23, 36, 56]) {
        const start = a + extra * .27;
        for (let i = 0; i < 24; i++) {
          const angle = start + (i * 7 % 24) * Math.PI / 12;
          point = this.offscreenPoint(kind, angle, radius + extra);
          if (point) {
            this.spawnAt(kind, point.x, point.z, questNpcId);
            return true;
          }
        }
      }
      return false;
    }
    this.spawnAt(kind, this.player.x + Math.sin(a) * radius, this.player.z + Math.cos(a) * radius, questNpcId);
    return true;
  }

  private spawnAt(kind: EnemyKind, x: number, z: number, questNpcId?: number) {
    const stats = STATS[kind];
    const wave = this.wave - 1;
    const scale = kind === QUEST_BOSS ? BOSS_HEALTH_MULTIPLIER * this.stage.hpScale
      : isBoss(kind) ? BOSS_HEALTH_MULTIPLIER : this.stage.hpScale * (1 + wave * .115);
    const hp = Math.round(stats.hp * scale);
    const speedScale = 1 + this.stageIndex * .018 + wave * .007;
    const e: Enemy = {
      x, z, id: ++this.serial, kind, hp, maxHp: hp, phase: this.rng() * Math.PI * 2,
      size: stats.size, speed: stats.speed * speedScale * (.91 + this.rng() * .18), contact: stats.contact,
      radius: stats.radius, frozen: 0, slow: 0, flash: 0, angle: 0, born: this.time, questNpcId,
    };
    if (bossAttacks.get(kind)?.attack) e.attackAt = this.time + 2.3;
    else if (rangedElite(kind)) e.attackAt = this.time + 1.5 + e.phase / (Math.PI * 2) * 2.4;
    this.resolveObstacles(e, e.radius * .6);
    this.enemies.push(e);
  }

  private resolveObstacles(point: Point, radius: number) {
    for (const o of this.obstacles) {
      const dx = point.x - o.x, dz = point.z - o.z, limit = o.radius + radius;
      if (Math.abs(dx) >= limit || Math.abs(dz) >= limit) continue;
      const d = Math.hypot(dx, dz);
      if (d < .001) point.z += limit;
      else if (d < limit) {
        point.x = o.x + dx / d * limit;
        point.z = o.z + dz / d * limit;
      }
    }
  }

  private pursuit(enemy: Enemy, dx: number, dz: number, length: number, step: number) {
    let ux = dx / length, uz = dz / length;
    const radius = enemy.radius * .71;
    let blocker: Obstacle | undefined, nearest = length;
    for (const obstacle of this.obstacles) {
      const range = radius + obstacle.radius + .28;
      const ox = obstacle.x - enemy.x, oz = obstacle.z - enemy.z;
      if (Math.abs(ox) > range + 2.5 || Math.abs(oz) > range + 2.5) continue;
      const ahead = ox * ux + oz * uz;
      if (ahead <= 0 || ahead > range + 2.5 || ahead >= nearest || Math.abs(ux * oz - uz * ox) >= range) continue;
      blocker = obstacle;
      nearest = ahead;
    }
    if (blocker) {
      const ox = blocker.x - enemy.x, oz = blocker.z - enemy.z, distance = Math.hypot(ox, oz);
      const side = enemy.detour?.obstacle === blocker ? enemy.detour.side : ux * oz - uz * ox > 0 ? -1 : 1;
      if (enemy.detour?.obstacle !== blocker) enemy.detour = { obstacle: blocker, side };
      const tangent = side * (Math.asin(Math.min(.99, (radius + blocker.radius + .28) / distance)) + .19);
      const cosine = Math.cos(tangent), sine = Math.sin(tangent);
      ux = (ox * cosine - oz * sine) / distance;
      uz = (ox * sine + oz * cosine) / distance;
    } else if (enemy.detour) delete enemy.detour;
    enemy.angle = Math.atan2(ux, uz);
    enemy.x += ux * step;
    enemy.z += uz * step;
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      this.updateChills(enemy, dt);
      enemy.frozen = Math.max(0, enemy.frozen - dt);
      if (enemy.dash) {
        if (enemy.frozen) {
          if (enemy.freezeSource) this.events.push({ kind: 'interrupt', source: enemy.freezeSource });
          delete enemy.dash;
        }
        else this.moveCharge(enemy, dt);
        if (!this.hp) return;
        continue;
      }
      if (enemy.bracing) continue;
      const dx = p.x - enemy.x, dz = p.z - enemy.z;
      const length = Math.hypot(dx, dz);
      const ranged = rangedElite(enemy.kind);
      if (length > .001) {
        if (!enemy.frozen) {
          const step = enemy.speed * (enemy.slow ? 1 - (enemy.slowPower ?? .47) : 1) * dt;
          if (step > 0 && (!ranged || length > ranged.hold)) this.pursuit(enemy, dx, dz, length, step);
          else if (ranged) enemy.angle = Math.atan2(dx, dz);
        }
      }
      this.resolveObstacles(enemy, enemy.radius * .71);
    }
    this.separateEnemies();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || enemy.frozen || enemy.bracing || enemy.dash || this.time < (enemy.recoveringUntil ?? 0)) continue;
      if (enemy.contact && dist(enemy, p) < (enemy.radius + .36) ** 2) {
        this.hurtPlayer(enemy.contact);
        if (!this.hp) return;
      }
    }
  }

  private separateEnemies() {
    const size = 4.1, stride = 1024;
    const enemies = this.enemies;
    if (enemies.length < 2) return;
    const mass = (e: Enemy) => e.dash || e.bracing ? 0 : e.frozen ? .22 : 1;
    for (let pass = 0; pass < 5; pass++) {
      const grid = new Map<number, number[]>();
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.hp <= 0) continue;
        const key = Math.floor(e.x / size) + stride * Math.floor(e.z / size);
        const cell = grid.get(key);
        if (cell) cell.push(i);
        else grid.set(key, [i]);
      }
      let changed = false;
      for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        if (a.hp <= 0) continue;
        const key = Math.floor(a.x / size) + stride * Math.floor(a.z / size);
        for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
          const cell = grid.get(key + x + stride * z);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            const b = enemies[j], min = a.radius + b.radius;
            let dx = a.x - b.x, dz = a.z - b.z;
            if (Math.abs(dx) >= min || Math.abs(dz) >= min) continue;
            const gap = Math.hypot(dx, dz);
            if (gap >= min) continue;
            const ma = mass(a), mb = mass(b), total = ma + mb;
            if (!total) continue;
            if (gap > 1e-6) { dx /= gap; dz /= gap; }
            else {
              const angle = ((a.id + 1) * 29 + (b.id + 1) * 17) * 2.399963;
              dx = Math.sin(angle); dz = Math.cos(angle);
            }
            const overlap = (min - gap + .015) / total;
            if (ma) {
              a.x += dx * overlap * ma; a.z += dz * overlap * ma;
              this.resolveObstacles(a, a.radius * .71);
            }
            if (mb) {
              b.x -= dx * overlap * mb; b.z -= dz * overlap * mb;
              this.resolveObstacles(b, b.radius * .71);
            }
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  private moveCharge(enemy: Enemy, dt: number) {
    const dash = enemy.dash!;
    const before = { x: enemy.x, z: enemy.z };
    dash.elapsed = Math.min(dash.duration, dash.elapsed + dt);
    const t = dash.elapsed / dash.duration;
    const next = { x: dash.from.x + (dash.to.x - dash.from.x) * t, z: dash.from.z + (dash.to.z - dash.from.z) * t };
    // Solid, braced bosses should not merge when two charged lanes cross.
    const blocked = this.enemies.some((other) => other !== enemy && other.hp > 0 && (other.bracing || other.dash) &&
      dist(other, next) < dist(other, before) && segmentDistance(other, before, next) < (enemy.radius + other.radius) ** 2);
    if (!blocked) {
      enemy.x = next.x; enemy.z = next.z;
    }
    if (!dash.hit && segmentDistance(this.player, before, enemy) <= dash.radius ** 2) {
      this.hurtPlayer(dash.damage);
      dash.hit = true;
    }
    if (blocked || t >= 1) {
      delete enemy.dash;
      // After a charge, give the player a beat to clear the body before contact damage resumes.
      enemy.recoveringUntil = this.time + .42;
    }
  }

  private chill(enemy: Enemy, source: ChillSource, time: number, power: number) {
    time += this.statusDurationBonus;
    const effects = enemy.chills ??= {};
    effects[source] = { time, power: Math.min(power, SLOW_MAX_PERCENT / 100) };
    enemy.slow = Math.max(enemy.slow, time);
    enemy.slowPower = Math.max(enemy.slowPower ?? 0, effects[source].power);
  }

  private updateChills(enemy: Enemy, dt: number) {
    if (!enemy.chills) {
      enemy.slow = Math.max(0, enemy.slow - dt);
      return;
    }
    enemy.slow = 0;
    enemy.slowPower = 0;
    for (const [source, effect] of Object.entries(enemy.chills)) {
      effect.time -= dt;
      if (effect.time <= 0) delete enemy.chills[source as ChillSource];
      else {
        enemy.slow = Math.max(enemy.slow, effect.time);
        enemy.slowPower = Math.max(enemy.slowPower, effect.power);
      }
    }
  }

  private freeze(enemy: Enemy, source: ChillSource, time: number) {
    const ratio = HEAVY_BOSSES.has(enemy.kind) ? .36 : isBoss(enemy.kind) ? .48 : 1;
    const duration = (time + this.statusDurationBonus) * ratio;
    if (duration > enemy.frozen) {
      enemy.frozen = duration;
      enemy.freezeSource = source;
    }
  }

  private frostCritical(enemy: Enemy) {
    const { slowTime, slowPercent, markTime, freezeTime, recovery } = FROST_CRITICAL;
    this.chill(enemy, 'frost-critical', slowTime, slowPercent / 100);
    if (this.time < (enemy.frostFreezeReadyAt ?? 0)) return;
    if ((enemy.frostMarkUntil ?? 0) > this.time) {
      delete enemy.frostMarkUntil;
      enemy.frostFreezeReadyAt = this.time + recovery;
      this.freeze(enemy, 'frost-critical', freezeTime);
      this.events.push({ kind: 'frost-crit-freeze', x: enemy.x, z: enemy.z });
    } else enemy.frostMarkUntil = this.time + markTime;
  }

  private updateBarrierAura(dt: number) {
    if (!this.barrier) return;
    this.barrierTick -= dt;
    if (this.barrierTick > 0) return;
    this.barrierTick += BARRIER_TICK;
    const fire = this.mageClass === 'fire';
    const radius = this.area(3.1);
    const targets = this.inside(this.player, radius, .25);
    if (!targets.length) return;
    for (const enemy of targets) {
      if (fire) this.damage(enemy, 'fireBarrier', 9);
      else this.chill(enemy, 'barrier', 1.20, .34);
    }
    this.events.push({ kind: 'spell-impact', spell: fire ? 'fireBarrier' : 'barrier', x: this.player.x, z: this.player.z, radius });
  }

  private hurtPlayer(damage: number, slow?: SlowDebuff) {
    const p = this.player;
    if (p.immunity > 0 || this.hp === 0) return;
    if (!this.barrier) this.cast(this.mageClass === 'fire' ? 'fireBarrier' : 'barrier', null, { x: 0, z: 0 });
    p.immunity = .85;
    if (slow) {
      p.slow = Math.max(p.slow, slow.seconds);
      p.slowPercent = Math.max(p.slowPercent, slow.percent);
    }
    const absorbed = Math.min(damage, this.barrier);
    if (absorbed) {
      this.barrier -= absorbed;
      if (!this.barrier) this.barrierTime = 0;
      if (this.mageClass === 'fire') p.immunity = FIRE_BARRIER.guardTime;
      this.events.push({ kind: 'block', x: p.x, z: p.z, absorbed });
    }
    if (damage === absorbed) return;
    const lost = Math.min(this.hp, damage - absorbed);
    this.hp -= lost;
    p.hurt = .36;
    this.events.push({ kind: 'hurt', x: p.x, z: p.z, damage: lost });
    if (!this.hp) this.status = 'lost';
  }

  private castFront(): CastFront {
    const { x, z, heading } = this.player;
    return { x, z, dx: Math.sin(heading), dz: Math.cos(heading) };
  }

  private nearby(range: number, front?: CastFront) {
    return this.inside(this.player, range, 0, front).sort((a, b) => dist(a, this.player) - dist(b, this.player));
  }

  private inside(center: Point, radius: number, padding = 0, front?: CastFront) {
    return this.enemies.filter((enemy) => enemy.hp > 0 && dist(enemy, center) <= (radius + enemy.radius * padding) ** 2 && inFront(enemy, front));
  }

  private cluster(targets: Enemy[], radius: number, weight: (enemy: Enemy) => number = () => 1) {
    const front = this.castFront();
    let focus: Enemy | undefined, most = -1;
    for (const target of targets) {
      let score = 0;
      for (const enemy of this.enemies) if (enemy.hp > 0 && dist(enemy, target) <= radius ** 2 && inFront(enemy, front)) score += weight(enemy);
      if (score > most) { most = score; focus = target; }
    }
    return focus;
  }

  private shot(kind: Shot['kind'], angle: number, target?: Enemy, charged = false) {
    const front = this.castFront(), heading = this.player.heading;
    const direction = heading + cap(angleDelta(angle, heading), -Math.PI / 2, Math.PI / 2);
    const dx = Math.sin(direction), dz = Math.cos(direction), speed = SHOT_SPEED[kind];
    this.shots.push({ x: front.x + dx * .48, z: front.z + dz * .48, vx: dx * speed, vz: dz * speed,
      life: kind === 'lance' ? .50 : kind === 'phoenix' ? .84 : .70, target, kind, charged, hits: new Set(), front,
      age: -CAST_TIMES[kind] * STAFF_RELEASE_PHASE });
  }

  private startCooldown(spell: Spell, frequency = 1) {
    this.limits[spell] = COOLDOWNS[spell] * this.permanent.cooldown * ((1 - HASTE_COOLDOWN_PERCENT / 100) ** this.perk('haste')) / frequency;
    this.cooldown[spell] = this.limits[spell];
  }

  private autoBolt() {
    const targets = this.nearby(11, this.castFront()).slice(0, this.perk('twins') + 1);
    if (!targets.length) return;
    const p = this.player;
    if (!p.casting || p.pose === 'bolt') this.poseFor('bolt', targets[0]);
    this.startCooldown('bolt', 1 + this.perk('cold') * .18);
    for (const enemy of targets) this.shot('bolt', Math.atan2(enemy.x - p.x, enemy.z - p.z), enemy);
    this.events.push({ kind: 'cast', spell: 'bolt', x: p.x, z: p.z });
  }

  private autoSpells(input: Point) {
    const p = this.player;
    const canAnimate = () => p.casting === 0 || p.pose === 'bolt' || p.pose === 'fireball';
    const ready = (spell: LearnableSpell) => this.spells.has(spell) && this.cooldown[spell] === 0;
    const novaRadius = this.novaRadius;
    if (ready('nova') && canAnimate()) {
      const front = this.castFront();
      if (this.enemies.some((e) => e.hp > 0 && e.frozen < .3 && dist(e, p) <= (novaRadius + e.radius * .3) ** 2 && inFront(e, front))) {
        this.cast('nova', null, input);
      }
    }
    if (ready('blink') && this.enemies.some((e) =>
      e.hp > 0 && !e.frozen && dist(e, p) < (e.radius + 1.35) ** 2)) {
      const escape = this.escapeDirection(input);
      if (escape) this.cast('blink', null, escape);
    }
    if (this.mageClass === 'fire') {
      this.autoFire(input);
      return;
    }
    if (canAnimate()) {
      for (const spell of FROST_ROTATION) if (ready(spell) && this.cast(spell, null, input)) break;
      if (canAnimate() && ready('lance')) this.cast('lance', null, input);
      if (canAnimate() && ready('glacialCollapse')) this.cast('glacialCollapse', null, input);
      if (canAnimate() && ready('comet')) this.cast('comet', null, input);
      if (canAnimate() && ready('orb')) this.cast('orb', null, input);
      if (canAnimate() && ready('blizzard')) {
        const focus = this.cluster(this.nearby(14, this.castFront()), this.blizzardRadius);
        if (focus) this.cast('blizzard', focus, input);
      }
    }
    if (this.cooldown.bolt === 0) this.autoBolt();
  }

  private autoFire(input: Point) {
    const p = this.player;
    const targets = this.nearby(Math.max(15, this.area(EMBER_FAN_RADIUS)), this.castFront());
    const target = targets[0];
    if (!target) return;
    if (p.casting === 0 || p.pose === 'fireball') {
      if (targets.length >= 3 || targets.some((e) => isBoss(e.kind))) {
        this.cast('combustion', null, input);
      }
      if (!p.casting || p.pose === 'fireball') {
        if (!(this.heat === 2 && this.cast('pyro', null, input)) &&
          !((this.heat < 2 || !this.spells.has('pyro')) && this.cast('fireBlast', null, input))) {
          for (const spell of FIRE_ROTATION) if (this.cast(spell, null, input)) break;
        }
      }
    }
    if (this.cooldown.fireball > 0 || dist(target, p) > 11 ** 2) return;
    const angle = Math.atan2(target.x - p.x, target.z - p.z);
    if (!p.casting || p.pose === 'fireball') this.poseFor('fireball', target);
    this.startCooldown('fireball');
    this.shot('fireball', angle, target);
    this.events.push({ kind: 'cast', spell: 'fireball', x: p.x, z: p.z });
  }

  private advanceHeat(critical: boolean) {
    if (this.heat >= 2) return;
    this.heat = critical ? this.heat + 1 : 0;
    if (this.heat === 2) this.events.push({ kind: 'hot-streak', x: this.player.x, z: this.player.z });
  }

  private rollCrit(spell: DamageSpell) {
    const hot = spell === 'fireball' || spell === 'pyro';
    return (hot && this.combustion > 0) || this.rng() < Math.min(1,
      ((hot ? 36 + this.perk('scorch') * 7 : 5) + this.perk('precision') * CRIT_CHANCE_PERCENT) / 100);
  }

  private escapeDirection(input: Point): Point | null {
    const threats = this.nearby(14);
    const clearance = (point: Point) => Math.min(...threats.map((e) => Math.sqrt(dist(e, point)) - e.radius));
    const current = clearance(this.player);
    const length = 5.55 + .78 * this.perk('stride');
    const inputLength = Math.hypot(input.x, input.z);
    let best: Point | null = null, bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2;
      const direction = { x: Math.sin(angle), z: Math.cos(angle) };
      const end = { x: this.player.x + direction.x * length, z: this.player.z + direction.z * length };
      this.resolveObstacles(end, .34);
      if (this.obstacles.some((obstacle) => dist(end, obstacle) < (obstacle.radius + .34) ** 2 - 1e-6)) continue;
      const space = clearance(end);
      if (dist(end, this.player) < 4 || space < current + .8) continue;
      const alignment = inputLength ? (direction.x * input.x + direction.z * input.z) / inputLength : 0;
      const score = space + alignment * .45;
      if (score > bestScore) { bestScore = score; best = direction; }
    }
    return best;
  }

  cast(spell: LearnableSpell, aim: Point | null, input: Point) {
    if (this.status !== 'playing' || !this.spells.has(spell) || this.cooldown[spell] > 0) return false;
    if (spell in ADVANCED_RANGE) return this.castAdvanced(spell as Advanced);
    const p = this.player, { x, z } = p, front = this.castFront();
    const range = spell === 'comet' || spell === 'fireBlast' || spell === 'pyro' || spell === 'flamestrike' || spell === 'livingBomb'
      ? 12.5 : spell === 'orb' ? 11.5 : spell === 'lance' || spell === 'blizzard' ? 15.5 : 0;
    const targets = range ? this.nearby(range, front) : [];
    const target = spell === 'lance' ? targets.find((e) => e.frozen > 0) ?? targets[0]
      : spell === 'livingBomb' ? targets.find((e) => e.ignite) ?? targets[0] : targets[0];
    if (spell === 'blizzard' && aim && !inFront(aim, front)) return false;
    if (range && !target && !(spell === 'blizzard' && aim)) return false;
    if ((spell === 'barrier' || spell === 'fireBarrier') && this.barrier > 0) return false;
    if (spell === 'pyro' && this.heat < 2) return false;
    if (spell === 'livingBomb' && this.bombs.some((bomb) => !bomb.spread)) return false;
    const novaTargets = spell === 'nova' ? this.inside(p, this.novaRadius, .3, front) : [];
    if (spell === 'nova' && !novaTargets.length) return false;
    this.startPose(spell, (spell === 'blizzard' && aim ? aim : target) ?? novaTargets[0]);
    if (spell === 'nova') {
      const radius = this.novaRadius;
      for (const e of novaTargets) {
        this.freeze(e, 'nova', 2.4 + Math.min(3, this.perk('wide')) * .4);
        this.damage(e, 'nova', 18);
      }
      this.events.push({ kind: 'cast', spell, x, z, radius, heading: p.heading });
    } else if (spell === 'lance' && target) {
      const direction = angleFrom(p, target);
      this.shot('lance', direction, undefined, this.fingers > 0);
      if (this.fingers > 0) this.fingers--;
      this.events.push({ kind: 'cast', spell, x, z });
    } else if (spell === 'blizzard') {
      const focus = aim ?? target ?? p;
      const dist = Math.hypot(focus.x - x, focus.z - z);
      const range = dist > 14 ? 14 / dist : 1;
      const to = { x: x + (focus.x - x) * range, z: z + (focus.z - z) * range };
      const radius = this.blizzardRadius;
      const life = 4.5 + Math.min(3, this.perk('storm'));
      this.storms.push({ ...to, radius, life, maxLife: life, tick: .04, front });
      this.events.push({ kind: 'cast', spell, x, z, to, radius });
    } else if (spell === 'blink') {
      const angle = Math.hypot(input.x, input.z) > .01 ? Math.atan2(input.x, input.z) : p.moveAngle;
      const length = 5.55 + .78 * this.perk('stride');
      p.x += Math.sin(angle) * length;
      p.z += Math.cos(angle) * length;
      p.moveAngle = angle;
      p.immunity = Math.max(p.immunity, .48);
      this.alignObstacles();
      this.resolveObstacles(p, .34);
      this.alignEntities();
      this.events.push({ kind: 'cast', spell, x, z, to: { x: p.x, z: p.z } });
    } else if (spell === 'barrier' || spell === 'fireBarrier') {
      this.barrier = spell === 'barrier' ? 36 + 12 * this.perk('bulwark') : FIRE_BARRIER.absorption + 12 * this.perk('fire-ward');
      this.barrierTime = 6;
      this.barrierTick = .13;
      this.events.push({ kind: 'cast', spell, x, z });
    } else if (spell === 'orb' && target) {
      const angle = Math.atan2(target.x - x, target.z - z);
      const dx = Math.sin(angle), dz = Math.cos(angle);
      const radius = this.area(FROZEN_ORB.radius, this.perk('vortex') * 15);
      this.orbs.push({ x: x + dx * .6, z: z + dz * .6, vx: dx * 7.4, vz: dz * 7.4,
        radius, baseRadius: radius, life: 2.35, tick: .04, front,
        age: -CAST_TIMES.orb * STAFF_RELEASE_PHASE });
      this.events.push({ kind: 'cast', spell, x, z });
    } else if (spell === 'comet' && target) {
      for (const [i, enemy] of targets.slice(0, 3).entries()) {
        const windup = .42 + i * .08;
        this.comets.push({ x: enemy.x, z: enemy.z, target: enemy, radius: this.area(1.32), delay: windup, windup, front });
      }
      this.events.push({ kind: 'cast', spell, x, z });
    } else if (spell === 'combustion') {
      this.combustion = 6;
      this.events.push({ kind: 'cast', spell, x, z });
    } else if (target && (spell === 'fireBlast' || spell === 'pyro' || spell === 'flamestrike' || spell === 'livingBomb')) {
      let to = { x: target.x, z: target.z };
      if (spell === 'fireBlast') {
        this.damage(target, spell, 24, false, true);
        const radius = this.area(2.55);
        for (const enemy of this.inside(target, radius, 0, front)) if (enemy !== target) this.damage(enemy, spell, 19, false, false);
        this.events.push({ kind: 'spell-impact', spell, ...to, radius });
        this.advanceHeat(true);
      } else if (spell === 'pyro') {
        this.heat = 0;
        this.shot('pyro', Math.atan2(target.x - x, target.z - z), target);
      } else if (spell === 'livingBomb') {
        const previous = this.bombs.findIndex((bomb) => bomb.target === target);
        if (previous !== -1) this.bombs.splice(previous, 1);
        this.bombs.push({ ...to, target, delay: BOMB_FUSE, radius: this.bombRadius, spread: false, power: 1 });
      } else {
        const radius = this.flameRadius;
        const cluster = this.cluster(targets, radius) ?? target;
        to = { x: cluster.x, z: cluster.z };
        for (const e of this.inside(to, radius, 0, front)) this.damage(e, spell, 48);
        this.storms.push({ ...to, radius, life: 4, maxLife: 4, tick: .82, fire: true, front });
        this.events.push({ kind: 'spell-impact', spell, ...to, radius });
      }
      this.events.push({ kind: 'cast', spell, x, z, to });
    }
    return true;
  }

  private startPose(spell: Spell, target?: Point) {
    this.startCooldown(spell);
    this.poseFor(spell, target);
  }

  private poseFor(spell: Spell, target?: Point) {
    const p = this.player;
    p.pose = spell;
    p.casting = CAST_TIMES[spell];
    p.castSide = target ? Math.sin(angleFrom(p, target) - p.heading) : 0;
  }

  private castAdvanced(spell: Advanced) {
    const { x, z, heading } = this.player, center = { x, z }, front = this.castFront();
    const base = {
      frostChain: FROST_CHAIN.jumpRadius, iceBloom: 3.15, whiteout: 4.3, winterMoon: 4.05, absoluteZero: ABSOLUTE_ZERO.reach,
      emberFan: EMBER_FAN_RADIUS, flashpoint: FLASHPOINT.reach, phoenix: PHOENIX.width, supernova: 5.9,
      rimeVolley: 9, frostBind: .86, glacierWall: GLACIER_WALL.halfLength, glacialCollapse: 3.7,
      frostGale: 8.15, auroraStrike: 2.85, chainLightning: 4.9,
      cinderMarks: .7, emberBrand: EMBER_BRAND.reach, meteor: 4.15, cinderVortex: CINDER_VORTEX.reach, infernoHeart: 7.4,
    }[spell];
    const sizeBonus = spell === 'glacierWall' ? this.perk('glacier-wall-size') * GLACIER_WALL.sizeStep : 0;
    const radius = this.area(base, sizeBonus);
    const targets = this.nearby(ADVANCED_RANGE[spell] || radius, front);
    const remaining = (e: Enemy) => e.ignite?.remaining ?? 0;
    const canBrand = (e: Enemy) => remaining(e) > 0 && !e.ignite?.interval;
    let target: Enemy | undefined = targets[0];
    if ((spell === 'absoluteZero' || spell === 'infernoHeart') && targets.length < 3 && !targets.some((e) => isBoss(e.kind))) return false;
    if (spell === 'winterMoon') target = this.cluster(targets.filter(chilled), radius, (e) => chilled(e) ? 2 : 1);
    if (spell === 'frostBind') {
      const eligible = targets.filter((e) => e.slow > 0 && !e.frozen);
      target = eligible.find((e) => e.bracing) ?? eligible[0];
    }
    if (spell === 'auroraStrike') target = targets.find((e) => isBoss(e.kind)) ?? targets.find((e) => rangedElite(e.kind)) ?? target;
    if (spell === 'chainLightning' || spell === 'frostChain') {
      const linked = (e: Enemy) => this.enemies.some((near) =>
        near.hp > 0 && near !== e && inFront(near, front) && dist(e, near) <= radius ** 2);
      target = spell === 'chainLightning'
        ? this.cluster(targets.filter((e) => isBoss(e.kind) || linked(e)), radius, (e) => chilled(e) ? 2 : 1)
        : targets.find(linked) ?? target;
    }
    if (spell === 'glacialCollapse') {
      const frozen = targets.filter((e) => e.frozen > 0);
      const centers = frozen.filter((e) => isBoss(e.kind) || frozen.some((other) => other !== e && dist(e, other) <= radius ** 2));
      target = this.cluster(centers, radius, (e) => e.frozen > 0 ? 2 : 1);
    }
    const marks = spell === 'cinderMarks' ? targets.sort((a, b) => remaining(a) - remaining(b)).slice(0, CINDER_MARKS.targets) : [];
    if (spell === 'cinderMarks') target = marks[0];
    if (spell === 'emberBrand') target = targets.filter(canBrand)
      .sort((a, b) => remaining(b) - remaining(a))[0];
    if (spell === 'supernova') {
      const burning = targets.filter((e) => remaining(e) > 0);
      const centers = burning.filter((e) => (isBoss(e.kind) && remaining(e) >= 26) ||
        burning.some((other) => other !== e && dist(e, other) <= radius * radius));
      target = this.cluster(centers, radius, (e) => remaining(e) * SUPERNOVA_IGNITE_SHARE + 28);
    }
    if (spell === 'flashpoint') target = targets.filter((e) => remaining(e) > 0 && !this.bombs.some((bomb) => !bomb.spread && bomb.target === e))
      .sort((a, b) => remaining(b) - remaining(a))[0];
    if (spell === 'iceBloom' || spell === 'whiteout' || spell === 'meteor') target = this.cluster(targets, radius);
    if (!target) return false;
    this.startPose(spell, target);
    const to = { x: target.x, z: target.z };
    let path: Point[] | undefined;
    switch (spell) {
      case 'chainLightning': {
        const charged = this.lightningCharge;
        this.lightningCharge = false;
        const arc: Lightning = {
          from: center, front, radius, delay: CHAIN_LIGHTNING.hopDelay, hit: new Set(), charged,
          limit: 1 + CHAIN_LIGHTNING.bounces + CHAIN_LIGHTNING.extra * this.perk('chain-lightning-links'),
          damage: CHAIN_LIGHTNING.damage * (charged ? 1 + CHAIN_LIGHTNING.chargePercent / 100 : 1),
          decay: 1 - Math.max(0, CHAIN_LIGHTNING.loss - CHAIN_LIGHTNING.mitigation * this.perk('chain-lightning-loss')) / 100,
          amplify: CHAIN_LIGHTNING.amplify + CHAIN_LIGHTNING.amplifyStep * this.perk('chain-lightning-amplify'),
        };
        this.events.push({ kind: 'cast', spell, x, z, to, radius });
        this.hitLightning(arc, target);
        this.lightning.push(arc);
        return true;
      }
      case 'frostChain': {
        const limit = FROST_CHAIN.targets + FROST_CHAIN.extra * this.perk('frost-chain-links');
        path = [center];
        const hit = new Set<number>();
        let next: Enemy | undefined = target;
        for (let i = 0; i < limit && next; i++) {
          const current: Enemy = next;
          hit.add(current.id);
          path.push({ x: current.x, z: current.z });
          this.chill(current, spell, 2.4, .54);
          this.damage(current, spell, FROST_CHAIN.damage * (1 - FROST_CHAIN.loss / 100) ** i);
          if (i + 1 < limit) next = this.nextChainTarget(current, front, radius, hit);
        }
        break;
      }
      case 'iceBloom':
      case 'meteor': {
        const windup = spell === 'meteor' ? .74 : .55;
        this.impacts.push({ ...to, radius, delay: windup, windup, spell, front });
        break;
      }
      case 'rimeVolley': {
        const aim = angleDelta(angleFrom(center, to), heading);
        path = [-.30, 0, .30].map((arc) => {
          const angle = heading + cap(aim + arc, -Math.PI / 2, Math.PI / 2);
          return { x: x + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius };
        });
        const width = this.area(.26);
        for (const e of this.inside(center, radius, .8, front)) {
          if (!path.some((end) => segmentDistance(e, center, end) <= (width + e.radius * .65) ** 2)) continue;
          this.chill(e, spell, 1.9, .49);
          this.damage(e, spell, 27);
        }
        break;
      }
      case 'frostBind': {
        const spread = this.perk('frost-bind-spread');
        const others = spread ? this.inside(to, this.area(FROST_BIND.spreadRange), 0, front)
          .filter((e) => e !== target && e.slow > 0 && !e.frozen)
          .sort((a, b) => dist(a, to) - dist(b, to)).slice(0, spread) : [];
        if (this.perk('frost-bind-reclaim')) this.frostBindReclaim = { target, until: this.time + FROST_BIND.reclaimTime };
        this.freeze(target, spell, FROST_BIND.freeze);
        this.damage(target, spell, FROST_BIND.damage);
        this.events.push({ kind: 'spell-impact', spell, ...to, radius });
        if (others.length) path = [to];
        for (const enemy of others) {
          const point = { x: enemy.x, z: enemy.z };
          path!.push(point);
          this.freeze(enemy, spell, FROST_BIND.spreadFreeze);
          this.damage(enemy, spell, FROST_BIND.damage * FROST_BIND.spreadDamage / 100);
          this.events.push({ kind: 'spell-impact', spell, ...point, radius: radius * .73 });
        }
        break;
      }
      case 'glacierWall': {
        const angle = Math.atan2(to.x - x, to.z - z);
        const dx = Math.cos(angle) * radius, dz = -Math.sin(angle) * radius;
        const left = { x: to.x - dx, z: to.z - dz }, right = { x: to.x + dx, z: to.z + dz };
        path = [clipFrontEdge(left, right, front), clipFrontEdge(right, left, front)];
        const life = GLACIER_WALL.life + GLACIER_WALL.lifeStep * this.perk('glacier-wall-life');
        this.walls.push({ from: path[0], to: path[1], width: this.area(GLACIER_WALL.halfWidth, sizeBonus), life, maxLife: life, hits: new Set(), front });
        break;
      }
      case 'whiteout':
        this.storms.push({ ...to, radius, life: 5.2, maxLife: 5.2, tick: .12, pulses: 0, front });
        break;
      case 'winterMoon':
        for (const e of this.inside(to, radius, 0, front)) {
          if (chilled(e)) {
            this.freeze(e, spell, 1.95);
            this.damage(e, spell, 51 * 1.55);
          } else {
            this.chill(e, spell, 2.2, .49);
            this.damage(e, spell, 51);
          }
        }
        this.events.push({ kind: 'spell-impact', spell, ...to, radius });
        break;
      case 'absoluteZero':
        for (const e of targets) {
          const damage = chilled(e) ? ABSOLUTE_ZERO.chilledDamage : ABSOLUTE_ZERO.damage;
          this.freeze(e, spell, ABSOLUTE_ZERO.freeze);
          this.damage(e, spell, damage);
        }
        this.events.push({ kind: 'spell-impact', spell, ...center, radius, heading });
        break;
      case 'glacialCollapse': {
        const sources = this.inside(to, radius, 0, front).filter((e) => e.frozen > 0)
          .sort((a, b) => dist(a, to) - dist(b, to)).slice(0, 4);
        const victims = new Set<Enemy>();
        for (const source of sources) {
          for (const e of this.inside(source, radius, 0, front)) victims.add(e);
          this.events.push({ kind: 'spell-impact', spell, x: source.x, z: source.z, radius });
        }
        for (const e of victims) this.damage(e, spell, e.frozen > 0 ? 107 : 65);
        for (const source of sources) if (source.hp > 0) {
          source.frozen = 0;
          this.chill(source, spell, 2.0, .55);
        }
        break;
      }
      case 'auroraStrike':
        for (const e of this.inside(to, radius, 0, front)) this.damage(e, spell, e === target ? 154 : 51);
        this.events.push({ kind: 'spell-impact', spell, ...to, radius });
        break;
      case 'frostGale':
      case 'emberFan': {
        const angle = Math.atan2(to.x - x, to.z - z);
        const dx = Math.sin(angle), dz = Math.cos(angle);
        for (const e of targets) {
          const length = Math.hypot(e.x - x, e.z - z);
          if (length >= .2 && (e.x - x) * dx + (e.z - z) * dz < length * GUST_FORWARD_DOT) continue;
          if (spell === 'frostGale') this.chill(e, spell, 2, .52);
          this.damage(e, spell, spell === 'frostGale' ? 42 : 41);
        }
        break;
      }
      case 'flashpoint':
        this.igniteBurst(spell, to, radius, [target], { primary: target, splash: FLASHPOINT.splash, front });
        break;
      case 'phoenix':
        this.shot('phoenix', Math.atan2(to.x - x, to.z - z));
        break;
      case 'supernova':
        this.igniteBurst(spell, to, radius, this.inside(to, radius, 0, front), { front });
        break;
      case 'cinderMarks':
        path = [];
        for (const e of marks) {
          this.damage(e, spell, CINDER_MARKS.damage);
          path.push({ x: e.x, z: e.z });
        }
        break;
      case 'emberBrand': {
        const nearby = this.inside(target, radius, 0, front).filter((enemy) => enemy !== target && canBrand(enemy))
          .sort((a, b) => remaining(b) - remaining(a)).slice(0, EMBER_BRAND.targets - 1);
        for (const enemy of [target, ...nearby]) {
          this.damage(enemy, spell, enemy === target ? EMBER_BRAND.damage : EMBER_BRAND.secondaryDamage);
          const burn = enemy.ignite;
          if (burn) {
            burn.interval = IGNITE_TICK / 2;
            burn.next = Math.min(burn.next, burn.interval * Math.min(1, burn.ticks));
          }
          this.events.push({ kind: 'spell-impact', spell, x: enemy.x, z: enemy.z, radius: .8 });
        }
        break;
      }
      case 'cinderVortex':
        this.storms.push({ ...center, radius, life: CINDER_VORTEX.duration, maxLife: CINDER_VORTEX.duration, tick: .08, fire: true, mobile: true, front });
        break;
      case 'infernoHeart':
        this.inferno = INFERNO_HEART.duration * (1 + this.perk('inferno-heart-duration') * INFERNO_HEART.durationStep / 100);
        for (const e of targets) this.damage(e, spell, INFERNO_IMPACT);
        this.events.push({ kind: 'spell-impact', spell, ...center, radius, heading });
        break;
    }
    this.events.push({ kind: 'cast', spell, x, z, to, radius, ...(spell === 'emberFan' || spell === 'frostGale' ? { heading } : {}),
      ...(path ? { path } : {}) });
    return true;
  }

  private nextChainTarget(from: Point, front: CastFront, radius: number, hit: Set<number>, preferChilled = false) {
    let next: Enemy | undefined, best = Infinity;
    const reach = radius * radius;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0 || hit.has(enemy.id) || !inFront(enemy, front)) continue;
      const distance = dist(enemy, from);
      if (distance > reach) continue;
      const score = distance * (preferChilled && chilled(enemy) ? .75 : 1);
      if (score >= best) continue;
      next = enemy;
      best = score;
    }
    return next;
  }

  private hitLightning(arc: Lightning, enemy: Enemy) {
    const hop = arc.hit.size, consumedChill = chilled(enemy), { x, z } = enemy;
    arc.hit.add(enemy.id);
    this.events.push({ kind: 'chain-lightning-hit', from: { ...arc.from }, x, z, hop, charged: arc.charged, consumedChill });
    this.damage(enemy, 'chainLightning', arc.damage * arc.decay ** hop * (consumedChill ? arc.amplify : 1));
    if (consumedChill) {
      enemy.slow = enemy.frozen = 0;
      delete enemy.slowPower;
      delete enemy.chills;
      delete enemy.freezeSource;
    }
    arc.from = { x, z };
  }

  private updateLightning(dt: number) {
    for (let i = this.lightning.length - 1; i >= 0; i--) {
      const arc = this.lightning[i];
      arc.delay -= dt;
      while (arc.delay <= 1e-8 && arc.hit.size < arc.limit) {
        const next = this.nextChainTarget(arc.from, arc.front, arc.radius, arc.hit, true);
        if (!next) { this.lightning.splice(i, 1); break; }
        this.hitLightning(arc, next);
        arc.delay += CHAIN_LIGHTNING.hopDelay;
      }
      if (arc.hit.size >= arc.limit) this.lightning.splice(i, 1);
    }
  }

  private flightStep(projectile: Flight, dt: number) {
    if (projectile.age === undefined) return dt;
    const wasPreparing = projectile.age < 0;
    projectile.age += dt;
    if (!wasPreparing) return dt;
    if (projectile.age < 0) return 0;
    const front = this.castFront(), heading = this.player.heading;
    const target = projectile.target;
    const planned = target && target.hp > 0 && inFront(target, front)
      ? angleFrom(front, target) : Math.atan2(projectile.vx, projectile.vz);
    const aim = heading + cap(angleDelta(planned, heading), -Math.PI / 2, Math.PI / 2);
    const dx = Math.sin(aim), dz = Math.cos(aim), speed = Math.hypot(projectile.vx, projectile.vz);
    projectile.x = front.x + dx * .48;
    projectile.z = front.z + dz * .48;
    projectile.vx = dx * speed;
    projectile.vz = dz * speed;
    projectile.front = front;
    return projectile.age;
  }

  private updateShots(dt: number) {
    for (const shot of this.shots) {
      const travel = this.flightStep(shot, dt);
      if (travel <= 0) continue;
      if (shot.target && shot.front && !inFront(shot.target, shot.front)) shot.target = undefined;
      if (shot.target && shot.target.hp > 0) {
        const dx = shot.target.x - shot.x, dz = shot.target.z - shot.z;
        const length = Math.hypot(dx, dz);
        if (length > .01 && (!shot.front || dx * shot.front.dx + dz * shot.front.dz >= -1e-7)) {
          shot.vx = dx * SHOT_SPEED[shot.kind] / length;
          shot.vz = dz * SHOT_SPEED[shot.kind] / length;
        }
      }
      const moveX = shot.vx * travel, moveZ = shot.vz * travel;
      const square = moveX * moveX + moveZ * moveZ;
      if (square > 0) {
        for (const enemy of this.enemies) {
          if (enemy.hp <= 0 || shot.hits.has(enemy.id) || !inFront(enemy, shot.front)) continue;
          const x = enemy.x - shot.x, z = enemy.z - shot.z;
          const t = cap((x * moveX + z * moveZ) / square, 0, 1);
          const reach = shot.kind === 'phoenix' ? this.area(PHOENIX.width) : shot.kind === 'lance' ? this.area(.34) : shot.kind === 'pyro' ? .34 : .14;
          const radius = enemy.radius + reach;
          if ((x - t * moveX) ** 2 + (z - t * moveZ) ** 2 > radius * radius) continue;
          shot.hits.add(enemy.id);
          if (shot.kind === 'phoenix') {
            this.damage(enemy, 'phoenix', PHOENIX.damage);
            this.events.push({ kind: 'spell-impact', spell: 'phoenix', x: enemy.x, z: enemy.z, radius: reach });
            continue;
          }
          if (shot.kind === 'fireball' || shot.kind === 'pyro') {
            const critical = this.rollCrit(shot.kind);
            this.damage(enemy, shot.kind, shot.kind === 'fireball' ? 23 : 63, false, critical);
            if (shot.kind === 'fireball') {
              this.advanceHeat(critical);
              const radius = this.area(1.90);
              const splashed = this.inside(enemy, radius, 0, shot.front).filter((e) => e !== enemy);
              for (const e of splashed) this.damage(e, 'fireball', 10, false, critical);
              if (splashed.length) this.events.push({ kind: 'spell-impact', spell: 'fireball', x: enemy.x, z: enemy.z, radius });
            } else {
              const radius = this.area(2.55);
              for (const e of this.inside(enemy, radius, 0, shot.front)) if (e !== enemy) this.damage(e, 'pyro', 32, false, critical);
              this.events.push({ kind: 'fireburst', x: enemy.x, z: enemy.z, radius, spell: 'pyro' });
            }
            shot.life = 0;
            break;
          }
          if (shot.kind === 'bolt') {
            this.damage(enemy, 'bolt', 21);
            this.chill(enemy, 'bolt', 2.1, (BOLT_SLOW_PERCENT + this.perk('bolt-chill') * SLOW_UPGRADE_PERCENT) / 100);
            const chance = this.perk('fingers') * .20;
            if (chance && this.fingers < 2 && this.rng() < chance) this.fingers++;
            shot.life = 0;
            break;
          }
          const shatter = enemy.frozen > 0 || shot.charged;
          this.damage(enemy, 'lance', 33 * (shatter ? 2 + this.perk('shatter') * .8 : 1), shatter);
        }
      }
      shot.x += moveX;
      shot.z += moveZ;
      shot.life -= travel;
    }
    this.shots = this.shots.filter((shot) => shot.life > 0);
  }

  private updateStorms(dt: number) {
    for (const storm of this.storms) {
      if (storm.mobile) {
        storm.x = this.player.x;
        storm.z = this.player.z;
      }
      storm.life -= dt;
      storm.tick -= dt;
      if (storm.tick > 0 || storm.life <= 0) continue;
      const whiteout = storm.pulses !== undefined;
      storm.tick += storm.mobile ? CINDER_VORTEX.interval : storm.fire ? .82 : whiteout ? .60 : BLIZZARD_TICK_SECONDS;
      if (whiteout) storm.pulses!++;
      const crystallize = whiteout && storm.pulses! % 3 === 0;
      const front = storm.mobile ? this.castFront() : storm.front;
      for (const enemy of this.inside(storm, storm.radius, 0, front)) {
        if (storm.mobile) {
          const fresh = !enemy.ignite;
          this.damage(enemy, 'cinderVortex', fresh ? CINDER_VORTEX.freshDamage : CINDER_VORTEX.burningDamage, false, undefined, fresh);
        } else if (storm.fire) {
          this.damage(enemy, 'flamestrike', 3, false, false, false);
        } else {
          const spell = whiteout ? 'whiteout' : 'blizzard';
          this.chill(enemy, spell, .86, whiteout ? .57 : (BLIZZARD_SLOW_PERCENT + this.perk('blizzard-chill') * SLOW_UPGRADE_PERCENT) / 100);
          if (crystallize) this.freeze(enemy, spell, .78);
          this.damage(enemy, spell, whiteout ? 16 : 8);
        }
      }
      if (crystallize) this.events.push({ kind: 'spell-impact', spell: 'whiteout', x: storm.x, z: storm.z, radius: storm.radius });
    }
    this.storms = this.storms.filter((storm) => storm.life > 0);
  }

  private updateOrbs(dt: number) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      const travel = this.flightStep(orb, dt);
      if (travel <= 0) continue;
      orb.x += orb.vx * travel;
      orb.z += orb.vz * travel;
      orb.life -= travel;
      if (orb.life <= 0) {
        this.orbs.splice(i, 1);
        continue;
      }
      orb.tick -= travel;
      if (orb.tick > 0) continue;
      orb.tick += .28;
      let hits = 0;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || dist(enemy, orb) > (orb.radius + enemy.radius * .3) ** 2 || !inFront(enemy, orb.front)) continue;
        const hp = enemy.hp;
        this.chill(enemy, 'orb', .82, .47);
        this.damage(enemy, 'orb', 16);
        if (enemy.hp < hp) hits++;
      }
      // All enemies in one pulse use the same radius; growth applies to the next pulse.
      if (hits) orb.radius = Math.min(
        orb.baseRadius * (1 + FROZEN_ORB.maxGrowth / 100),
        orb.radius + orb.baseRadius * hits * FROZEN_ORB.hitGrowth / 100,
      );
    }
  }

  private updateComets(dt: number) {
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const comet = this.comets[i];
      if (comet.target.hp > 0 && inFront(comet.target, comet.front)) {
        comet.x = comet.target.x;
        comet.z = comet.target.z;
      }
      comet.delay -= dt;
      if (comet.delay > 0) continue;
      this.comets.splice(i, 1);
      for (const enemy of this.inside(comet, comet.radius, .25, comet.front)) this.damage(enemy, 'comet', 37);
      this.events.push({ kind: 'comet-impact', x: comet.x, z: comet.z, radius: comet.radius });
    }
  }

  private updateBombs(dt: number) {
    const rank = Math.min(BOMB_SPREAD_BY_RANK.length - 1, this.perk('bomb-spread'));
    const chance = BOMB_SPREAD_BY_RANK[rank] / 100;
    let occupied: Set<Enemy> | undefined;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      bomb.x = bomb.target.x;
      bomb.z = bomb.target.z;
      bomb.delay -= dt;
      if (bomb.delay > 0 && bomb.target.hp > 0) continue;
      // A set of simultaneously primed bombs is still one wave, even though we resolve it one bomb at a time.
      if (chance) occupied ??= new Set(this.bombs.map(({ target }) => target));
      this.bombs.splice(i, 1);
      const nearby = this.inside(bomb, bomb.radius);
      this.igniteBurst('livingBomb', bomb, bomb.radius, [bomb.target], { primary: bomb.target, splash: .5, burnShare: bomb.power, victims: nearby });
      // Weak copies spend their own fraction of the burn without refreshing every other spell's ignite.
      for (const enemy of nearby) this.damage(enemy, 'livingBomb', 42, undefined, undefined, bomb.power === 1, bomb.power);
      if (occupied && bomb.power >= BOMB_MIN_SPREAD_POWER) {
        const reserved = occupied;
        const transfers = nearby.filter((enemy) => enemy.hp > 0 && !reserved.has(enemy) && this.rng() < chance);
        if (transfers.length) {
          // Scale damage sublinearly with branching; extra successful rolls still increase total charge.
          const power = bomb.power * (bomb.power === 1 ? 1 : BOMB_SPLIT_DECAY) / transfers.length ** BOMB_SPLIT_EXPONENT;
          for (const next of transfers) {
            this.bombs.push({ x: next.x, z: next.z, target: next, delay: BOMB_FUSE, radius: bomb.radius, spread: true, power });
            occupied.add(next);
          }
          const center = { x: bomb.x, z: bomb.z }, path = [center, ...transfers.map(({ x, z }) => ({ x, z }))];
          this.events.push({ kind: 'cast', spell: 'livingBomb', ...center, path, bombPower: power });
        }
      }
      this.events.push({ kind: 'fireburst', x: bomb.x, z: bomb.z, radius: bomb.radius, spell: 'livingBomb', bombPower: bomb.power });
    }
  }

  private updateImpacts(dt: number) {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      impact.delay -= dt;
      if (impact.delay > 0) continue;
      this.impacts.splice(i, 1);
      const { spell, x, z, radius } = impact;
      for (const enemy of this.inside(impact, radius, 0, impact.front)) {
        if (spell === 'iceBloom') this.freeze(enemy, spell, 1.6);
        this.damage(enemy, spell, spell === 'meteor' ? 68 : 52);
      }
      this.events.push({ kind: 'spell-impact', spell, x, z, radius });
    }
  }

  private updateWalls(dt: number) {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const wall = this.walls[i];
      wall.life -= dt;
      if (wall.life <= 0) {
        this.walls.splice(i, 1);
        continue;
      }
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0 || wall.hits.has(enemy.id) || !inFront(enemy, wall.front) ||
          segmentDistance(enemy, wall.from, wall.to) > (wall.width + enemy.radius * .35) ** 2) continue;
        wall.hits.add(enemy.id);
        this.freeze(enemy, 'glacierWall', 1.25);
        this.damage(enemy, 'glacierWall', 47);
        this.events.push({ kind: 'spell-impact', spell: 'glacierWall', x: enemy.x, z: enemy.z, radius: wall.width });
      }
    }
  }

  private scaledDamage(enemy: Enemy, spell: DamageSpell, value: number, critical: boolean) {
    const fire = this.mageClass === 'fire';
    const shatter = !fire && enemy.frozen > 0 ? this.perk('frozen-power') * FROZEN_DAMAGE_PERCENT : 0;
    const bonus = this.perk(fire ? 'kindling' : 'shards') * GLOBAL_DAMAGE_PERCENT + this.perk(SPELL_DAMAGE_PERK[spell]) * SPELL_DAMAGE_PERCENT + shatter;
    return Math.round(value * this.permanent.damage * this.buffMultiplier('power') * (100 + bonus) / 100 *
      (critical ? 1.68 + this.perk('critical-force') * CRIT_DAMAGE_PERCENT / 100 : 1));
  }

  private damage(enemy: Enemy, spell: DamageSpell, value: number, frozen = enemy.frozen > 0, critical?: boolean, allowIgnite = true, scale = 1) {
    if (enemy.hp <= 0 || scale <= 0) return;
    critical ??= this.rollCrit(spell);
    const damage = this.scaledDamage(enemy, spell, value, critical) * scale;
    const dealt = this.strike(enemy, damage, { spell, frozen, critical });
    if (dealt > 0 && critical && spell !== 'chainLightning' && !this.lightningCharge && this.spells.has('chainLightning')) {
      this.lightningCharge = true;
      this.events.push({ kind: 'lightning-charge', x: this.player.x, z: this.player.z });
    }
    if (enemy.hp <= 0) return;
    if (this.mageClass === 'frost') {
      if (critical && spell !== 'chainLightning') this.frostCritical(enemy);
      return;
    }
    const burn = SPELL_IGNITE_PERK[spell];
    if (allowIgnite && burn) {
      const weight = IGNITE_WEIGHTS[spell] ?? 1;
      const ticks = IGNITE_TICKS + this.statusDurationBonus / IGNITE_TICK;
      const amount = damage * IGNITE_PERCENT / 100 * weight * (1 + this.perk(burn) * IGNITE_UPGRADE_PERCENT / 100) * (ticks / IGNITE_TICKS);
      const boosted = this.inferno > 0 ? amount * INFERNO_BURN_BOOST_PERCENT / 100 : 0;
      const ignite = enemy.ignite ??= { remaining: 0, next: IGNITE_TICK, ticks: IGNITE_TICKS, sources: new Map() };
      // Refresh the total duration without delaying the already scheduled tick.
      ignite.remaining += amount + boosted;
      ignite.ticks = ticks;
      ignite.sources.set(spell, (ignite.sources.get(spell) ?? 0) + amount);
      if (boosted > 0) ignite.sources.set('infernoHeart', (ignite.sources.get('infernoHeart') ?? 0) + boosted);
    }
  }

  private updateIgnites(dt: number) {
    for (const enemy of this.enemies) {
      const burn = enemy.ignite;
      if (!burn || enemy.hp <= 0) continue;
      burn.next -= dt;
      while (burn.next <= 1e-8 && burn.ticks > 0 && enemy.hp > 0) {
        const ticks = burn.ticks;
        const shareOfPool = Math.min(1, 1 / ticks);
        const portion = burn.remaining * shareOfPool;
        burn.remaining -= portion;
        burn.ticks = Math.max(0, ticks - 1);
        burn.next += (burn.interval ?? IGNITE_TICK) * Math.min(1, burn.ticks);
        const dealt = this.strike(enemy, portion, { dot: true });
        if (dealt > 0) {
          // One visual tick, credited proportionally to the spells that supplied it.
          for (const [spell, pending] of burn.sources) {
            const share = pending * shareOfPool;
            burn.sources.set(spell, pending - share);
            this.recordDamage(spell, dealt * (share / portion));
          }
        }
      }
      if (!burn.ticks) delete enemy.ignite;
    }
  }

  private igniteBurst(spell: 'flashpoint' | 'livingBomb' | 'supernova', center: Point, radius: number, sources: Enemy[],
    { primary, splash = 1, front, victims, burnShare = 1 }:
    { primary?: Enemy; splash?: number; front?: CastFront; victims?: Enemy[]; burnShare?: number } = {}) {
    let total = 0;
    for (const enemy of sources) {
      const burn = enemy.ignite;
      if (!burn) continue;
      total += burn.remaining * burnShare;
      if (burnShare === 1) delete enemy.ignite;
      else {
        const retained = 1 - burnShare;
        burn.remaining *= retained;
        for (const [source, damage] of burn.sources) burn.sources.set(source, damage * retained);
      }
    }
    if (total <= 0) return;
    // The stored payload already includes the source cast's damage/crit bonuses.
    const stored = spell === 'supernova'
      ? Math.min(total, 180) * SUPERNOVA_IGNITE_SHARE + Math.max(0, total - 180) * .16
      : total;
    const power = stored * (1 + this.perk(SPELL_DAMAGE_PERK[spell]) * SPELL_DAMAGE_PERCENT / 100);
    const impact = spell === 'supernova' ? SUPERNOVA_IMPACT : spell === 'flashpoint' ? FLASHPOINT.damage : 0;
    for (const e of victims ?? this.inside(center, radius, 0, front)) {
      const core = impact ? this.scaledDamage(e, spell, impact, false) : 0;
      this.strike(e, core + power * (e === primary ? 1 : splash), { spell });
    }
    this.events.push({ kind: 'ignite-burst', spell, x: center.x, z: center.z, radius, ...(burnShare < 1 ? { bombPower: burnShare } : {}) });
  }

  private recordDamage(spell: DamageSpell, amount: number) {
    if (amount > 0) this.spellDamage.set(spell, (this.spellDamage.get(spell) ?? 0) + amount);
  }

  private strike(enemy: Enemy, damage: number, options: { spell?: DamageSpell; frozen?: boolean; critical?: boolean; dot?: boolean }) {
    if (enemy.hp <= 0 || damage <= 0) return 0;
    const dealt = Math.min(enemy.hp, damage);
    if (options.spell) this.recordDamage(options.spell, dealt);
    enemy.hp -= damage;
    if (!options.dot && damage >= 1) enemy.flash = .13;
    this.events.push({ kind: 'strike', x: enemy.x, z: enemy.z, damage, frozen: options.frozen ?? enemy.frozen > 0,
      ...(this.mageClass === 'fire' ? { fire: true } : {}), ...(options.critical ? { critical: true } : {}),
      ...(options.dot ? { dot: true } : {}), ...(options.spell ? { spell: options.spell } : {}) });
    if (enemy.hp <= 0) {
      if (this.frostBindReclaim?.target === enemy) {
        if (this.time <= this.frostBindReclaim.until) {
          this.cooldown.frostBind = Math.max(0, this.cooldown.frostBind - FROST_BIND.refund * this.perk('frost-bind-reclaim'));
        }
        this.frostBindReclaim = undefined;
      }
      delete enemy.ignite;
      this.kills++;
      const tier = isBoss(enemy.kind) ? 'boss' : rangedElite(enemy.kind) || ['imp', 'shard', 'sentinel', 'bloom'].includes(enemy.kind) ? 'elite' : 'normal';
      this.pickups.push({ x: enemy.x, z: enemy.z, age: 0, value: STATS[enemy.kind].xp, tier, phase: this.rng() * Math.PI * 2 });
      this.events.push({ kind: 'vanish', x: enemy.x, z: enemy.z });
      if (enemy.questNpcId !== undefined && this.quest?.npc.id === enemy.questNpcId) {
        this.advanceQuest(enemy.kind === QUEST_BOSS ? 'guardian' : 'ambush');
      } else if (!isBoss(enemy.kind)) this.advanceQuest('hunt');
    }
    return dealt;
  }

  private gainXp(value: number) {
    // Permanent and run XP multiply; integer basis points preserve small bonuses on loose gems.
    const earned = Math.round(value * this.permanent.xp * (100 + this.perk('study') * RUN_XP_PERCENT) * 100) + this.xpRemainder;
    const xp = Math.floor(earned / 10_000);
    this.xp += xp;
    this.xpRemainder = earned % 10_000;
    return xp;
  }

  private updatePickups(dt: number) {
    let collected = 0;
    const p = this.player;
    const pickupScale = this.permanent.pickup * (1 + this.perk('magnet') * .4);
    for (const gem of this.pickups) {
      gem.age += dt;
      if (gem.value <= 0) continue;
      const dx = p.x - gem.x, dz = p.z - gem.z, distance = dx * dx + dz * dz;
      const range = (gem.tier === 'boss' ? 4.8 : 3.05) * pickupScale;
      const pull = gem.pull;
      if (pull === undefined && (gem.age < .19 || distance > range * range)) continue;
      if (distance < .44 ** 2 || (pull !== undefined && pull <= dt)) {
        this.gainXp(gem.value);
        gem.value = 0;
        collected++;
      } else if (pull !== undefined) {
        gem.x += dx * dt / pull;
        gem.z += dz * dt / pull;
        gem.pull = pull - dt;
      } else {
        const length = Math.hypot(dx, dz);
        const speed = Math.min(length, dt * (8.4 + Math.max(0, 3.4 - length) * 4)) / length;
        gem.x += dx * speed;
        gem.z += dz * speed;
      }
    }
    if (collected) {
      this.pickups = this.pickups.filter((gem) => gem.value > 0);
      this.events.push({ kind: 'collect', x: p.x, z: p.z });
      this.advanceQuest('salvage', collected);
    }
    if (this.xp >= this.goal) this.offerUpgrade();
  }

  private offerUpgrade() {
    this.xp -= this.goal;
    this.level++;
    this.status = 'upgrade';
    this.player.moving = false;
    const spells: SpellUnlock[] = this.level % SPELL_LEARN_INTERVAL === 0
      ? (this.mageClass === 'fire' ? FIRE_UNLOCKS : SPELL_UNLOCKS).filter((upgrade) =>
        !this.spells.has(upgrade.spell) && this.level >= RARITIES[SPELL_RARITY[upgrade.spell]].level)
      : [];
    const valid = UPGRADES.filter((upgrade) => this.canUpgrade(upgrade));
    this.choices = [];
    while (this.choices.length < 3 && spells.length) {
      const tiers = RARITY_ORDER.filter((rarity) => spells.some((upgrade) => SPELL_RARITY[upgrade.spell] === rarity));
      let rarity = this.choices.length === 0 ? tiers.find((tier) => tier !== 'common' && RARITIES[tier].level === this.level) : undefined;
      if (!rarity) {
        let roll = this.rng() * tiers.reduce((total, tier) => total + RARITIES[tier].weight, 0);
        for (const tier of tiers) {
          roll -= RARITIES[tier].weight;
          if (roll < 0) { rarity = tier; break; }
        }
      }
      const pool = spells.filter((upgrade) => SPELL_RARITY[upgrade.spell] === (rarity ?? tiers[tiers.length - 1]));
      const chosen = pool[Math.floor(this.rng() * pool.length)];
      this.choices.push(chosen);
      spells.splice(spells.indexOf(chosen), 1);
    }
    while (this.choices.length < 3 && valid.length) {
      // Give enhancement levels room for both a spell-specific and a general upgrade.
      const preferred = this.choices.length === 0
        ? valid.filter((upgrade) => 'requires' in upgrade && !FOUNDATION.includes(upgrade.id))
        : this.choices.length === 1 ? valid.filter((upgrade) => FOUNDATION.includes(upgrade.id)) : [];
      const pool = preferred.length ? preferred : valid;
      const chosen = pool[Math.floor(this.rng() * pool.length)];
      this.choices.push(chosen);
      valid.splice(valid.indexOf(chosen), 1);
    }
    this.events.push({ kind: 'level' });
  }

  private applyPerk(upgrade: PerkUpgrade) {
    const before = this.recoveryInterval;
    this.perks[upgrade.id] = this.perk(upgrade.id) + 1;
    if (upgrade.id === 'regeneration') this.recoveryElapsed *= this.recoveryInterval / before;
    if (upgrade.id === 'heart') {
      this.maxHp += 20 * this.buffMultiplier('vital');
      this.hp = Math.min(this.maxHp, this.hp + 40);
    }
  }

  choose(id: UpgradeId) {
    const upgrade = this.choices.find((choice) => choice.id === id);
    if (this.status !== 'upgrade' || !upgrade) return false;
    if ('spell' in upgrade) this.spells.add(upgrade.spell);
    else this.applyPerk(upgrade);
    this.choices = [];
    this.status = 'playing';
    if (this.xp >= this.goal) this.offerUpgrade();
    return true;
  }
}
