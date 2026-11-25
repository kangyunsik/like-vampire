export const WAVE_TIME = 36;
export const WAVE_COUNT = 5;
export const STAGE_TIME = WAVE_TIME * WAVE_COUNT;
export const FIELD_X = 480;
export const FIELD_Z = 360;
export const BOSS_HEALTH_MULTIPLIER = 1.5;
export const WAVE_MOB_LIMIT = 192;
export type Obstacle = { x: number; z: number; radius: number; canopy?: { radius: number; height: number } };

export const PICKUP_STYLES = {
  normal: { label: '일반', core: '#a4fff0', halo: '#4cf5d0', size: .25 },
  elite: { label: '정예', core: '#e9c5ff', halo: '#c887ff', size: .36 },
  boss: { label: '보스', core: '#fff4ae', halo: '#ffb747', size: .64 },
} as const;
export type PickupTier = keyof typeof PICKUP_STYLES;

const BOSS_KINDS = ['warden', 'prism', 'queen', 'glacier', 'eclipse', 'archivist', 'leviathan', 'stormRegent', 'riftMonarch', 'dawnColossus'] as const;
const RANGED_KINDS = ['stormAdept', 'riftOracle', 'dawnArtillerist'] as const;
export const QUEST_BOSS = 'riftKeeper';
export const QUEST_BOSS_NAME = '균열 수호자';
export const ENEMY_KINDS = ['puff', 'hare', 'imp', 'shard', 'wisp', 'scarab', 'sentinel', 'manta', 'bloom', ...RANGED_KINDS, ...BOSS_KINDS, QUEST_BOSS] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
type StageBossKind = typeof BOSS_KINDS[number];
type BossKind = StageBossKind | typeof QUEST_BOSS;
type MobKind = Exclude<EnemyKind, BossKind>;
export type StageId = 'grove' | 'cavern' | 'citadel' | 'pass' | 'eclipse' | 'workshop' | 'abyss' | 'tempest' | 'rift' | 'dawn';

const bosses: ReadonlySet<EnemyKind> = new Set([...BOSS_KINDS, QUEST_BOSS]);
export function isBoss(kind: EnemyKind): kind is BossKind {
  return bosses.has(kind);
}

type SpawnPool = readonly (readonly [MobKind, number])[];
export type BossAttackCue = 'prism' | 'queen' | 'glacier' | 'eclipse'
  | 'gearLine' | 'gearCross' | 'abyssTrack' | 'abyssLine' | 'riftPulse' | 'riftLine'
  | 'stormShot' | 'oracleShot' | 'dawnShot' | 'stormCross' | 'stormVolley'
  | 'riftRing' | 'riftChase' | 'dawnRing' | 'dawnCross' | 'stormCharge' | 'dawnCharge';
export type SlowDebuff = { seconds: number; percent: number };
export const CLOCKWORK_SLOW: SlowDebuff = { seconds: 3, percent: 30 };
type BossAttack = {
  interval: number; windup: number; radius: number; damage: number; offsets: readonly number[];
  cue: BossAttackCue; pattern?: 'cross' | 'ring' | 'line' | 'chase'; cadence?: number; slow?: SlowDebuff;
};
type BossCharge = { interval: number; windup: number; radius: number; damage: number; cue: BossAttackCue; distance: number; travel: number };
export const QUEST_BOSS_ATTACKS = [
  { interval: 5.5, windup: 1.30, radius: 2.4, damage: 23, offsets: [0], cue: 'riftPulse' },
  { interval: 5.9, windup: 1.22, radius: 1.65, damage: 20, offsets: [-3, 0, 3], cue: 'riftLine', pattern: 'line', cadence: .26 },
] as const satisfies readonly BossAttack[];
export const RANGED_ELITES = {
  stormAdept: { name: '폭풍술사', hold: 8.45, range: 16,
    attack: { interval: 7.6, windup: 1.28, radius: 1.72, damage: 19, offsets: [0], cue: 'stormShot' } },
  riftOracle: { name: '균열 예언자', hold: 8.6, range: 17,
    attack: { interval: 8.6, windup: 1.34, radius: 1.61, damage: 23, offsets: [0, 3.1], cue: 'oracleShot', pattern: 'line', cadence: .30 } },
  dawnArtillerist: { name: '태양 포격수', hold: 8.85, range: 17.5,
    attack: { interval: 8.1, windup: 1.48, radius: 2.42, damage: 29, offsets: [0], cue: 'dawnShot' } },
} as const satisfies Record<typeof RANGED_KINDS[number], { name: string; hold: number; range: number; attack: BossAttack }>;
export function rangedElite(kind: EnemyKind) {
  return kind in RANGED_ELITES ? RANGED_ELITES[kind as keyof typeof RANGED_ELITES] : undefined;
}
type Stage = {
  id: StageId;
  name: string;
  english: string;
  description: string;
  accent: string;
  hpScale: number;
  intervals: readonly [number, number, number, number, number];
  pools: readonly [SpawnPool, SpawnPool, SpawnPool];
  boss: {
    kind: StageBossKind;
    name: string;
    warning?: string;
    attack?: BossAttack;
    alternate?: BossAttack;
    charge?: BossCharge;
  };
};

