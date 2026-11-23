import type { Point } from './combat';
import { FIELD_X, FIELD_Z, QUEST_BOSS_NAME, type Obstacle } from './data';
import { fieldDistanceSquared } from './field';

export const QUESTS = {
  hunt: { title: '설원 토벌', target: 100, unit: '마리', xp: 112, gold: 3, detail: '수락한 뒤 일반 몬스터 100마리를 처치하세요.' },
  ambush: { title: '매복 소탕', target: 18, unit: '마리', xp: 140, gold: 4, detail: '시야 밖에서 세 차례에 걸쳐 나타나는 매복 몬스터 18마리를 처치하세요. 매복 몬스터는 보라색으로 표시돼요.' },
  salvage: { title: '흩어진 수정', target: 35, unit: '개', xp: 85, gold: 2, detail: '수락한 뒤 경험치 구슬 35개를 모으세요. 자석으로 회수한 구슬도 포함돼요.' },
  guardian: { title: '균열의 수호자', target: 1, unit: '마리', xp: 195, gold: 5,
    detail: `수락하면 별도의 미니보스 ${QUEST_BOSS_NAME}가 등장해요. 경고 원을 피하면서 처치하세요. 스테이지 보스의 등장에는 영향을 주지 않아요.` },
  signals: { title: '잃어버린 신호', target: 3, unit: '곳', xp: 95, gold: 3,
    detail: '의뢰 지점에서 55–120m 떨어진 원정대 신호 세 곳을 확인하세요. 하늘색 표식에 다가가면 기록되며, 전장 지도에서도 위치를 볼 수 있어요.' },
} as const;
export type QuestKind = keyof typeof QUESTS;
export type QuestNpc = Point & { id: number; name: string; quest: QuestKind; done: boolean };
export type ActiveQuest = { npc: QuestNpc; progress: number; xp: number; spawned: number; nextSpawn: number; signals: Point[] };

export const QUEST_TALK_RADIUS = 3.2;
export const COMMON_TALENT_PRICE = 2;
export const QUEST_BUFF_SECONDS = 180;
export const QUEST_BUFFS = {
  power: { label: '공격력 +10%', color: '#ffbc92', icon: 'swords', multiplier: 1.10 },
  swift: { label: '이동 속도 +10%', color: '#9ef4e8', icon: 'wind', multiplier: 1.10 },
  vital: { label: '최대 체력 ×2', color: '#ff9bbd', icon: 'heart', multiplier: 2 },
} as const;
export type QuestBuff = keyof typeof QUEST_BUFFS;
export const QUEST_BUFF_IDS = Object.keys(QUEST_BUFFS) as QuestBuff[];

export const SUPPLIES = {
  heart: { name: '회복 하트', detail: '체력이 모두 회복됐어요.', color: '#ff8db4', first: 85, interval: 165 },
  magnet: { name: '경험치 자석', detail: '전장에 떨어진 경험치 구슬을 모두 끌어와요.', color: '#83f9ed', first: 150, interval: 165 },
} as const;
export type SupplyKind = keyof typeof SUPPLIES;
export type Supply = Point & { kind: SupplyKind; expires: number };
export const SUPPLY_KINDS = Object.keys(SUPPLIES) as SupplyKind[];
export const SUPPLY_LIFETIME = 75;

const TAU = Math.PI * 2;
const guideNames = ['순찰대원 미라', '수정학자 이오', '척후대장 루카', '탐험가 세라', '길잡이 네브', '정찰병 레아',
  '조사관 토란', '원정대원 유나', '수호병 아델', '수집가 벨', '야영지기 렌', '지도제작자 벤', '결계술사 노아'];
const questKinds = Object.keys(QUESTS) as QuestKind[];
const nearbyQuests = [
  ['hunt', 17, 26], ['signals', 35, 50], ['salvage', 44, 64], ['ambush', 57, 82], ['guardian', 66, 94],
] as const satisfies readonly [QuestKind, number, number][];

export function expeditionSites(rng: () => number, obstacles: readonly Obstacle[]) {
  function openSite(sample: () => Point, occupied: readonly Point[], spacing: number) {
    for (let attempt = 0; attempt < 96; attempt++) {
      const p = sample();
      if (obstacles.some((o) => fieldDistanceSquared(p, o) < (Math.max(o.radius, o.canopy?.radius ?? 0) + 1.8) ** 2)) continue;
      if (occupied.every((o) => fieldDistanceSquared(p, o) >= spacing ** 2)) return p;
    }
  }

  function near(center: Point, min: number, max: number, occupied: readonly Point[], spacing: number) {
    const start = rng() * TAU;
    let attempt = 0;
    return openSite(() => {
      const angle = start + attempt++ * 2.399963;
      const r = min + rng() * (max - min);
      return { x: center.x + Math.sin(angle) * r, z: center.z + Math.cos(angle) * r };
    }, occupied, spacing);
  }

  const npcs: QuestNpc[] = [];
  const addNpc = (point: Point | undefined, quest: QuestKind) => {
    if (point) npcs.push({ ...point, id: npcs.length, name: guideNames[npcs.length], quest, done: false });
  };
  for (const [quest, min, max] of nearbyQuests) {
    addNpc(near({ x: 0, z: 0 }, min, max, npcs, 24), quest);
  }
  const shift = Math.floor(rng() * questKinds.length);
  let sector = 0;
  for (const row of [-1, 0, 1]) for (const column of [-1, 0, 1]) {
    if (!row && !column) continue;
    const point = openSite(() => ({
      x: (column * 2 / 3 + (rng() - .5) * .46) * FIELD_X,
      z: (row * 2 / 3 + (rng() - .5) * .46) * FIELD_Z,
    }), npcs, 30);
    addNpc(point, questKinds[(shift + sector++) % questKinds.length]);
  }

  return {
    npcs,
    supplySite: (player: Point, occupied: readonly Point[]) => near(player, 12, 23, [...npcs, ...occupied], 4),
    signalSites(center: Point, occupied: readonly Point[]) {
      const points: Point[] = [];
      for (let i = 0; i < QUESTS.signals.target; i++) {
        const point = near(center, 55, 120, [...npcs, ...points, ...occupied], 40);
        if (!point) break;
        points.push(point);
      }
      return points;
    },
  };
}
