import type { Combat, Point } from './combat';
import { COMMON_TALENTS, FIELD_X, FIELD_Z, QUEST_BOSS_NAME } from './data';
import { COMMON_TALENT_PRICE, QUESTS, SUPPLIES } from './expedition';
import { wrapAxis } from './field';
import { icon, spellArt } from './icons';

export const goldLabel = (gold: number) => `${gold.toLocaleString('ko-KR')} G`;
const bearings = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const bearingAt = (degrees: number) => bearings[(Math.round(degrees / 45) + 8) % 8];

export function compassHeading(heading: number) {
  const degrees = Math.round((Math.atan2(Math.sin(heading), -Math.cos(heading)) * 180 / Math.PI + 360) % 360) % 360;
  return { degrees, text: `${bearingAt(degrees)} · ${String(degrees).padStart(3, '0')}°` };
}

export function waypoint(from: Point, to: Point) {
  const dx = wrapAxis(to.x - from.x, FIELD_X), dz = wrapAxis(to.z - from.z, FIELD_Z), meters = Math.ceil(Math.hypot(dx, dz));
  const bearing = bearingAt(Math.atan2(dx, -dz) * 180 / Math.PI);
  return meters <= 3 ? '바로 근처' : `${bearing}쪽 · ${meters}m`;
}

export function expeditionMap(run: Combat) {
  const { x, z } = run.player;
  const coords = (p: Point) => `${(240 + wrapAxis(p.x - x, FIELD_X) / FIELD_X * 208).toFixed(2)} ${(180 + wrapAxis(p.z - z, FIELD_Z) / FIELD_Z * 156).toFixed(2)}`;
  const heading = Math.atan2(Math.sin(run.player.heading), -Math.cos(run.player.heading)) * 180 / Math.PI;
  const gridX = 240 - wrapAxis(x, FIELD_X / 4) / FIELD_X * 208;
  const gridZ = 180 - wrapAxis(z, FIELD_Z / 4) / FIELD_Z * 156;
  const questBoss = run.questBoss;
  const focus = run.quest ? `${run.quest.npc.name} · ${QUESTS[run.quest.npc.quest].title} 진행 중`
    : run.closestQuestNpc ? `가장 가까운 NPC: ${run.closestQuestNpc.name} · ${waypoint(run.player, run.closestQuestNpc)}` : '남은 의뢰가 없어요.';
  return `<figure class="expedition-map">
    <svg viewBox="0 0 480 360" role="img" aria-label="내 위치 중심의 설원 지도와 NPC, 의뢰 목표, 보급품 위치">
      <defs><linearGradient id="map-snow" x2="1" y2="1"><stop stop-color="#26314d"/><stop offset="1" stop-color="#211d36"/></linearGradient>
        <pattern id="map-grid" x="${gridX}" y="${gridZ}" width="104" height="78" patternUnits="userSpaceOnUse">
          <path d="M104 0H0v78" fill="none" stroke="#8a8abd" stroke-opacity=".30"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="480" height="360" rx="11" fill="url(#map-snow)"/>
      <rect x="32" y="24" width="416" height="312" fill="url(#map-grid)" stroke="#8a8abd" stroke-opacity=".35"/>
      <text x="240" y="17" fill="#eae1fb" text-anchor="middle" font-size="12">북 ↑</text>
      <text x="240" y="351" fill="#aea7ce" text-anchor="middle" font-size="10">${FIELD_X * 2} × ${FIELD_Z * 2}</text>
      <g transform="translate(${coords({ x: 0, z: 0 })})"><circle r="3" fill="#8f91b9"><title>모험 시작 위치</title></circle></g>
      ${run.questNpcs.filter((npc) => !npc.done).map((npc) => `
        <g transform="translate(${coords(npc)})" data-map-marker="npc">
          <title>${npc.name} · ${QUESTS[npc.quest].title}</title>
          <path fill="${npc === run.quest?.npc ? '#bdfaff' : '#ffd786'}" stroke="#24213a" stroke-width="1.2" d="M0-6.5 6.5 0 0 6.5-6.5 0Z"/>
        </g>`).join('')}
      ${run.supplies.map((item) => `
        <g transform="translate(${coords(item)})" data-map-marker="${item.kind}">
          <title>${SUPPLIES[item.kind].name}</title>
          <circle r="8" fill="#1c2036" stroke="${SUPPLIES[item.kind].color}" stroke-width="1.5"/>
          <path d="${item.kind === 'heart' ? 'M0 4C-9-2-3-7 0-3c3-4 9 1 0 7Z' : 'M-4-4v4a4 4 0 0 0 8 0v-4h-2v4a2 2 0 0 1-4 0v-4Z'}" fill="${SUPPLIES[item.kind].color}"/>
        </g>`).join('')}
      ${(run.quest?.signals ?? []).map((point) => `
        <g transform="translate(${coords(point)})" data-map-marker="signal">
          <title>미확인 원정대 신호</title>
          <circle r="6" fill="#1c2036" stroke="#91e8ff" stroke-width="1.5"/><circle r="2.5" fill="#91e8ff"/>
        </g>`).join('')}
      ${questBoss ? `<g transform="translate(${coords(questBoss)})" data-map-marker="quest-boss">
          <title>${QUEST_BOSS_NAME}</title>
          <path d="M0-8 7-3 5 6-5 6-7-3Z" fill="#e7aeff" stroke="#49235c" stroke-width="1.2"/>
          <path d="M-2-2h.6m2.8 0H2M-1 2h2" fill="none" stroke="#412452" stroke-width="1.6" stroke-linecap="round"/>
        </g>` : ''}
      <g transform="translate(240 180) rotate(${heading})" data-map-marker="player">
        <title>내 위치</title><circle r="11" fill="#b0dfff" fill-opacity=".18"/>
        <path d="M0-7 5 6 0 3-5 6Z" fill="#d8f4ff" stroke="#224171"/>
      </g>
    </svg>
    <figcaption><span>${icon('compass', 14)} 내 위치</span><span>${icon('quest', 14)} 의뢰 NPC</span>
      <span>${icon('heart', 14)} 회복 하트</span><span>${icon('magnet', 14)} 경험치 자석</span>
      ${run.nextQuestSignal ? `<span style="color:#91e8ff">${icon('spark', 14)} 원정대 신호</span>` : ''}
      ${questBoss ? `<span style="color:#e7aeff">${icon('skull', 14)} 의뢰 미니보스</span>` : ''}</figcaption>
  </figure><p class="tip">${icon('compass', 16)} ${focus}</p>`;
}

export function commonTalentShop(run: Combat) {
  return `<div class="points-balance quest-gold">${icon('coin', 20)} 보유 골드 <strong id="quest-gold-balance">${goldLabel(run.gold)}</strong></div>
    <div class="common-talents">${COMMON_TALENTS.map((talent) => {
      const { id, name, icon: art, description } = talent;
      const max = run.perkRankLimit(talent);
      const rank = run.perks[id] ?? 0, capped = max !== null && rank >= max;
      return `<article>
        <span class="spell-art ${art}">${spellArt(art)}</span><div><h3>${name} <small>${rank}${max === null ? '' : ` / ${max}`}단계</small></h3><p>${description}</p></div>
        <button class="secondary" type="button" data-common-talent="${id}" aria-label="${name} 강화" ${capped || run.gold < COMMON_TALENT_PRICE ? 'disabled' : ''}>
          ${capped ? '최대' : goldLabel(COMMON_TALENT_PRICE)}</button>
      </article>`;
    }).join('')}</div>`;
}