export const STAGES: readonly Stage[] = [
  {
    id: 'grove', name: '눈꽃 골짜기', english: 'THE FROZEN GROVE', accent: '#b7a8ff',
    description: '눈 덮인 숲을 누비며 첫 주문을 키우세요.',
    hpScale: 1, intervals: [1.65, 1.45, 1.18, 1.05, .85],
    pools: [[['puff', 1]], [['hare', .67], ['puff', 1]], [['imp', .30], ['hare', .67], ['puff', 1]]],
    boss: { kind: 'warden', name: '얼음 파수꾼' },
  },
  {
    id: 'cavern', name: '오로라 수정동굴', english: 'AURORA CAVERNS', accent: '#83f5e1',
    description: '푸른 오로라가 전장을 물들이고, 단단한 수정 집게가 합류합니다.',
    hpScale: 1.18, intervals: [1.38, 1.24, 1.07, .97, .86],
    pools: [
      [['shard', .44], ['hare', .75], ['puff', 1]],
      [['shard', .48], ['hare', .86], ['puff', 1]],
      [['shard', .52], ['hare', .83], ['imp', 1]],
    ],
    boss: {
      kind: 'prism', name: '프리즘 거상', warning: '바닥 원이 차오르기 전에 벗어나세요.',
      attack: { interval: 5.8, windup: 1.25, radius: 2.6, damage: 24, offsets: [0], cue: 'prism' },
    },
  },
  {
    id: 'citadel', name: '달빛 성채', english: 'MOONLIT CITADEL', accent: '#ffc6f1',
    description: '보랏빛 달이 뜨면 빠른 망령과 여왕의 세 갈래 폭발을 조심하세요.',
    hpScale: 1.48, intervals: [1.22, 1.11, .98, .88, .79],
    pools: [
      [['wisp', .49], ['imp', .77], ['hare', 1]],
      [['wisp', .52], ['imp', .83], ['shard', 1]],
      [['wisp', .45], ['imp', .75], ['shard', 1]],
    ],
    boss: {
      kind: 'queen', name: '달서리 여왕', warning: '세 개의 원이 겹친 줄 밖으로 피하세요.',
      attack: { interval: 4.9, windup: 1.2, radius: 2.15, damage: 32, offsets: [0, -2.9, 2.9], cue: 'queen' },
    },
  },
  {
    id: 'pass', name: '별서리 고개', english: 'STARFROST PASS', accent: '#a8e3ff',
    description: '별빛이 얼음 안개에 번지고, 빙하 거인이 십자 모양으로 얼음 파편을 떨어뜨립니다.',
    hpScale: 1.86, intervals: [1.13, 1.04, .94, .84, .74],
    pools: [
      [['shard', .38], ['hare', .65], ['wisp', 1]],
      [['shard', .43], ['imp', .66], ['wisp', 1]],
      [['shard', .46], ['imp', .73], ['wisp', 1]],
    ],
    boss: {
      kind: 'glacier', name: '빙하 거인', warning: '십자 모양 공격은 대각선으로 빠져나오세요.',
      attack: { interval: 4.8, windup: 1.5, radius: 2.0, damage: 38, offsets: [0, -3.4, 3.4], cue: 'glacier', pattern: 'cross' },
    },
  },
  {
    id: 'eclipse', name: '극야의 심장', english: 'HEART OF ECLIPSE', accent: '#ffc997',
    description: '해가 사라진 설원에 극야 군주가 등장합니다. 포위하는 불꽃 고리를 조심하세요.',
    hpScale: 2.32, intervals: [1.03, .95, .87, .76, .68],
    pools: [
      [['wisp', .46], ['imp', .70], ['shard', 1]],
      [['wisp', .40], ['imp', .68], ['shard', 1]],
      [['wisp', .38], ['imp', .67], ['shard', 1]],
    ],
    boss: {
      kind: 'eclipse', name: '극야 군주', warning: '중앙과 주위를 덮는 고리 바깥으로 벗어나세요.',
      attack: { interval: 4.4, windup: 1.65, radius: 2.1, damage: 44, offsets: [0, 4.1], cue: 'eclipse', pattern: 'ring' },
    },
  },
  {
    id: 'workshop', name: '시계태엽 첨탑', english: 'CLOCKWORK SPIRE', accent: '#ffcd8c',
    description: '청동 딱정벌레와 태엽 파수병이 깨어납니다. 원이 일렬로 깔리면 옆으로 빠지세요.',
    hpScale: 2.90, intervals: [1.00, .91, .83, .76, .69],
    pools: [[['scarab', .72], ['sentinel', 1]], [['scarab', .56], ['sentinel', 1]], [['scarab', .47], ['sentinel', 1]]],
    boss: {
      kind: 'archivist', name: '태엽 대감시자', warning: '포격에 맞으면 3초간 이동 속도가 30% 감소합니다.',
      attack: { interval: 5.1, windup: 1.18, radius: 1.44, damage: 48, offsets: [-6, -3, 0, 3, 6], cue: 'gearLine', pattern: 'line', slow: CLOCKWORK_SLOW },
      alternate: { interval: 5.7, windup: 1.3, radius: 1.55, damage: 43, offsets: [0, -3.1, 3.1], cue: 'gearCross', pattern: 'cross', slow: CLOCKWORK_SLOW },
    },
  },
  {
    id: 'abyss', name: '심연의 정원', english: 'THE ABYSSAL GARDEN', accent: '#ff9bc4',
    description: '심연 가오리와 포자꽃 군락이 밀려옵니다. 뒤따라오는 폭발 고리를 조심하세요.',
    hpScale: 3.55, intervals: [.97, .89, .81, .73, .66],
    pools: [[['manta', .70], ['bloom', 1]], [['manta', .58], ['bloom', 1]], [['manta', .49], ['bloom', 1]]],
    boss: {
      kind: 'leviathan', name: '심연의 리바이어던', warning: '시간차를 두고 주변에 위험 원이 나타납니다. 한곳에 멈추지 마세요.',
      attack: { interval: 6.7, windup: 1.03, radius: 1.73, damage: 53, offsets: [0, 2.8, 2.4, 3, 2.2, 0], cue: 'abyssTrack', pattern: 'chase', cadence: .45 },
      alternate: { interval: 5.2, windup: 1.30, radius: 1.32, damage: 49, offsets: [-5.2, -2.6, 0, 2.6, 5.2], cue: 'abyssLine', pattern: 'line', cadence: .19 },
    },
  },
  {
    id: 'tempest', name: '천둥 서리광장', english: 'TEMPEST PLAZA', accent: '#8af6ff',
    description: '원거리 정예 폭풍술사가 낙뢰를 예고합니다. 원 밖으로 움직이세요.',
    hpScale: 4.25, intervals: [.66, .655, .645, .63, .62],
    pools: [
      [['stormAdept', .14], ['manta', .61], ['bloom', 1]],
      [['stormAdept', .18], ['manta', .64], ['bloom', 1]],
      [['stormAdept', .21], ['manta', .63], ['bloom', 1]],
    ],
    boss: {
      kind: 'stormRegent', name: '폭풍 섭정', warning: '직선 화살표가 나타나면 돌진 경로 옆으로 벗어나세요.',
      attack: { interval: 5.7, windup: 1.37, radius: 2.08, damage: 53, offsets: [0, -3.55, 3.55], cue: 'stormCross', pattern: 'cross' },
      alternate: { interval: 5.9, windup: 1.35, radius: 1.68, damage: 54, offsets: [-6, -3, 0, 3, 6], cue: 'stormVolley', pattern: 'line', cadence: .21 },
      charge: { interval: 6.2, windup: 1.48, radius: 2, damage: 54, cue: 'stormCharge', distance: 14.5, travel: .52 },
    },
  },
  {
    id: 'rift', name: '갈라진 성역', english: 'SANCTUM OF RIFTS', accent: '#e7adff',
    description: '균열 예언자가 시간차로 원을 깝니다. 먼저 터지는 원만 피하고 멈추지 마세요.',
    hpScale: 5.05, intervals: [.62, .616, .602, .59, .58],
    pools: [
      [['riftOracle', .13], ['stormAdept', .18], ['sentinel', .50], ['manta', 1]],
      [['riftOracle', .15], ['stormAdept', .20], ['sentinel', .54], ['manta', 1]],
      [['riftOracle', .17], ['stormAdept', .23], ['sentinel', .58], ['manta', 1]],
    ],
    boss: {
      kind: 'riftMonarch', name: '균열 군왕', warning: '공허 포위의 바깥이나, 추적 원 사이의 빈 공간으로 피하세요.',
      attack: { interval: 6.1, windup: 1.53, radius: 2.16, damage: 58, offsets: [0, 4.15], cue: 'riftRing', pattern: 'ring' },
      alternate: { interval: 6.5, windup: 1.15, radius: 1.91, damage: 55, offsets: [0, 2.5, 2.9, 2.1, 3.1, 0], cue: 'riftChase', pattern: 'chase', cadence: .37 },
    },
  },
  {
    id: 'dawn', name: '여명의 왕좌', english: 'THRONE OF DAWN', accent: '#ffd794',
    description: '태양 포격수와 원거리 정예가 섞여 등장합니다. 큰 포격 원을 우선 피하세요.',
    hpScale: 6.0, intervals: [.58, .574, .56, .55, .54],
    pools: [
      [['dawnArtillerist', .13], ['riftOracle', .19], ['bloom', .49], ['manta', 1]],
      [['dawnArtillerist', .16], ['riftOracle', .23], ['bloom', .53], ['sentinel', 1]],
      [['dawnArtillerist', .18], ['riftOracle', .25], ['bloom', .57], ['sentinel', 1]],
    ],
    boss: {
      kind: 'dawnColossus', name: '여명의 거신', warning: '태양 고리의 틈이나 돌격 경로 옆으로 피하세요.',
      attack: { interval: 5.7, windup: 1.58, radius: 2.32, damage: 65, offsets: [0, 4.6], cue: 'dawnRing', pattern: 'ring' },
      alternate: { interval: 6.3, windup: 1.38, radius: 1.81, damage: 59, offsets: [0, -3.65, 3.65], cue: 'dawnCross', pattern: 'cross', cadence: .29 },
      charge: { interval: 6.4, windup: 1.63, radius: 2.38, damage: 65, cue: 'dawnCharge', distance: 16.8, travel: .60 },
    },
  },
];
export const RUN_TIME = STAGE_TIME * STAGES.length;

