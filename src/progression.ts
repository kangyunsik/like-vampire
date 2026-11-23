import { MAX_STATUS_DURATION_BONUS, MIN_REGEN_INTERVAL, STAGES } from './data';

export const POINTS_PER_STAGE = 10;
export const PERMANENT_MAX_RANK = 8;

export const PERMANENT_UPGRADES = [
  { id: 'damage', name: '공격력 증가', icon: 'swords', amount: 3, unit: '%', direction: '+', detail: '모든 공격 주문의 피해가 증가합니다.' },
  { id: 'cooldown', name: '스킬 쿨타임 감소', icon: 'clock', amount: 2, unit: '%', direction: '−', detail: '모든 주문의 재사용 대기시간이 줄어듭니다.' },
  { id: 'pickup', name: '획득 범위 증가', icon: 'gem', amount: 8, unit: '%', direction: '+', detail: '경험치 구슬을 더 먼 거리에서 끌어옵니다.' },
  { id: 'speed', name: '이동 속도 증가', icon: 'wind', amount: 2, unit: '%', direction: '+', detail: '기본 이동 속도가 빨라집니다.' },
  { id: 'xp', name: '경험치 획득량 증가', icon: 'spark', amount: 5, unit: '%', direction: '+', detail: '경험치 구슬과 의뢰에서 더 많은 경험치를 얻습니다.' },
  { id: 'health', name: '최대 체력 증가', icon: 'heart', amount: 5, unit: '%', direction: '+', detail: '다음 모험의 기본 최대 체력이 늘어납니다.' },
  { id: 'recovery', name: '웨이브 회복량 증가', icon: 'shield', amount: 15, unit: '%', direction: '+', detail: '새 웨이브가 시작될 때 회복하는 체력이 늘어납니다.' },
  { id: 'regeneration', name: '체력 회복 주기 감소', icon: 'heart', amount: .5, unit: '초', direction: '−',
    detail: `체력 1을 회복하는 주기가 짧아집니다. 공용 특성과 합쳐 최소 ${MIN_REGEN_INTERVAL}초입니다.` },
  { id: 'status-time', name: '상태이상 지속시간 증가', icon: 'clock', amount: .5, unit: '초', direction: '+',
    detail: `적에게 가하는 둔화·빙결·작열이 길어집니다. 공용 특성과 합쳐 최대 ${MAX_STATUS_DURATION_BONUS}초 늘어납니다.` },
] as const;

export type PermanentId = typeof PERMANENT_UPGRADES[number]['id'];
export type PermanentRanks = Readonly<Record<PermanentId, number>>;
export type Progression = Readonly<{ version: 1; points: number; ranks: PermanentRanks }>;

const EMPTY_RANKS = Object.fromEntries(PERMANENT_UPGRADES.map(({ id }) => [id, 0])) as PermanentRanks;
const bounded = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? Math.min(max, Math.max(0, value)) : 0;

export function loadProgression(raw: string): Progression {
  try {
    const value = JSON.parse(raw) as { version?: unknown; points?: unknown; ranks?: Partial<Record<PermanentId, unknown>> } | null;
    if (value?.version === 1) {
      const ranks = { ...EMPTY_RANKS };
      for (const { id } of PERMANENT_UPGRADES) ranks[id] = bounded(value.ranks?.[id], PERMANENT_MAX_RANK);
      return { version: 1, points: bounded(value.points, Number.MAX_SAFE_INTEGER), ranks };
    }
  } catch { /* Missing or unreadable save data starts at zero. */ }
  return { version: 1, points: 0, ranks: { ...EMPTY_RANKS } };
}

export function stagePoints(cleared: number) {
  return bounded(cleared, STAGES.length) * POINTS_PER_STAGE;
}

export function addStagePoints(state: Progression, cleared: number): Progression {
  return { ...state, points: Math.min(Number.MAX_SAFE_INTEGER, state.points + stagePoints(cleared)) };
}

export function permanentPrice(rank: number) {
  return Math.ceil(10 * 1.6 ** rank);
}

export function buyPermanent(state: Progression, id: PermanentId): Progression | null {
  const rank = state.ranks[id];
  if (!Number.isInteger(rank) || rank < 0 || rank >= PERMANENT_MAX_RANK) return null;
  const price = permanentPrice(rank);
  if (state.points < price) return null;
  return { ...state, points: state.points - price, ranks: { ...state.ranks, [id]: rank + 1 } };
}

export function permanentBonuses(ranks: PermanentRanks = EMPTY_RANKS) {
  return Object.fromEntries(PERMANENT_UPGRADES.map(({ id, amount, unit, direction }) => {
    const modifier = amount * bounded(ranks[id], PERMANENT_MAX_RANK);
    return [id, unit === '%' ? 1 + modifier / 100 * (direction === '+' ? 1 : -1) : modifier];
  })) as Readonly<Record<PermanentId, number>>;
}
