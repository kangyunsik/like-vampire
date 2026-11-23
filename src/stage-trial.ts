import type { Combat } from './combat';
import { RARITIES, SPELL_LEARN_INTERVAL, SPELL_RARITY, STAGES, STAGE_TIME, UPGRADES,
  type LearnableSpell, type MageClass, type PerkId } from './data';

export type TrialBuild = 'balanced' | 'chain';
export type StageTrial = { stage: number; build: TrialBuild };

const levels = [1, 21, 30, 39, 48, 56, 64, 73, 80, 87];
const frost: LearnableSpell[] = ['nova', 'iceBloom', 'whiteout', 'glacialCollapse', 'lance', 'blizzard', 'blink', 'barrier',
  'frostChain', 'winterMoon', 'absoluteZero', 'chainLightning', 'orb', 'comet', 'frostGale', 'glacierWall', 'auroraStrike'];
const chain: LearnableSpell[] = ['blizzard', 'frostChain', 'whiteout', 'chainLightning', 'nova', 'lance', 'iceBloom', 'blink',
  'barrier', 'frostGale', 'winterMoon', 'glacialCollapse', 'absoluteZero', 'orb', 'comet', 'glacierWall'];
const fire: LearnableSpell[] = ['fireBlast', 'emberFan', 'meteor', 'infernoHeart', 'pyro', 'flamestrike', 'livingBomb', 'blink',
  'fireBarrier', 'supernova', 'flashpoint', 'combustion', 'phoenix', 'cinderVortex', 'cinderMarks', 'emberBrand'];

export function stageTrial(stage: unknown, build: unknown, mage: MageClass): StageTrial {
  if (typeof stage !== 'number' || !Number.isInteger(stage) || stage < 1 || stage > STAGES.length) {
    throw new RangeError(`스테이지 번호는 1~${STAGES.length} 사이 정수여야 해요.`);
  }
  if (build !== 'balanced' && build !== 'chain') throw new Error('빌드는 "balanced" 또는 "chain"을 사용하세요.');
  if (build === 'chain' && (mage !== 'frost' || stage === 1)) {
    throw new Error('연쇄 주문 세팅은 냉기 특성, 2스테이지부터 사용할 수 있어요.');
  }
  return { stage, build };
}

/** Used only with a freshly constructed run. The presets are shared by browser practice and headless comparisons. */
export function prepareStageTrial(run: Combat, trial: StageTrial) {
  const { stage, build } = stageTrial(trial.stage, trial.build, run.mageClass);
  if (run.time || run.kills || run.level !== 1) throw new Error('테스트는 새 모험에서 시작해야 해요.');
  if (stage === 1) return;
  run.stageIndex = stage - 1;
  run.time = run.stageIndex * STAGE_TIME;
  run.level = levels[run.stageIndex] ?? (15 + run.stageIndex * 8);
  run.enemies.length = 0;
  run.maxHp = run.hp = 100 + Math.min(80, 9 * run.stageIndex);
  const book = run.mageClass === 'fire' ? fire : build === 'chain' ? chain : frost;
  const slots = Math.floor(run.level / SPELL_LEARN_INTERVAL);
  for (const spell of book.filter((spell) => RARITIES[SPELL_RARITY[spell]].level <= run.level).slice(0, slots)) run.spells.add(spell);

  const scale = Math.min(1, (stage - 1) / 7);
  const baseline = {
    reach: 4, haste: 2, precision: 5, study: 4, regeneration: 3, 'status-time': 3, stride: 1, magnet: 1,
    ...(run.mageClass === 'fire'
      ? { kindling: 5, 'fireball-power': 5, 'flamestrike-power': 4, 'flamestrike-radius': 3, 'bomb-spread': 4, 'bomb-radius': 2 }
      : { shards: 4, 'bolt-power': 5, cold: 2, twins: 2, 'frozen-power': 3, 'blizzard-power': 5, storm: 4, 'ice-bloom-power': 3 }),
  } satisfies Partial<Record<PerkId, number>>;
  const extra: Partial<Record<PerkId, number>> = build === 'chain' ? {
    'chain-lightning-links': 3, 'chain-lightning-loss': 4, 'chain-lightning-amplify': 2, 'chain-lightning-power': 4,
    'frost-chain-power': 4, 'frost-chain-links': 3,
  } : {};
  const ranks = { ...baseline, ...extra } as Partial<Record<PerkId, number>>;
  for (const card of UPGRADES) {
    const target = ranks[card.id];
    if (!target || ('requires' in card && !run.spells.has(card.requires))) continue;
    const rank = Math.min(run.perkRankLimit(card) ?? Infinity, Math.max(extra[card.id] ? 1 : 0, Math.floor(target * scale)));
    if (rank) run.perks[card.id] = rank;
  }
}