export const SPELL_LEARN_INTERVAL = 5;
export const RARITIES = {
  common: { label: '일반', level: SPELL_LEARN_INTERVAL, weight: 65 },
  rare: { label: '레어', level: SPELL_LEARN_INTERVAL * 2, weight: 23 },
  epic: { label: '에픽', level: SPELL_LEARN_INTERVAL * 3, weight: 9 },
  unique: { label: '유니크', level: SPELL_LEARN_INTERVAL * 4, weight: 3 },
} as const;
export type Rarity = keyof typeof RARITIES;
export const IGNITE_PERCENT = 35;
export const IGNITE_TICKS = 4;
export const IGNITE_UPGRADE_PERCENT = 16;
export const INFERNO_BURN_BOOST_PERCENT = 65;
export const INFERNO_HEART = { duration: 6, durationStep: 10 } as const;
export const BOMB_SPREAD_BY_RANK = [0, 10, 20, 30, 40, 50, 55, 60, 65, 70, 75] as const;
export const BOMB_MIN_SPREAD_POWER = .06;
export const BOMB_RADIUS_PERCENT = 20;
export const PILLAR_RADIUS_PERCENT = 18;
export const FIRE_BARRIER = { absorption: 54, cooldown: 12, guardTime: 1.35 } as const;
export const CINDER_MARKS = { damage: 42, targets: 5 } as const;
export const EMBER_BRAND = { damage: 62, secondaryDamage: 40, targets: 3, reach: 3.4, cooldown: 6.2 } as const;
export const CINDER_VORTEX = { reach: 5.4, duration: 4.2, interval: .64, freshDamage: 28, burningDamage: 15 } as const;
export const FLASHPOINT = { damage: 24, reach: 3.1, splash: .65 } as const;
export const PHOENIX = { damage: 56, width: .82 } as const;
export const BOLT_SLOW_PERCENT = 47;
export const BLIZZARD_SLOW_PERCENT = 47;
export const BLIZZARD_TICK_SECONDS = .52;
export const BLIZZARD_RADIUS_PER_RANK = 18;
export const SLOW_UPGRADE_PERCENT = 4;
export const SLOW_MAX_PERCENT = 85;
export const FROZEN_DAMAGE_PERCENT = 12;
export const CRIT_CHANCE_PERCENT = 2;
export const CRIT_DAMAGE_PERCENT = 5;
export const FROST_CRITICAL = { slowPercent: 60, slowTime: 2, markTime: 4, freezeTime: 1, recovery: 8 } as const;
export const FROST_CRITICAL_DETAIL = `냉기 주문 치명타는 적을 ${FROST_CRITICAL.slowTime}초간 ${FROST_CRITICAL.slowPercent}% 둔화시킵니다. ${FROST_CRITICAL.markTime}초 안에 같은 적에게 다시 치명타를 내면 ${FROST_CRITICAL.freezeTime}초간 빙결합니다. 같은 적에게 이 빙결을 다시 걸기까지 ${FROST_CRITICAL.recovery}초가 필요합니다.`;
export const FROST_BIND = { cooldown: 3.6, freeze: 1.5, damage: 39, spreadRange: 3.2, spreadFreeze: .85,
  spreadDamage: 55, reclaimTime: 2.5, refund: .6 } as const;
export const FROST_CHAIN = { damage: 50, targets: 4, extra: 2, jumpRadius: 4.4, loss: 8 } as const;
export const CHAIN_LIGHTNING = { damage: 116, bounces: 10, extra: 2, loss: 10, mitigation: 2,
  amplify: 2, amplifyStep: .5, hopDelay: .055, chargePercent: 20 } as const;
export const GLACIER_WALL = { life: 3, lifeStep: 1, halfLength: 3.2, halfWidth: .53, sizeStep: 20 } as const;
export const ABSOLUTE_ZERO = { reach: 7.1, damage: 90, chilledDamage: 135, freeze: 3.6, cooldown: 21 } as const;
export const FROZEN_ORB = { radius: 1.85, hitGrowth: 4, maxGrowth: 60 } as const;
export const GUST_FORWARD_DOT = .53;
export const RUN_XP_PERCENT = 2;
export const AREA_PERCENT = 8;
export const HASTE_COOLDOWN_PERCENT = 4;
export const BASE_REGEN_INTERVAL = 10;
export const MIN_REGEN_INTERVAL = 1;
export const MAX_STATUS_DURATION_BONUS = 5;

const FROST_COMMON = [
  { id: 'bolt', name: '얼음 화살', english: 'Frostbolt', summary: '가까운 적을 자동 공격', detail: `가장 가까운 적에게 얼음 화살을 날려 피해를 주고 이동 속도를 낮춥니다. ${FROST_CRITICAL_DETAIL}`, cooldown: 0.95 },
  { id: 'nova', name: '얼음 회오리', english: 'Frost Nova', summary: '적이 다가오면 자동 빙결', detail: '레벨업으로 습득합니다. 적이 가까워지면 자동으로 냉기 회오리를 일으켜 2.4초 동안 얼립니다. 얼음창을 함께 배우면 빙결 연계가 자동으로 이어집니다.', cooldown: 7 },
  { id: 'lance', name: '얼음창', english: 'Ice Lance', summary: '빙결된 적을 우선 관통', detail: '레벨업으로 습득합니다. 빙결된 적을 우선 겨냥해 관통하는 얼음창을 자동 발사합니다. 얼어붙은 적에게는 2배의 피해를 줍니다.', cooldown: 3.2 },
  { id: 'blizzard', name: '눈보라', english: 'Blizzard', summary: '적이 모인 곳에 자동 시전', detail: '레벨업으로 습득합니다. 사거리 안에서 적이 가장 많이 모인 곳에 자동으로 4.5초 동안 눈보라를 내립니다. 범위 안의 적은 주기적으로 피해를 받고 느려집니다.', cooldown: 12 },
  { id: 'blink', name: '점멸', english: 'Blink', summary: '위험할 때 안전한 곳으로', detail: '레벨업으로 습득합니다. 얼지 않은 적이 접근하면 주변을 살펴 더 안전한 방향으로 자동 순간이동하고 잠시 무적이 됩니다. 안전할 때는 사용하지 않습니다.', cooldown: 5.8 },
  { id: 'barrier', name: '얼음 보호막', english: 'Ice Barrier', summary: '피해 흡수 · 주기적 주변 둔화', detail: '피해를 받기 직전에 자동으로 발동해 최대 6초 동안 피해를 36까지 흡수합니다. 보호막이 남아 있는 동안 주기적으로 주변 적을 둔화시킵니다.', cooldown: 14 },
  { id: 'orb', name: '얼어붙은 구슬', english: 'Frozen Orb', summary: '적중할수록 커지는 냉기 구슬', detail: `전장을 가로지르며 주변 적에게 반복 피해를 주고 이동 속도를 낮춥니다. 피해를 준 적 하나당 해당 구슬의 반경이 기본 반경의 ${FROZEN_ORB.hitGrowth}%만큼, 최대 ${FROZEN_ORB.maxGrowth}%까지 커집니다.`, cooldown: 8.3 },
  { id: 'comet', name: '고드름 낙하', english: 'Icicle Fall', summary: '최대 3명에게 고드름 낙하', detail: '가까운 적 최대 3명을 겨냥합니다. 짧은 예고 후 고드름이 떨어져 대상과 바로 주변의 적에게 피해를 줍니다.', cooldown: 7.5 },
] as const;

const FIRE_COMMON = [
  { id: 'fireball', name: '화염구', english: 'Fireball', summary: '화염 피해 · 주변에 작열 확산', detail: `기본 주문입니다. 공격이 적중하면 주변에도 불티가 튑니다. 입힌 화염 피해의 ${IGNITE_PERCENT}%를 ${IGNITE_TICKS}번의 작열 피해로 남깁니다. 화염구와 화염 작렬의 연속 치명타는 몰아치는 열기를 발동시킵니다.`, cooldown: 1.04 },
  { id: 'fireBlast', name: '화염 작렬', english: 'Fire Blast', summary: '대상 치명타 · 주변 폭발', detail: '가까운 적에게 즉시 치명타 피해를 주고 주변에도 폭발을 일으킵니다. 이미 열기가 있다면 몰아치는 열기로 이어집니다.', cooldown: 4.9 },
  { id: 'pyro', name: '불덩이 작렬', english: 'Pyroblast', summary: '몰아치는 열기로 강력한 폭발', detail: '별도 쿨타임 없이 몰아치는 열기를 소모해 전방에 거대한 불덩이를 자동으로 발사합니다. 적중 지점 주변에도 피해를 줍니다.', cooldown: 0 },
  { id: 'flamestrike', name: '불기둥', english: 'Flamestrike', summary: '강력한 즉발 화염과 약한 잔불', detail: '적이 가장 많이 모인 곳에 불기둥을 떨어뜨려 큰 즉발 피해를 줍니다. 그 자리에 4초 동안 약한 잔불을 남깁니다. 즉발 피해는 점화를 쌓지만 잔불은 점화를 다시 만들지 않습니다.', cooldown: 8.2 },
  { id: 'livingBomb', name: '살아있는 폭탄', english: 'Living Bomb', summary: '점화가 남은 적을 따라 폭발', detail: '점화된 적을 우선해서 불씨를 붙입니다. 1.3초 뒤에 터지며, 남아 있는 점화를 소모해 추가 피해를 줍니다. 대상을 처치해도 폭발합니다. 전이 강화 시 폭발 범위 안에서 살아남은 주변 적마다 확률을 따로 굴립니다.', cooldown: 6.8 },
  { id: 'combustion', name: '발화', english: 'Combustion', summary: '위급한 순간에 연속 치명타', detail: '적이 여럿 접근하거나 근처에 보스가 있으면 발동해 6초간 화염구와 불덩이 작렬이 항상 치명타로 적중합니다.', cooldown: 22 },
  { id: 'fireBarrier', name: '타오르는 방벽', english: 'Blazing Barrier', summary: '피해 흡수 · 짧은 보호 · 주변 화염 피해', detail: `피해를 받기 직전에 자동으로 발동해 최대 6초 동안 피해를 ${FIRE_BARRIER.absorption}까지 흡수합니다. 흡수 직후 약 ${FIRE_BARRIER.guardTime}초 동안 후속 타격을 막으며, 방벽이 남아 있는 동안 주변 적을 태웁니다.`, cooldown: FIRE_BARRIER.cooldown },
  FROST_COMMON[4],
] as const;

const FROST_ADVANCED = [
  { id: 'frostChain', unlock: 'learn-frost-chain', power: 'frost-chain-power', rarity: 'rare', name: '서리 사슬', english: 'Rime Chain',
    summary: '최대 네 적에게 튕기며 둔화', detail: `가까운 적 무리를 우선해 전방의 서로 다른 적을 최대 ${FROST_CHAIN.targets}명 타격합니다. 튕길 때마다 피해는 ${FROST_CHAIN.loss}% 감소하지만 맞은 적은 모두 느려집니다. 전용 강화로 타격 대상을 늘릴 수 있습니다.`, cooldown: 5.6 },
  { id: 'iceBloom', unlock: 'learn-ice-bloom', power: 'ice-bloom-power', rarity: 'rare', name: '얼음꽃', english: 'Ice Bloom', summary: '짧은 예고 후 꽃처럼 터져 빙결', detail: '적이 모인 위치에 얼음꽃을 심습니다. 잠시 뒤 결정이 터지며 범위 피해를 주고 1.6초 동안 얼립니다.', cooldown: 7.8 },
  { id: 'rimeVolley', unlock: 'learn-rime-volley', power: 'rime-volley-power', rarity: 'rare', name: '서리 쐐기', english: 'Rime Volley', summary: '세 갈래 관통 공격과 둔화', detail: '가까운 적을 향해 세 갈래의 서리 쐐기를 동시에 날립니다. 여러 줄에 겹쳐 맞아도 한 번만 피해를 받으며, 맞은 적은 느려집니다.', cooldown: 5.8 },
  { id: 'frostBind', unlock: 'learn-frost-bind', power: 'frost-bind-power', rarity: 'rare', name: '결빙 낙인', english: 'Frost Bind', summary: '둔화된 적을 자주 빙결', detail: `아직 얼지 않은 둔화 대상 하나를 ${FROST_BIND.freeze}초간 얼립니다. 돌진을 준비 중인 보스를 우선하며, 전용 특성으로 주변에 전이하거나 주 대상이 쓰러질 때 쿨타임을 돌려받을 수 있습니다.`, cooldown: FROST_BIND.cooldown },
  { id: 'frostGale', unlock: 'learn-frost-gale', power: 'frost-gale-power', rarity: 'rare', name: '서리 돌풍', english: 'Frost Gale', summary: '부채꼴 돌풍으로 여러 적에게 둔화', detail: '적이 모여 있는 전방에 짧은 돌풍을 보냅니다. 범위 안에 피해를 주고 2초간 이동 속도를 52% 낮춥니다. 다음 냉기 연계를 준비하기 좋습니다.', cooldown: 6.0 },
  { id: 'whiteout', unlock: 'learn-whiteout', power: 'whiteout-power', rarity: 'epic', name: '백야 폭풍', english: 'Whiteout', summary: '둔화 지대에 주기적으로 빙결', detail: '적이 가장 많이 모인 곳에 5.2초간 백야를 일으킵니다. 범위 안에 반복 피해와 둔화를 주고 세 번째 파동마다 짧게 얼립니다.', cooldown: 13.2 },
  { id: 'winterMoon', unlock: 'learn-winter-moon', power: 'winter-moon-power', rarity: 'epic', name: '서리달', english: 'Winter Moon', summary: '이미 둔화·빙결된 적에게 55% 추가 피해', detail: '둔화 또는 빙결된 적이 있을 때 서리달이 내립니다. 범위 안에서 이미 차가워진 적에게 55% 추가 피해를 주고 얼립니다. 나머지 적에게는 둔화를 남깁니다.', cooldown: 9.8 },
  { id: 'glacierWall', unlock: 'learn-glacier-wall', power: null, rarity: 'epic', name: '빙하 장벽', english: 'Glacier Wall', summary: '다가오는 적을 가로막는 얼음 띠', detail: '적이 있는 곳에 3초 동안 얼음 띠를 세웁니다. 닿은 적은 한 번 피해를 받고 잠시 얼어붙습니다. 전용 강화는 피해가 아닌 지속시간과 장벽 크기를 늘립니다.', cooldown: 11.5 },
  { id: 'auroraStrike', unlock: 'learn-aurora-strike', power: 'aurora-strike-power', rarity: 'epic', name: '극광 낙뢰', english: 'Aurora Strike', summary: '보스·원거리 정예를 우선 겨냥하는 낙뢰', detail: '전방의 보스, 원거리 정예, 가까운 적 순으로 높은 피해를 주는 번개를 내리꽂습니다. 주위의 적에겐 일부만 전달됩니다.', cooldown: 9.3 },
  { id: 'absoluteZero', unlock: 'learn-absolute-zero', power: 'absolute-zero-power', rarity: 'unique', name: '절대 영도', english: 'Absolute Zero', summary: '강한 광역 빙결 · 이미 차가운 적은 추가 피해', detail: `범위 안에 적이 셋 이상이거나 보스가 있으면 전방을 강타해 ${ABSOLUTE_ZERO.freeze}초 동안 얼립니다. 이미 둔화·빙결된 적에게 더 큰 피해를 주되 상태이상을 소모하지 않습니다. 보스의 빙결 시간은 더 짧습니다.`, cooldown: ABSOLUTE_ZERO.cooldown },
  { id: 'glacialCollapse', unlock: 'learn-glacial-collapse', power: 'glacial-collapse-power', rarity: 'unique', name: '빙하 붕괴', english: 'Glacial Collapse', summary: '빙결을 소모해 파편 폭발을 일으킴', detail: '얼어붙은 적이 둘 이상 모였거나 보스가 얼면 발동합니다. 최대 네 대상의 빙결을 소모해 주변에 파편을 터뜨립니다. 얼어 있던 적은 더 큰 피해를 받으며, 빙결이 풀린 자리에 둔화가 남습니다.', cooldown: 19.5 },
  { id: 'chainLightning', unlock: 'learn-chain-lightning', power: 'chain-lightning-power', rarity: 'unique', name: '체인 라이트닝', english: 'Chain Lightning',
    summary: '전하를 모아 순서대로 튕기는 번개', detail: `기본 피해 ${CHAIN_LIGHTNING.damage}. 첫 적을 타격한 뒤 전방의 서로 다른 적에게 최대 ${CHAIN_LIGHTNING.bounces}번 튕깁니다. 비슷한 거리라면 둔화·빙결된 적을 우선해 상태를 소모하고 ${CHAIN_LIGHTNING.amplify}배 피해를 줍니다. 전이할 때마다 피해는 ${CHAIN_LIGHTNING.loss}% 감소합니다. 다른 주문의 치명타로 전하를 충전하면 다음 체인 라이트닝 전체의 피해가 ${CHAIN_LIGHTNING.chargePercent}% 증가합니다. 전하는 중첩되지 않습니다.`, cooldown: 13 },
] as const;

const FIRE_ADVANCED = [
  { id: 'emberFan', unlock: 'learn-ember-fan', power: 'ember-fan-power', rarity: 'rare', name: '잿불 부채', english: 'Ember Fan', summary: '부채꼴로 뿌리는 강한 점화', detail: '가까운 적을 향해 부채꼴 불씨를 뿌립니다. 맞은 적에게 피해를 주고, 이 주문으로 남기는 점화는 기본 점화량의 1.75배입니다.', cooldown: 5.6 },
  { id: 'flashpoint', unlock: 'learn-flashpoint', power: 'flashpoint-power', rarity: 'rare', name: '인화점', english: 'Flashpoint', summary: '점화가 가장 많이 남은 적을 폭발', detail: `직접 붙인 살아있는 폭탄의 대상은 피하고, 남은 작열이 가장 큰 적을 터뜨립니다. 기본 폭발 피해에 주 대상의 잔여 작열 전부, 주변 적에게는 그 ${FLASHPOINT.splash * 100}%를 더합니다. 폭발은 새 작열을 남기지 않습니다.`, cooldown: 5.9 },
  { id: 'cinderMarks', unlock: 'learn-cinder-marks', power: 'cinder-marks-power', rarity: 'rare', name: '불씨 표식', english: 'Cinder Marks', summary: `작열이 적은 적 최대 ${CINDER_MARKS.targets}명을 태움`, detail: `가까운 적 최대 ${CINDER_MARKS.targets}명을 동시에 겨냥합니다. 아직 타지 않는 적을 우선하며, 이미 타는 적에게 맞으면 그 위에 새 작열을 더합니다.`, cooldown: 6.2 },
  { id: 'emberBrand', unlock: 'learn-ember-brand', power: 'ember-brand-power', rarity: 'rare', name: '용광 낙인', english: 'Ember Brand', summary: '여러 적을 타격하고 작열을 빠르게', detail: `작열이 가장 많이 남은 적과 그 주변의 타고 있는 적을 최대 ${EMBER_BRAND.targets}명 타격합니다. 낙인은 기존 작열의 피해 간격을 0.8초에서 0.4초로 줄이며 그 작열을 소모하거나 늘리지 않습니다.`, cooldown: EMBER_BRAND.cooldown },
  { id: 'phoenix', unlock: 'learn-phoenix', power: 'phoenix-power', rarity: 'epic', name: '불사조 비행', english: 'Phoenix Flight', summary: '불새가 관통하며 강한 점화', detail: '불사조가 적 무리를 관통해 피해를 주고 강한 점화를 남깁니다. 이 주문으로 남기는 점화는 기본 점화량의 1.8배입니다.', cooldown: 11.8 },
  { id: 'meteor', unlock: 'learn-meteor', power: 'meteor-power', rarity: 'epic', name: '홍련 운석', english: 'Crimson Meteor', summary: '넓은 범위에 운석과 작열', detail: '적이 모인 곳을 예고한 뒤 큰 운석을 떨어뜨립니다. 범위 안의 적은 한꺼번에 강한 피해와 작열을 받습니다.', cooldown: 12.5 },
  { id: 'cinderVortex', unlock: 'learn-cinder-vortex', power: 'cinder-vortex-power', rarity: 'epic', name: '잿불 소용돌이', english: 'Cinder Vortex', summary: '시전자와 함께 움직이는 불바람', detail: `${CINDER_VORTEX.duration}초 동안 시전자를 따라 움직이는 불바람이 전방 ${CINDER_VORTEX.reach}m의 적을 반복 공격합니다. 아직 타지 않는 적에게는 더 강한 피해를 주고 작열을 남깁니다.`, cooldown: 12.8 },
  { id: 'supernova', unlock: 'learn-supernova', power: 'supernova-power', rarity: 'unique', name: '홍련 초신성', english: 'Crimson Supernova', summary: '강한 광역 폭발에 작열 피해 추가', detail: '작열 중인 적이 모이거나 보스에 충분한 작열이 쌓이면 발동합니다. 강한 폭발 피해에 소모한 작열의 일부를 더합니다. 한곳에 작열이 아주 많이 쌓이면 추가 피해의 증가폭은 줄어듭니다. 폭발은 새 작열을 만들지 않습니다.', cooldown: 20 },
  { id: 'infernoHeart', unlock: 'learn-inferno-heart', power: 'inferno-heart-power', rarity: 'unique', name: '용광의 심장', english: 'Inferno Heart', summary: `강한 불꽃 파동 후 새 작열 피해 ${INFERNO_BURN_BOOST_PERCENT}% 증폭`, detail: `적이 여럿 모이거나 가까이에 보스가 있으면 넓은 불꽃 파동으로 공격합니다. 파동을 포함해, 발동 후 기본 ${INFERNO_HEART.duration}초 동안 새로 남기는 작열 피해가 ${INFERNO_BURN_BOOST_PERCENT}% 증가합니다. 이때 추가로 입힌 작열 피해는 용광의 심장에 집계됩니다. 전용 강화로 증폭 시간을 늘릴 수 있습니다.`, cooldown: 18 },
] as const;

export const SPELLS = [...FROST_COMMON, ...FROST_ADVANCED] as const;
export const FIRE_SPELLS = [...FIRE_COMMON, ...FIRE_ADVANCED] as const;
export const ALL_SPELLS = [...SPELLS, ...FIRE_SPELLS.filter(({ id }) => id !== 'blink')] as const;
export type Spell = typeof SPELLS[number]['id'] | typeof FIRE_SPELLS[number]['id'];
export const SPELL_RARITY = Object.fromEntries(ALL_SPELLS.map((spell) => [
  spell.id, 'rarity' in spell ? spell.rarity : 'common',
])) as Record<Spell, Rarity>;
export type MageClass = 'frost' | 'fire';
export const MAGE_CLASSES = {
  frost: { name: '냉기 마법사', character: '루미', title: '꼬마 마법사', starter: 'bolt', accent: '#9aeaff', description: '빙결과 감속으로 거리를 벌리고 얼음창을 연계해요.' },
  fire: { name: '화염 마법사', character: '붉은 후드', title: '화염 마법사', starter: 'fireball', accent: '#ffb57c', description: '화염 피해로 점화를 쌓고, 남은 불길을 한꺼번에 터뜨려요.' },
} as const;
export type LearnableSpell = Exclude<Spell, 'bolt' | 'fireball'>;
export type DamageSpell = Exclude<Spell, 'blink' | 'barrier' | 'combustion'>;
export const GLOBAL_DAMAGE_PERCENT = 3;
export const SPELL_DAMAGE_PERCENT = 18;
export const COOLDOWNS = Object.fromEntries(ALL_SPELLS.map((spell) => [spell.id, spell.cooldown])) as Record<Spell, number>;
export const STAFF_RELEASE_PHASE = .32;
export const CAST_TIMES = {
  bolt: .28, nova: .47, lance: .36, blizzard: .57, blink: .36, barrier: .32, orb: .38, comet: .48,
  fireball: .30, fireBlast: .32, pyro: .43, flamestrike: .52, livingBomb: .34, combustion: .40, fireBarrier: .32,
  frostChain: .33, iceBloom: .40, whiteout: .60, winterMoon: .50, absoluteZero: .65,
  emberFan: .39, flashpoint: .34, phoenix: .55, supernova: .64,
  rimeVolley: .32, frostBind: .31, glacierWall: .48, glacialCollapse: .56,
  cinderMarks: .34, emberBrand: .31, meteor: .53, cinderVortex: .45, infernoHeart: .60,
  frostGale: .36, auroraStrike: .44, chainLightning: .54,
} satisfies Record<Spell, number>;

type AdvancedSpell = typeof FROST_ADVANCED[number] | typeof FIRE_ADVANCED[number];
const advancedUnlocks = <T extends AdvancedSpell>(spells: readonly T[]) => spells.map((spell) => ({
  id: spell.unlock, spell: spell.id, name: spell.name, description: spell.summary + '.', icon: spell.id,
}));

export const SPELL_UNLOCKS = [
  { id: 'learn-nova', spell: 'nova', name: '얼음 회오리', description: '새 주문 습득 · 적이 다가오면 자동으로 주변을 얼립니다.', icon: 'nova' },
  { id: 'learn-lance', spell: 'lance', name: '얼음창', description: '새 주문 습득 · 빙결된 적을 우선 겨냥해 자동 관통 공격합니다.', icon: 'lance' },
  { id: 'learn-blizzard', spell: 'blizzard', name: '눈보라', description: '새 주문 습득 · 적이 모인 곳에 자동으로 냉기 지대를 만듭니다.', icon: 'blizzard' },
  { id: 'learn-blink', spell: 'blink', name: '점멸', description: '새 주문 습득 · 적이 가까워지면 더 안전한 곳으로 자동 회피합니다.', icon: 'blink' },
  { id: 'learn-barrier', spell: 'barrier', name: '얼음 보호막', description: '피해를 흡수하는 동안 근처 적을 주기적으로 둔화시킵니다.', icon: 'barrier' },
  { id: 'learn-orb', spell: 'orb', name: '얼어붙은 구슬', description: '전장을 가로지르는 구슬로 주변 적에게 반복 피해와 감속을 줍니다.', icon: 'orb' },
  { id: 'learn-comet', spell: 'comet', name: '고드름 낙하', description: '가까운 적 최대 3명에게 고드름을 떨어뜨려 범위 피해를 줍니다.', icon: 'comet' },
  ...advancedUnlocks(FROST_ADVANCED),
] as const;

export const FIRE_UNLOCKS = [
  { id: 'learn-fire-blast', spell: 'fireBlast', name: '화염 작렬', description: '즉시 치명타를 내며 몰아치는 열기 연계를 이어갑니다.', icon: 'fireBlast' },
  { id: 'learn-pyro', spell: 'pyro', name: '불덩이 작렬', description: '몰아치는 열기를 소모해 적과 그 주변에 강력한 폭발을 일으킵니다.', icon: 'pyro' },
  { id: 'learn-flamestrike', spell: 'flamestrike', name: '불기둥', description: '적이 모인 곳에 불기둥과 불타는 지대를 만듭니다.', icon: 'flamestrike' },
  { id: 'learn-living-bomb', spell: 'livingBomb', name: '살아있는 폭탄', description: '적을 따라다니며 폭발할 때 대상의 남은 점화도 터뜨립니다.', icon: 'livingBomb' },
  { id: 'learn-combustion', spell: 'combustion', name: '발화', description: '위험할 때 6초 동안 화염구와 불덩이 작렬이 항상 치명타가 됩니다.', icon: 'combustion' },
  { id: 'learn-fire-barrier', spell: 'fireBarrier', name: '타오르는 방벽', description: '피해를 흡수하는 동안 근처 적을 주기적으로 태웁니다.', icon: 'fireBarrier' },
  SPELL_UNLOCKS[3],
  ...advancedUnlocks(FIRE_ADVANCED),
] as const;

const advancedPower = [...FROST_ADVANCED, ...FIRE_ADVANCED].flatMap((spell) => spell.power === null ? [] : [{
  id: spell.power, name: `${spell.name} 강화`, description: `${spell.name}의 피해가 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`,
  icon: spell.id, max: null, requires: spell.id,
}] as const);

const igniteCards = [
  ['fireball', 'fireball-ignite', '화염구'],
  ['fireBlast', 'fire-blast-ignite', '화염 작렬'],
  ['pyro', 'pyro-ignite', '불덩이 작렬'],
  ['flamestrike', 'flamestrike-ignite', '불기둥'],
  ['livingBomb', 'living-bomb-ignite', '살아있는 폭탄'],
  ['fireBarrier', 'fire-ward-ignite', '타오르는 방벽'],
  ['emberFan', 'ember-fan-ignite', '잿불 부채'],
  ['phoenix', 'phoenix-ignite', '불사조 비행'],
  ['cinderMarks', 'cinder-marks-ignite', '불씨 표식'],
  ['meteor', 'meteor-ignite', '홍련 운석'],
  ['cinderVortex', 'cinder-vortex-ignite', '잿불 소용돌이'],
  ['infernoHeart', 'inferno-heart-ignite', '용광의 심장'],
] as const;

export const UPGRADES = [
  { id: 'precision', name: '정밀한 조준', description: `치명타 확률이 ${CRIT_CHANCE_PERCENT}%p 증가합니다. 확률은 100%를 넘지 않습니다.`, icon: 'swords', max: null },
  { id: 'critical-force', name: '치명적인 일격', description: `치명타 피해 배율이 ${CRIT_DAMAGE_PERCENT}%p 증가합니다.`, icon: 'spark', max: null },
  { id: 'study', name: '배움의 기쁨', description: `이번 모험의 경험치 획득량이 ${RUN_XP_PERCENT}% 증가합니다.`, icon: 'gem', max: null },
  { id: 'regeneration', name: '빠른 재생', description: `체력 1을 회복하는 주기가 1초 짧아집니다. (최소 ${MIN_REGEN_INTERVAL}초)`,
    icon: 'heart', max: BASE_REGEN_INTERVAL - MIN_REGEN_INTERVAL },
  { id: 'status-time', name: '잔류하는 마력', description: `적에게 거는 둔화·빙결·작열의 지속시간이 1초 늘어납니다. 최대 ${MAX_STATUS_DURATION_BONUS}초 증가하며, 보스의 빙결 저항은 그대로 적용됩니다.`,
    icon: 'clock', max: MAX_STATUS_DURATION_BONUS },
  { id: 'reach', name: '넓어지는 마력', description: `범위 주문의 기본 반경이 ${AREA_PERCENT}% 증가합니다.`, icon: 'wind', max: null },
  { id: 'frozen-power', name: '빙결 파쇄', description: `빙결된 적이 받는 모든 냉기 주문 피해가 ${FROZEN_DAMAGE_PERCENT}% 증가합니다.`, icon: 'snow', max: null, requires: 'bolt' },
  { id: 'bolt-chill', name: '얼음 화살 · 냉기 강화', description: `얼음 화살의 둔화율이 ${SLOW_UPGRADE_PERCENT}%p 증가합니다. (최대 ${SLOW_MAX_PERCENT}%)`, icon: 'bolt', max: 10, requires: 'bolt' },
  { id: 'blizzard-chill', name: '눈보라 · 냉기 강화', description: `눈보라의 둔화율이 ${SLOW_UPGRADE_PERCENT}%p 증가합니다. (최대 ${SLOW_MAX_PERCENT}%)`, icon: 'blizzard', max: 10, requires: 'blizzard' },
  { id: 'shards', name: '날카로운 서리', description: `모든 냉기 주문의 피해가 ${GLOBAL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'lance', max: null, requires: 'bolt' },
  { id: 'kindling', name: '꺼지지 않는 불씨', description: `모든 화염 주문의 피해가 ${GLOBAL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'fireball', max: null, requires: 'fireball' },
  { id: 'bolt-power', name: '응축된 얼음 화살', description: `얼음 화살의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'bolt', max: null, requires: 'bolt' },
  { id: 'nova-power', name: '혹한의 회오리', description: `얼음 회오리의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'nova', max: null, requires: 'nova' },
  { id: 'lance-power', name: '날카로운 얼음창', description: `얼음창의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'lance', max: null, requires: 'lance' },
  { id: 'blizzard-power', name: '몰아치는 눈보라', description: `눈보라의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'blizzard', max: null, requires: 'blizzard' },
  { id: 'orb-power', name: '극한의 구슬', description: `얼어붙은 구슬의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'orb', max: null, requires: 'orb' },
  { id: 'twins', name: '쌍둥이 화살', description: '얼음 화살이 한 번에 적을 하나 더 겨냥합니다.', icon: 'bolt', max: 3, requires: 'bolt' },
  { id: 'cold', name: '매서운 한파', description: '얼음 화살이 18% 더 자주 발사됩니다.', icon: 'bolt', max: 3, requires: 'bolt' },
  { id: 'wide', name: '퍼지는 서리', description: '얼음 회오리의 기본 반경이 25% 늘어납니다. 처음 세 번은 빙결 시간도 0.4초씩 늘어납니다.', icon: 'nova', max: null, requires: 'nova' },
  { id: 'shatter', name: '산산조각', description: '빙결된 적에게 얼음창의 추가 피해 배율이 0.8 증가합니다.', icon: 'lance', max: 3, requires: 'lance' },
  { id: 'fingers', name: '서리의 손가락', description: '얼음 화살 적중 시 랭크당 20% 확률로, 다음 얼음창이 빙결 피해를 줍니다. 최대 2회 충전됩니다.', icon: 'lance', max: 3, requires: 'lance' },
  { id: 'storm', name: '혹한의 구름', description: `눈보라의 기본 반경이 ${BLIZZARD_RADIUS_PER_RANK}% 늘어납니다. 처음 세 번은 지속 시간도 1초씩 늘어납니다.`, icon: 'blizzard', max: null, requires: 'blizzard' },
  { id: 'bulwark', name: '겹겹이 언 얼음', description: '얼음 보호막이 피해를 12 더 흡수합니다.', icon: 'barrier', max: 3, requires: 'barrier' },
  { id: 'vortex', name: '서리 소용돌이', description: '얼어붙은 구슬의 기본 공격 반경이 15% 넓어집니다.', icon: 'orb', max: null, requires: 'orb' },
  { id: 'hail', name: '무거운 고드름', description: `고드름 낙하의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'comet', max: null, requires: 'comet' },
  { id: 'frost-bind-spread', name: '서리 전이', description: `결빙 낙인이 주 대상 ${FROST_BIND.spreadRange}m 안에서 아직 얼지 않은 다른 둔화 대상에게 단계당 1명씩 옮겨갑니다. 전이 피해는 ${FROST_BIND.spreadDamage}%, 기본 빙결은 ${FROST_BIND.spreadFreeze}초입니다.`, icon: 'frostBind', max: 2, requires: 'frostBind' },
  { id: 'frost-bind-reclaim', name: '낙인 회수', description: `시전 후 ${FROST_BIND.reclaimTime}초 안에 주 대상이 쓰러지면 결빙 낙인의 남은 쿨타임이 단계당 ${FROST_BIND.refund}초 줄어듭니다. 한 시전에 한 번만 적용됩니다.`, icon: 'frostBind', max: 2, requires: 'frostBind' },
  { id: 'frost-chain-links', name: '이어지는 서리', description: `서리 사슬이 타격할 수 있는 적이 단계당 ${FROST_CHAIN.extra}마리 더 늘어납니다.`, icon: 'frostChain', max: 3, requires: 'frostChain' },
  { id: 'chain-lightning-links', name: '번개의 사슬', description: `체인 라이트닝이 단계당 ${CHAIN_LIGHTNING.extra}번 더 튕깁니다.`, icon: 'chainLightning', max: 3, requires: 'chainLightning' },
  { id: 'chain-lightning-loss', name: '잔류 전하', description: `튕길 때의 피해 감소가 단계당 ${CHAIN_LIGHTNING.mitigation}%p 줄어듭니다. (${CHAIN_LIGHTNING.loss}% → 0%)`, icon: 'chainLightning', max: 5, requires: 'chainLightning' },
  { id: 'chain-lightning-amplify', name: '극저온 방전', description: `둔화·빙결을 소모할 때의 피해 배율이 ${CHAIN_LIGHTNING.amplifyStep}배씩 증가합니다. (${CHAIN_LIGHTNING.amplify}배 → 2.5배 → 3배)`, icon: 'chainLightning', max: 2, requires: 'chainLightning' },
  { id: 'glacier-wall-life', name: '녹지 않는 장벽', description: `빙하 장벽의 지속시간이 단계당 ${GLACIER_WALL.lifeStep}초 늘어납니다.`, icon: 'glacierWall', max: 3, requires: 'glacierWall' },
  { id: 'glacier-wall-size', name: '거대한 빙맥', description: `빙하 장벽의 기본 길이와 두께가 단계당 ${GLACIER_WALL.sizeStep}% 늘어납니다.`, icon: 'glacierWall', max: 3, requires: 'glacierWall' },
  { id: 'fireball-power', name: '응축된 화염구', description: `화염구의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'fireball', max: null, requires: 'fireball' },
  { id: 'fire-blast-power', name: '날카로운 화염', description: `화염 작렬의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'fireBlast', max: null, requires: 'fireBlast' },
  { id: 'pyro-power', name: '거대한 불덩이', description: `불덩이 작렬의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'pyro', max: null, requires: 'pyro' },
  { id: 'flamestrike-power', name: '솟구치는 불길', description: `불기둥의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'flamestrike', max: null, requires: 'flamestrike' },
  { id: 'living-bomb-power', name: '갈라지는 불꽃', description: `살아있는 폭탄의 피해만 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'livingBomb', max: null, requires: 'livingBomb' },
  { id: 'flamestrike-radius', name: '확산하는 불기둥', description: `불기둥과 잔불의 기본 반경이 ${PILLAR_RADIUS_PERCENT}% 증가합니다.`, icon: 'flamestrike', max: null, requires: 'flamestrike' },
  { id: 'bomb-radius', name: '넓은 폭발', description: `살아있는 폭탄의 기본 폭발 반경이 ${BOMB_RADIUS_PERCENT}% 증가합니다.`, icon: 'livingBomb', max: null, requires: 'livingBomb' },
  { id: 'bomb-spread', name: '전이하는 폭탄', description: `살아남은 주변 적마다 전이 확률을 따로 굴립니다. 1~5단계는 +10%p, 6~10단계는 +5%p(최대 75%)입니다. 여러 적에게 번지면 위력이 나뉘고 이후 연쇄에서 점차 약해집니다. 위력이 ${BOMB_MIN_SPREAD_POWER * 100}% 미만인 폭탄은 전이하지 않습니다.`, icon: 'livingBomb', max: BOMB_SPREAD_BY_RANK.length - 1, requires: 'livingBomb' },
  { id: 'fire-ward-power', name: '뜨거운 방벽', description: `타오르는 방벽의 주변 피해가 ${SPELL_DAMAGE_PERCENT}% 증가합니다.`, icon: 'fireBarrier', max: null, requires: 'fireBarrier' },
  { id: 'scorch', name: '이글거리는 불씨', description: '화염구와 불덩이 작렬의 치명타 확률이 7%p 증가합니다.', icon: 'combustion', max: 3, requires: 'fireball' },
  { id: 'fire-ward', name: '꺼지지 않는 방벽', description: '타오르는 방벽이 피해를 12 더 흡수합니다.', icon: 'fireBarrier', max: 3, requires: 'fireBarrier' },
  { id: 'inferno-heart-duration', name: '타오르는 심장', description: `용광의 심장이 새 작열을 강화하는 시간이 단계당 기본 지속시간의 ${INFERNO_HEART.durationStep}%만큼 늘어납니다.`, icon: 'infernoHeart', max: null, requires: 'infernoHeart' },
  { id: 'haste', name: '시간의 균열', description: `모든 자동 주문의 재사용 대기시간이 단계당 ${HASTE_COOLDOWN_PERCENT}% 감소합니다.`, icon: 'blink', max: 3 },
  { id: 'stride', name: '가벼운 발걸음', description: '이동 속도가 12% 빨라지고 점멸 거리가 늘어납니다.', icon: 'wind', max: 3 },
  { id: 'magnet', name: '눈꽃 자석', description: '경험치 결정을 끌어오는 범위가 40% 넓어집니다.', icon: 'gem', max: 3 },
  { id: 'heart', name: '따뜻한 마음', description: '최대 체력이 20 증가하고 체력을 40 회복합니다.', icon: 'heart', max: 20 },
  ...advancedPower,
  ...igniteCards.map(([spell, id, name]) => ({
    id, name: `${name} · 작열 강화`, description: `이 주문이 남기는 작열 피해가 ${IGNITE_UPGRADE_PERCENT}% 증가합니다.`,
    icon: spell, max: null, requires: spell,
  } as const)),
] as const;

export type PerkUpgrade = typeof UPGRADES[number];
export type PerkId = PerkUpgrade['id'];
export const COMMON_TALENTS = UPGRADES.filter((upgrade) => !('requires' in upgrade));
export const SPELL_DAMAGE_PERK = {
  bolt: 'bolt-power', nova: 'nova-power', lance: 'lance-power', blizzard: 'blizzard-power', orb: 'orb-power', comet: 'hail',
  fireball: 'fireball-power', fireBlast: 'fire-blast-power', pyro: 'pyro-power', flamestrike: 'flamestrike-power', livingBomb: 'living-bomb-power',
  fireBarrier: 'fire-ward-power',
  frostChain: 'frost-chain-power', iceBloom: 'ice-bloom-power', whiteout: 'whiteout-power', winterMoon: 'winter-moon-power', absoluteZero: 'absolute-zero-power',
  emberFan: 'ember-fan-power', flashpoint: 'flashpoint-power', phoenix: 'phoenix-power', supernova: 'supernova-power',
  rimeVolley: 'rime-volley-power', frostBind: 'frost-bind-power', glacierWall: null, glacialCollapse: 'glacial-collapse-power',
  frostGale: 'frost-gale-power', auroraStrike: 'aurora-strike-power', chainLightning: 'chain-lightning-power',
  cinderMarks: 'cinder-marks-power', emberBrand: 'ember-brand-power', meteor: 'meteor-power',
  cinderVortex: 'cinder-vortex-power', infernoHeart: 'inferno-heart-power',
} satisfies Record<DamageSpell, PerkId | null>;
export const SPELL_IGNITE_PERK = Object.fromEntries(igniteCards.map(([spell, id]) => [spell, id])) as Partial<Record<DamageSpell, PerkId>>;
export type SpellUnlock = typeof SPELL_UNLOCKS[number] | typeof FIRE_UNLOCKS[number];
export type Upgrade = PerkUpgrade | SpellUnlock;
export type UpgradeId = Upgrade['id'];

export function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
