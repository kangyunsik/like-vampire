import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/space-grotesk';
import './style.css';
import { GameAudio } from './audio';
import { Combat, type CombatEvent, type Point } from './combat';
import {
  ALL_SPELLS, BASE_REGEN_INTERVAL, FIELD_X, FIELD_Z, FIRE_SPELLS, MAGE_CLASSES, PICKUP_STYLES, QUEST_BOSS_NAME,
  RARITIES, RUN_TIME, SPELL_LEARN_INTERVAL, SPELL_RARITY, SPELLS,
  STAGES, STAGE_TIME, WAVE_COUNT, clock, type MageClass, type PerkId, type Rarity, type Spell, type UpgradeId,
} from './data';
import { COMMON_TALENT_PRICE, QUESTS, QUEST_BUFFS, QUEST_BUFF_IDS, QUEST_BUFF_SECONDS, SUPPLIES, SUPPLY_KINDS } from './expedition';
import { commonTalentShop, compassHeading, expeditionMap, goldLabel, waypoint } from './expedition-ui';
import { wrapAxis } from './field';
import { icon, spellArt } from './icons';
import {
  PERMANENT_MAX_RANK, PERMANENT_UPGRADES, POINTS_PER_STAGE, addStagePoints, buyPermanent, loadProgression, permanentPrice, stagePoints,
  type PermanentId, type Progression,
} from './progression';
import { prepareStageTrial, stageTrial, type StageTrial } from './stage-trial';
import { World } from './world/scene';

const stageParams = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const classOrder = ['fire', 'frost'] as const;
const savedClass = readSetting('class', classOrder[0]);
let selectedClass: MageClass = classOrder.find((id) => id === savedClass) ?? classOrder[0];
const initialMage = MAGE_CLASSES[selectedClass];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="wrap topbar-inner">
      <button class="brand" type="button" data-nav="arena" aria-label="Frostfall Survivors 전장">
        <span class="brand-mark">${icon('snow', 23)}</span>
        <span class="brand-name">Frostfall<small>SURVIVORS</small></span>
      </button>
      <nav class="nav" aria-label="주 메뉴">
        <button class="nav-button selected" type="button" data-nav="arena" aria-current="page">${icon('swords', 17)} 전장</button>
        <button class="nav-button" type="button" data-nav="spellbook">${icon('book', 17)} 마법 도감</button>
        <button class="nav-button" type="button" data-nav="guide">${icon('guide', 17)} 조작 방법</button>
      </nav>
      <div class="tools">
        <button class="icon-button" id="audio" type="button" aria-label="효과음" aria-pressed="true" title="효과음 켜기 / 끄기">${icon('audio', 19)}</button>
        <button class="icon-button" id="settings" type="button" aria-label="설정" title="설정">${icon('settings', 19)}</button>
      </div>
    </div>
  </header>
  <main class="wrap layout">
    <section class="page-head" aria-labelledby="map-title">
      <div>
        <div class="eyebrow"><span class="tiny-diamond"></span> SURVIVAL ARENA</div>
        <h1 id="map-title">${STAGES[0].name}</h1>
        <p id="map-description">${STAGES[0].description}</p>
      </div>
      <div class="record">
        <span class="record-mark">${icon('trophy', 21)}</span>
        <div><span class="record-label">최고 기록</span><strong id="best-time">00:00</strong></div>
      </div>
    </section>

    <section class="arena" id="arena" aria-label="${STAGES[0].name} 3D 전장" data-state="menu" data-stage="${STAGES[0].id}" data-mage-class="${selectedClass}">
      <div class="viewport" id="viewport" aria-hidden="true"></div>
      <canvas class="damage-canvas" id="damage-canvas" aria-hidden="true"></canvas>
      <div class="arena-shade" aria-hidden="true"></div>
      <div class="hurt-vignette" id="hurt-vignette" aria-hidden="true"></div>
      <div class="arena-hud">
        <div class="vitals glass">
          <div class="level" aria-label="레벨"><span>LV</span><b id="level">01</b></div>
          <div class="meters">
            <div class="health-label">${icon('heart', 13)} <span id="health-text">100 / 100</span>
              <span class="shield-label" id="shield-label" title="남은 얼음 보호막" hidden>${icon('shield', 13)}<b id="shield-value">0</b></span>
            </div>
            <div class="meter health" id="health-bar" role="progressbar" aria-label="체력" aria-valuenow="100" aria-valuemax="100"><i id="health-fill"></i></div>
            <span id="player-slow" class="player-slow" hidden></span>
          </div>
        </div>
        <div class="run-clock glass">
          <span>${icon('clock', 14)} <time id="elapsed" datetime="PT0S">00:00</time><b class="run-limit">/ ${clock(RUN_TIME)}</b></span>
          <div class="stage-route" aria-hidden="true">${STAGES.map((stage) => `<i title="${stage.name}" style="--route-color:${stage.accent}"></i>`).join('')}</div>
          <small>스테이지 <b id="stage-number">1 / ${STAGES.length}</b><i>·</i>남은 <b id="stage-left">${clock(STAGE_TIME)}</b></small>
          <small>웨이브 <b id="wave">1</b> <i>/</i> ${WAVE_COUNT}</small>
        </div>
        <div class="arena-tools">
          <div class="kill-badge glass" title="처치 수" aria-label="처치 수">${icon('skull', 17)} <b id="kills">0</b></div>
          <button id="damage-meter-toggle" class="icon-button glass" type="button" aria-label="실시간 피해 집계" aria-keyshortcuts="T"
            aria-expanded="false" aria-controls="live-damage-meter" title="실시간 피해 집계 (T)" hidden>${icon('chart', 17)}</button>
          <button id="camera-view" class="icon-button glass" type="button" aria-label="전술 시점" aria-pressed="false" title="전술 시점 전환 (V)" disabled>${icon('camera', 17)}</button>
          <button id="pause" class="icon-button glass" type="button" aria-label="일시 정지" title="일시 정지 (Esc)" disabled>${icon('pause', 17)}</button>
          <button id="fullscreen" class="icon-button glass" type="button" aria-label="전체 화면" title="전체 화면">${icon('expand', 18)}</button>
        </div>
      </div>
      <div class="expedition-hud" id="expedition-hud" hidden>
        <div class="expedition-status">
          <div class="quest-tracker glass">
            <div class="quest-symbol">${icon('quest', 16)}</div>
            <div><strong id="quest-title"></strong><small id="quest-detail"></small></div>
            <button type="button" class="quest-talk secondary" id="quest-talk" aria-keyshortcuts="F" hidden>대화 <kbd>F</kbd></button>
          </div>
          <div class="quest-buffs" id="quest-buffs" aria-label="퀘스트 버프" hidden></div>
        </div>
        <div class="expedition-tools">
          <div class="expedition-buttons">
            <button type="button" class="glass" id="expedition-map" aria-label="전장 지도" aria-keyshortcuts="M" title="전장 지도 (M)">${icon('compass', 16)} <kbd>M</kbd></button>
            <button type="button" class="glass" id="common-talents" aria-label="공용 특성" aria-keyshortcuts="G" title="공용 특성 (G)">${icon('coin', 16)} <b id="quest-gold">0 G</b></button>
          </div>
          <div class="supply-waypoints" aria-label="전장 보급품">
            ${SUPPLY_KINDS.map((kind) => `<div class="supply-waypoint glass" data-supply="${kind}" style="--supply:${SUPPLIES[kind].color}" hidden>
              ${icon(kind, 14)} <b>${SUPPLIES[kind].name}</b><span></span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="arena-intro" id="arena-intro">
        <div class="class-picker" role="group" aria-label="마법사 특성 선택">
          ${classOrder.map((id) => `<button class="class-chip" data-class="${id}" type="button" aria-pressed="${id === selectedClass}">${icon(id === 'frost' ? 'snow' : 'flame', 15)} ${MAGE_CLASSES[id].name}</button>`).join('')}
        </div>
        <h2><span id="character-title">${initialMage.title}</span><br><em id="character-name">${initialMage.character}</em></h2>
        <p><span id="class-description">${initialMage.description}</span><br>${STAGES.length}개 스테이지 · ${RUN_TIME / 60}분 동안 살아남으세요.</p>
        <div class="menu-actions">
          <button class="primary start" id="start" type="button" aria-keyshortcuts="Enter" disabled>
            ${icon('play', 19)} <span>모험 시작</span> <kbd>ENTER</kbd>
          </button>
          <button class="secondary permanent-open" id="permanent-shop" type="button" aria-label="영구 강화">
            ${icon('gem', 16)} <span>영구 강화</span> <b id="permanent-points">0 P</b>
          </button>
        </div>
        <p id="stage-trial-status" class="mage-model-status" role="status" hidden></p>
        <p id="mage-model-status" class="mage-model-status" role="status" hidden></p>
      </div>
      <aside class="live-damage glass" id="live-damage-meter" aria-labelledby="live-damage-title" hidden>
        <header><div><h3 id="live-damage-title">실시간 피해 집계</h3><small>적의 실제 체력 손실만 집계</small></div>
          <button class="icon-button" id="damage-meter-close" type="button" aria-label="피해 집계 닫기" title="닫기 (T)">${icon('close', 15)}</button></header>
        <div class="live-damage-total"><span>총 피해</span><b id="live-damage-total">0</b></div>
        <div class="live-damage-scroll" id="live-damage-rows"></div>
      </aside>
      <div class="wave-toast glass" id="wave-toast" role="status" hidden></div>
      <div class="arena-footer">
        <div class="movement glass">
          ${icon('keyboard', 16)} <div class="key-row"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div> <span>이동</span><span class="camera-hint">좌드래그 둘러보기 · 우드래그 방향 · 휠 줌</span>
        </div>
        <div class="field-location">
          <div class="field-compass glass" id="field-compass" role="group" aria-label="나침반" hidden>
            <svg viewBox="0 0 36 36" width="33" height="33" aria-hidden="true">
              <circle cx="18" cy="18" r="10.5" fill="#262842" stroke="#8f8ab6"/>
              <path d="M18 8v3m0 14v3m-10-10h3m14 0h3" stroke="#d2c7fa"/>
              <text x="18" y="6" text-anchor="middle">N</text><text x="33" y="20" text-anchor="middle">E</text>
              <text x="18" y="35" text-anchor="middle">S</text><text x="3" y="20" text-anchor="middle">W</text>
              <path id="compass-needle" d="M18 10l4.5 13-4.5-2.5L13.5 23z" fill="#bef9ff" stroke="#26344f" stroke-width=".85"/>
            </svg>
            <b id="compass-heading">북 · 000°</b>
          </div>
          <div class="location">
            <span class="location-mark">${icon('snow', 15)}</span>
            <span><span id="location-name">${STAGES[0].english}</span><small id="location-number">스테이지 01</small></span>
          </div>
        </div>
      </div>
      <div class="experience-panel glass">
        <div class="experience-label">
          <span class="experience-title">${icon('gem', 14)} 경험치 <b>EXP</b>
            <span class="xp-legend">${Object.values(PICKUP_STYLES).map(({ label, halo }) => `<span style="--gem:${halo}">${label}</span>`).join('')}</span>
          </span>
          <span class="experience-details"><strong id="xp-text">0 / 9 · 0%</strong><span>다음 <b id="xp-next-level">LV 02</b></span></span>
        </div>
        <div class="meter experience" id="xp-bar" role="progressbar" aria-label="경험치" aria-valuemin="0" aria-valuenow="0" aria-valuemax="9" aria-valuetext="0 / 9 (0%)"><i id="xp-fill"></i></div>
      </div>
      <div class="world-error" id="world-error" role="alert" hidden>${icon('snow', 42)}<strong>전장을 불러오지 못했어요</strong><p>WebGL 2를 지원하는 데스크톱 브라우저에서<br>하드웨어 가속을 켠 뒤 다시 시도해 주세요.</p><button class="secondary" id="reload" type="button">${icon('reset', 16)} 다시 불러오기</button></div>
      <dialog class="dialog" id="game-dialog" aria-labelledby="dialog-title"><div id="dialog-content"></div></dialog>
    </section>

    <section class="loadout" aria-labelledby="loadout-title">
      <div class="loadout-head">
        <div class="loadout-name"><span class="slot-mark">${icon('snow', 17)}</span><h2 id="loadout-title">자동 주문</h2><span class="loadout-en">AUTO SPELLS</span></div>
        <div class="auto-status"><span class="heat-status" id="heat-status" role="status" hidden>${icon('flame', 14)}
          <span class="heat-pips" aria-hidden="true"><i></i><i></i></span><b id="heat-text">열기 0 / 2</b></span>
          <span class="effect-status" id="effect-status" hidden></span><i></i> 습득한 주문 <b id="spell-count">1 / ${(selectedClass === 'fire' ? FIRE_SPELLS : SPELLS).length}</b></div>
      </div>
      <div class="slots" id="spell-slots"></div>
    </section>
    <footer class="footer">
      <button id="footer-guide" class="text-button" type="button">${icon('guide', 15)} 조작 방법 보기</button>
      <span><i></i> DESKTOP EDITION <b>·</b> V0.1</span>
    </footer>
  </main>
`;

const $ = <E extends HTMLElement = HTMLElement>(selector: string) => app.querySelector<E>(selector)!;
const arena = $('#arena');
const viewport = $('#viewport');
const dialog = $<HTMLDialogElement>('#game-dialog');
const dialogContent = $('#dialog-content');
const startButton = $<HTMLButtonElement>('#start');
const stageTrialStatus = $('#stage-trial-status');
const mageModelStatus = $('#mage-model-status');
const permanentShop = $<HTMLButtonElement>('#permanent-shop');
const permanentPoints = $('#permanent-points');
const pauseButton = $<HTMLButtonElement>('#pause');
const cameraButton = $<HTMLButtonElement>('#camera-view');
const fullscreenButton = $<HTMLButtonElement>('#fullscreen');
const layout = $('.layout');
const soundButton = $('#audio');
const bestTime = $('#best-time');
const timer = $('#elapsed');
const mapTitle = $('#map-title');
const mapDescription = $('#map-description');
const stageNumber = $('#stage-number');
const stageLeft = $('#stage-left');
const route = [...app.querySelectorAll<HTMLElement>('.stage-route i')];
const locationName = $('#location-name');
const locationNumber = $('#location-number');
const fieldCompass = $('#field-compass');
const compassNeedle = app.querySelector<SVGPathElement>('#compass-needle')!;
const compassText = $('#compass-heading');
const levelText = $('#level');
const health = $('#health-text');
const healthFill = $('#health-fill');
const healthBar = $('#health-bar');
const playerSlow = $('#player-slow');
const shieldLabel = $('#shield-label');
const shieldValue = $('#shield-value');
const heatStatus = $('#heat-status');
const heatText = $('#heat-text');
const effectStatus = $('#effect-status');
const xpFill = $('#xp-fill');
const xpBar = $('#xp-bar');
const xpText = $('#xp-text');
const xpNextLevel = $('#xp-next-level');
const waveText = $('#wave');
const killsText = $('#kills');
const meterToggle = $<HTMLButtonElement>('#damage-meter-toggle');
const meterClose = $<HTMLButtonElement>('#damage-meter-close');
const liveMeter = $('#live-damage-meter');
const liveRows = $('#live-damage-rows');
const liveTotal = $('#live-damage-total');
const hurt = $('#hurt-vignette');
const toast = $('#wave-toast');
const expeditionHud = $('#expedition-hud');
const questTitle = $('#quest-title');
const questDetail = $('#quest-detail');
const questTalk = $<HTMLButtonElement>('#quest-talk');
const questBuffs = $('#quest-buffs');
const expeditionMapButton = $<HTMLButtonElement>('#expedition-map');
const commonTalentsButton = $<HTMLButtonElement>('#common-talents');
const questGold = $('#quest-gold');
const supplyWaypoints = SUPPLY_KINDS.map((kind) => ({ kind, root: $(`[data-supply="${kind}"]`), text: $(`[data-supply="${kind}"] span`) }));
const characterTitle = $('#character-title');
const characterName = $('#character-name');
const classDescription = $('#class-description');
const classButtons = [...app.querySelectorAll<HTMLButtonElement>('[data-class]')];
const slots = $('#spell-slots');
const spellCount = $('#spell-count');
const spellById = new Map<Spell, typeof ALL_SPELLS[number]>(ALL_SPELLS.map((spell) => [spell.id, spell]));
let spellCards: { element: HTMLButtonElement; id: Spell; clock: HTMLElement }[] = [];
let procBadge: HTMLElement | null = null;

function readSetting(key: string, fallback: string) {
  try { return localStorage.getItem(`frostfall.${key}`) ?? fallback; } catch { return fallback; }
}

function saveSetting(key: string, value: string) {
  try { localStorage.setItem(`frostfall.${key}`, value); } catch { /* The game still runs without storage. */ }
}

type Panel = 'guide' | 'spellbook' | 'settings' | 'pause' | 'upgrade' | 'permanent' | 'result' | 'quest' | 'quest-reward' | 'talents' | 'map';
let panel: Panel | null = null;
let progression = loadProgression(readSetting('progression', ''));
let runReward: { cleared: number; points: number } | null = null;
let questReward: Extract<CombatEvent, { kind: 'quest-complete' }> | null = null;
let best = { time: 0, kills: 0 };
try {
  const record = JSON.parse(readSetting('best', 'null')) as typeof best | null;
  if (record && Number.isFinite(record.time) && Number.isFinite(record.kills) && record.time >= 0 && record.time <= RUN_TIME && record.kills >= 0) best = record;
} catch { /* Bad record is ignored. */ }
let showNumbers = readSetting('numbers', 'on') === 'on';
const audio = new GameAudio(readSetting('sound', 'on') === 'on');

let world: World | null = null;
let game: Combat | null = null;
let trial: StageTrial | undefined;
let personalBest = false;
let toastEnd = 0;
let displayedStage = -1;
let wideCamera = false;
let meterOpen = false;
let nextMeterRefresh = 0;
let cameraFollows = true;
let cameraDrag: { id: number; button: 0 | 2; x: number; y: number } | null = null;
const keys = new Set<string>();
const directions = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

function learned(spell: Spell) {
  return game ? game.spells.has(spell) : spell === MAGE_CLASSES[selectedClass].starter;
}

function classSpells() {
  return (game?.mageClass ?? selectedClass) === 'fire' ? FIRE_SPELLS : SPELLS;
}

try {
  world = new World(viewport, $<HTMLCanvasElement>('#damage-canvas'), selectedClass);
  world.setNumbers(showNumbers);
  world.setMageClass(selectedClass);
} catch (error) {
  console.error('Frostfall: WebGL initialization failed.', error);
  arena.dataset.state = 'unavailable';
  $('#world-error').hidden = false;
}

bestTime.textContent = clock(best.time);
if (best.time) bestTime.title = `${best.kills}마리 처치`;
$('#reload').addEventListener('click', () => location.reload());

function turnPlayer(heading: number) {
  if (game) game.player.heading = game.player.angle = heading;
}

function input(dt: number): { movement: Point; turning: boolean } {
  const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const steering = cameraDrag?.button === 2;
  const turn = steering ? 0 : Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  if (turn && game) {
    const next = game.player.heading - turn * dt * 2.55;
    turnPlayer(Math.atan2(Math.sin(next), Math.cos(next)));
  }
  const strafe = Number(keys.has('KeyD') || keys.has('KeyE') || (steering && keys.has('ArrowRight')))
    - Number(keys.has('KeyA') || keys.has('KeyQ') || (steering && keys.has('ArrowLeft')));
  const movement = world?.cameraMovement(game?.player.heading ?? Math.PI, strafe, forward) ?? { x: strafe, z: -forward };
  return { movement, turning: Boolean(turn) };
}

function soundUi() {
  soundButton.innerHTML = icon(audio.enabled ? 'audio' : 'mute', 19);
  soundButton.setAttribute('aria-pressed', String(audio.enabled));
  soundButton.title = audio.enabled ? '효과음 끄기' : '효과음 켜기';
}

function setSound(value: boolean) {
  audio.toggle(value);
  saveSetting('sound', value ? 'on' : 'off');
  soundUi();
}

soundUi();

function syncNavigation() {
  for (const button of app.querySelectorAll<HTMLButtonElement>('.nav-button')) {
    const active = button.dataset.nav === (panel === 'spellbook' || panel === 'guide' ? panel : 'arena');
    button.classList.toggle('selected', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function syncState() {
  const active = Boolean(game && game.status === 'playing' && !panel);
  if (world) arena.dataset.state = game ? active ? 'playing' : 'held' : 'menu';
  pauseButton.disabled = !active;
  cameraButton.disabled = !active;
  meterToggle.hidden = !game;
  meterToggle.disabled = !active;
  expeditionMapButton.disabled = commonTalentsButton.disabled = questTalk.disabled = !active;
  if (!active) endCameraDrag();
  syncNavigation();
}

function changeCameraView(wide: boolean) {
  wideCamera = wide;
  world?.setCameraView(wide);
  cameraButton.setAttribute('aria-pressed', String(wide));
  cameraButton.title = wide ? '3인칭 시점으로 돌아가기 (V)' : '넓게 보는 전술 시점 (V)';
}

function endCameraDrag(pointerId?: number) {
  if (!cameraDrag || (pointerId !== undefined && pointerId !== cameraDrag.id)) return;
  const { id } = cameraDrag;
  cameraDrag = null;
  viewport.classList.remove('dragging');
  if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
}

function updateStageHud() {
  const index = game?.stageIndex ?? 0;
  const remaining = clock(Math.ceil(STAGE_TIME - (game?.stageTime ?? 0)));
  if (stageLeft.textContent !== remaining) stageLeft.textContent = remaining;
  if (displayedStage === index) return;
  displayedStage = index;
  const stage = STAGES[index];
  arena.dataset.stage = stage.id;
  arena.style.setProperty('--stage-accent', stage.accent);
  arena.setAttribute('aria-label', `${stage.name} 3D 전장`);
  mapTitle.textContent = stage.name;
  mapDescription.textContent = stage.description;
  stageNumber.textContent = `${index + 1} / ${STAGES.length}`;
  locationName.textContent = stage.english;
  locationNumber.textContent = `스테이지 ${String(index + 1).padStart(2, '0')}`;
  const start = game && trial ? trial.stage - 1 : 0;
  route.forEach((marker, i) => { marker.dataset.state = i === index ? 'current' : i < index && i >= start ? 'cleared' : 'ahead'; });
}

function updateSpellSlots() {
  const ids = game ? [...game.spells] : [MAGE_CLASSES[selectedClass].starter];
  if (ids.length === spellCards.length && ids.every((id, i) => spellCards[i].id === id)) return;
  slots.innerHTML = ids.map((id) => {
    const { name, summary } = spellById.get(id)!;
    return `<button class="spell-card" type="button" data-spell="${id}" data-rarity="${SPELL_RARITY[id]}" title="${name} · ${RARITIES[SPELL_RARITY[id]].label} · 자동 시전 · 설명 보기">
      <span class="spell-art ${id}">${spellArt(id)}<span class="cooldown-overlay"></span><span class="cooldown-text" aria-hidden="true"></span></span>
      ${id === 'lance' ? '<span class="proc-badge" id="proc-badge" title="서리의 손가락 충전" hidden></span>' : ''}
      <span class="spell-copy"><strong>${name}</strong><small>${summary}</small></span>
      <span class="spell-state">AUTO</span>
    </button>`;
  }).join('');
  spellCards = [...slots.querySelectorAll<HTMLButtonElement>('.spell-card')].map((element, i) => ({
    element, id: ids[i], clock: element.querySelector<HTMLElement>('.cooldown-text')!,
  }));
  procBadge = slots.querySelector('#proc-badge');
  spellCount.textContent = `${ids.length} / ${classSpells().length}`;
}

function syncClass() {
  arena.dataset.mageClass = selectedClass;
  for (const button of classButtons) button.setAttribute('aria-pressed', String(button.dataset.class === selectedClass));
  characterTitle.textContent = MAGE_CLASSES[selectedClass].title;
  characterName.textContent = MAGE_CLASSES[selectedClass].character;
  classDescription.textContent = MAGE_CLASSES[selectedClass].description;
  const name = selectedClass === 'fire' ? '타오르는 방벽' : '얼음 보호막';
  shieldLabel.title = `남은 ${name}`;
  const stageRequested = stageParams && (stageParams.has('stage') || stageParams.has('build'));
  if (stageRequested) {
    stageTrialStatus.hidden = false;
    startButton.querySelector('span')!.textContent = '테스트 시작';
    try {
      trial = stageTrial(Number(stageParams.get('stage')), stageParams.get('build') ?? 'balanced', selectedClass);
      stageTrialStatus.textContent = `테스트 모드 · ${trial.stage}스테이지${trial.build === 'chain' ? ' · 연쇄 주문 세팅' : ''} · 기록 미저장`;
    } catch (error) {
      trial = undefined;
      stageTrialStatus.textContent = error instanceof Error ? error.message : '테스트 설정을 확인해 주세요.';
    }
  }
  const invalidTrial = Boolean(stageRequested && !trial);
  world?.setMageClass(selectedClass);
  startButton.disabled = invalidTrial || !world?.hasMageModel;
  mageModelStatus.hidden = !world || world.hasMageModel;
  if (world && !world.hasMageModel) {
    mageModelStatus.textContent = '선택한 마법사를 불러오는 중…';
    const request = world.mageModelReady;
    void request.then((loaded) => {
      if (world?.mageModelReady !== request) return;
      startButton.disabled = invalidTrial || !loaded;
      mageModelStatus.hidden = loaded;
      if (!loaded) mageModelStatus.textContent = '마법사를 불러오지 못했어요. 특성을 다시 선택하면 재시도합니다.';
    });
  }
}

function updateExpeditionHud(run: Combat | null) {
  expeditionHud.hidden = !run;
  if (!run) return;
  const quest = run.quest, nearby = run.nearbyQuestNpc, closest = nearby ?? run.closestQuestNpc;
  const title = quest ? QUESTS[quest.npc.quest].title : closest ? closest.name : '모든 의뢰 완료';
  const goal = quest ? QUESTS[quest.npc.quest] : null;
  const target = run.nextQuestSignal ?? run.questBoss;
  const detail = quest && goal ? `${quest.progress} / ${goal.target}${goal.unit} · ${target ? waypoint(run.player, target) : `${goal.gold} G`}`
    : nearby ? '새 의뢰를 받을 수 있어요.' : closest ? `의뢰 NPC · ${waypoint(run.player, closest)}` : '전장에서 살아남으세요.';
  if (questTitle.textContent !== title) questTitle.textContent = title;
  if (questDetail.textContent !== detail) questDetail.textContent = detail;
  questTalk.hidden = !nearby;
  const balance = goldLabel(run.gold);
  if (questGold.textContent !== balance) questGold.textContent = balance;
  commonTalentsButton.classList.toggle('gold-ready', run.gold >= COMMON_TALENT_PRICE);
  for (const { kind, root, text } of supplyWaypoints) {
    const supply = run.supplies.find((item) => item.kind === kind);
    root.hidden = !supply;
    if (supply) {
      const label = waypoint(run.player, supply);
      if (label !== text.textContent) text.textContent = label;
    }
  }
  const buffs = QUEST_BUFF_IDS.filter((kind) => run.buffTime(kind) > 0)
    .map((kind) => ({ ...QUEST_BUFFS[kind], left: clock(Math.ceil(run.buffTime(kind))) }));
  const html = buffs.map(({ label, color, icon: art, left }) =>
    `<span class="glass" style="--buff:${color}">${icon(art, 13)} ${label} <b>${left}</b></span>`).join('');
  questBuffs.hidden = !html;
  const signature = buffs.map(({ label, left }) => `${label}:${left}`).join('/');
  if (questBuffs.dataset.state !== signature) {
    questBuffs.dataset.state = signature;
    questBuffs.innerHTML = html;
  }
}

function updateHud() {
  const now = Math.floor(game?.time ?? 0);
  const stamp = clock(now);
  if (timer.textContent !== stamp) {
    timer.textContent = stamp;
    timer.setAttribute('datetime', `PT${now}S`);
  }
  updateStageHud();
  if (meterOpen) updateDamageMeter();
  updateExpeditionHud(game);
  levelText.textContent = String(game?.level ?? 1).padStart(2, '0');
  const hp = game?.hp ?? 100, maxHp = game?.maxHp ?? 100;
  health.textContent = `${hp} / ${maxHp}`;
  const regeneration = `자동 회복: ${game?.recoveryInterval ?? BASE_REGEN_INTERVAL}초마다 체력 1`;
  if (health.title !== regeneration) health.title = regeneration;
  healthFill.style.width = `${100 * hp / maxHp}%`;
  healthBar.setAttribute('aria-valuenow', String(hp));
  healthBar.setAttribute('aria-valuemax', String(maxHp));
  const slow = game?.player.slow ?? 0;
  playerSlow.hidden = !slow;
  if (slow) {
    const text = `둔화 ${game!.player.slowPercent}% · ${Math.ceil(slow * 10) / 10}초`;
    if (playerSlow.textContent !== text) playerSlow.textContent = text;
  }
  const barrier = game?.barrier ?? 0;
  shieldLabel.hidden = !barrier;
  if (shieldValue.textContent !== String(barrier)) {
    shieldValue.textContent = String(barrier);
    shieldLabel.setAttribute('aria-label', `${shieldLabel.title} ${barrier}`);
  }
  heatStatus.hidden = game?.mageClass !== 'fire';
  if (game?.mageClass === 'fire') {
    const text = game.heat === 2 ? '몰아치는 열기 · 준비!' : game.combustion > 0 ? `발화 ${Math.ceil(game.combustion)}초` : `열기 ${game.heat} / 2`;
    if (heatText.textContent !== text) heatText.textContent = text;
    heatStatus.dataset.ready = String(game.heat === 2);
    heatStatus.dataset.heat = String(game.heat);
  }
  effectStatus.hidden = !game;
  if (game) {
    let burning = 0, chilled = 0, frozen = 0;
    for (const enemy of game.enemies) {
      if (enemy.hp <= 0) continue;
      if (enemy.ignite) burning++;
      if (enemy.frozen) frozen++;
      else if (enemy.slow) chilled++;
    }
    const text = game.mageClass === 'fire'
      ? `${game.inferno ? `용광 ${Math.ceil(game.inferno)}초 · ` : ''}작열 ${burning}명`
      : `둔화 ${chilled} · 빙결 ${frozen}`;
    if (effectStatus.textContent !== text) effectStatus.textContent = text;
    effectStatus.dataset.element = game.mageClass;
  }
  const p = game?.player;
  fieldCompass.hidden = !p;
  if (p) {
    const { degrees, text } = compassHeading(p.heading);
    if (compassText.textContent !== text) {
      compassNeedle.setAttribute('transform', `rotate(${degrees} 18 18)`);
      compassText.textContent = text;
    }
  }
  const mapX = wrapAxis(p?.x ?? 0, FIELD_X), mapZ = wrapAxis(p?.z ?? 0, FIELD_Z);
  const region = mapX < -51 ? '수정 황야' : mapX > 53 ? '성채 외곽' : mapZ < -45 ? '북쪽 고개' : mapZ > 43 ? '얼음 호수' : '';
  const where = `스테이지 ${String((game?.stageIndex ?? 0) + 1).padStart(2, '0')}${region ? ` · ${region}` : ''}`;
  if (where !== locationNumber.textContent) locationNumber.textContent = where;
  const xp = game?.xp ?? 0, goal = game?.goal ?? 9;
  const progress = Math.min(100, 100 * xp / goal);
  const percentage = Math.round(progress);
  xpFill.style.width = `${progress}%`;
  xpText.textContent = `${xp} / ${goal} · ${percentage}%`;
  xpNextLevel.textContent = `LV ${String((game?.level ?? 1) + 1).padStart(2, '0')}`;
  xpBar.setAttribute('aria-valuenow', String(Math.min(xp, goal)));
  xpBar.setAttribute('aria-valuemax', String(goal));
  xpBar.setAttribute('aria-valuetext', `${xp} / ${goal} (${percentage}%)`);
  waveText.textContent = String(game?.wave ?? 1);
  killsText.textContent = String(game?.kills ?? 0);
  hurt.style.opacity = String((game?.player.hurt ?? 0) * 2.2);
  updateSpellSlots();
  for (const card of spellCards) {
    const limit = game?.limits[card.id] ?? 0;
    const seconds = limit ? game?.cooldown[card.id] ?? 0 : 0;
    const ratio = limit ? seconds / limit : 0;
    card.element.style.setProperty('--cooldown', `${ratio * 100}%`);
    card.element.classList.toggle('cooling', seconds > 0);
    if (card.id === 'pyro') card.element.classList.toggle('hot-ready', game?.heat === 2);
    card.clock.textContent = seconds ? (seconds >= 2 ? String(Math.ceil(seconds)) : seconds.toFixed(1)) : '';
  }
  if (procBadge) {
    const charges = game?.fingers ?? 0;
    procBadge.hidden = !charges;
    procBadge.textContent = String(charges);
    procBadge.setAttribute('aria-label', `서리의 손가락 ${charges}회 충전`);
  }
  if (toastEnd && game && game.time >= toastEnd) hideToast();
}

function hideToast() {
  toast.hidden = true;
  toastEnd = 0;
}

function notice(line: string, sub: string, duration = 3.0) {
  toast.innerHTML = `${icon('snow', 22)}<div><strong>${line}</strong><small>${sub}</small></div>`;
  toast.hidden = false;
  toastEnd = (game?.time ?? 0) + duration;
}

const pointsLabel = (points: number) => `${points.toLocaleString('ko-KR')} P`;

function syncPoints() {
  permanentPoints.textContent = pointsLabel(progression.points);
}

function saveProgression(state: Progression) {
  progression = state;
  saveSetting('progression', JSON.stringify(state));
  syncPoints();
}

function begin() {
  const scene = world;
  if (!scene?.hasMageModel || startButton.disabled) return;
  audio.unlock();
  keys.clear();
  closePanel();
  runReward = null;
  questReward = null;
  setMeterOpen(false);
  game = new Combat(scene.obstacles, Math.random, (x, z, size) => scene.spawnVisible(x, z, size), selectedClass, trial ? undefined : progression.ranks);
  if (trial) prepareStageTrial(game, trial);
  cameraFollows = true;
  scene.setGame(game);
  changeCameraView(false);
  personalBest = false;
  syncState();
  updateHud();
  arena.focus({ preventScroll: true });
  audio.play('start');
  if (trial) notice(`테스트 · 스테이지 ${trial.stage} · ${game.stage.name}`, '웨이브 1 · 기록과 강화 포인트는 저장되지 않아요.');
  else notice('웨이브 1', '주문은 자동으로! 이동하며 경험치를 모으세요.');
}

function returnToArena() {
  game = null;
  setMeterOpen(false);
  questReward = null;
  world?.setGame(null);
  changeCameraView(false);
  hideToast();
  closePanel();
  syncState();
  updateHud();
  if (world) startButton.focus({ preventScroll: true });
}

function button(label: string, action: string, primary: boolean, art = '') {
  return `<button class="${primary ? 'primary' : 'secondary'}" type="button" data-action="${action}">${art}${label}</button>`;
}

function control(...labels: string[]) {
  return labels.map((text) => `<kbd>${text}</kbd>`).join('');
}

function rarityBadge(rarity: Rarity) {
  const { label, level } = RARITIES[rarity];
  return `<span class="rarity-badge" data-rarity="${rarity}"${rarity !== 'common' ? ` title="레벨 ${level}부터 등장"` : ''}>${label}</span>`;
}

function permanentContent() {
  return `<div class="points-balance">
    <span>${icon('gem', 20)} 보유 포인트</span><strong id="permanent-balance">${pointsLabel(progression.points)}</strong>
  </div>
  <div class="permanent-grid">${PERMANENT_UPGRADES.map(({ id, name, icon: art, amount, unit, direction, detail }) => {
    const rank = progression.ranks[id];
    const maxed = rank >= PERMANENT_MAX_RANK;
    const cost = permanentPrice(rank);
    const disabled = maxed || progression.points < cost;
    const bonus = (level: number) => `${level ? direction : ''}${level * amount}${unit}`;
    return `<article class="permanent-card" data-talent="${id}">
      <div class="permanent-card-head"><span class="spell-art">${spellArt(art)}</span>
        <div><h3>${name}</h3><span class="permanent-rank">${rank} / ${PERMANENT_MAX_RANK}단계</span></div>
      </div>
      <p>${detail}</p>
      <div class="permanent-stats"><span>현재 <b>${bonus(rank)}</b></span>${maxed ? '' : `<span>다음 <b>${bonus(rank + 1)}</b></span>`}</div>
      <button class="secondary permanent-buy" type="button" data-permanent="${id}" aria-label="${name} 강화${maxed ? ' 완료' : ` · ${pointsLabel(cost)}`}" ${disabled ? 'disabled' : ''}>
        <span>${maxed ? '최대 단계' : disabled ? '포인트 부족' : '강화하기'}</span>${maxed ? '' : `<b>${pointsLabel(cost)}</b>`}
      </button>
    </article>`;
  }).join('')}</div>`;
}

const formatDamage = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const formatShare = new Intl.NumberFormat('ko-KR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

function sortedDamage(run: Combat) {
  const damage = [...run.spellDamage].sort((a, b) => b[1] - a[1]);
  return { damage, total: damage.reduce((sum, [, amount]) => sum + amount, 0) };
}

function setMeterOpen(open: boolean) {
  meterOpen = open;
  liveMeter.hidden = !open;
  meterToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    nextMeterRefresh = -1;
    liveRows.scrollTop = 0;
    updateDamageMeter();
  }
}

function updateDamageMeter() {
  if (!game || game.time < nextMeterRefresh) return;
  nextMeterRefresh = game.time + .25;
  const { damage, total } = sortedDamage(game);
  liveTotal.textContent = formatDamage.format(total);
  liveRows.innerHTML = damage.length ? `<table aria-labelledby="live-damage-title">
    <thead><tr><th scope="col">주문</th><th scope="col" aria-sort="descending">누적 피해</th><th scope="col">비중</th></tr></thead><tbody>
    ${damage.map(([id, amount]) => `<tr data-live-spell="${id}">
      <th scope="row"><span>${spellById.get(id)!.name}</span><i aria-hidden="true" style="--share:${total ? amount * 100 / total : 0}%"></i></th>
      <td>${formatDamage.format(amount)}</td><td>${formatShare.format(total ? amount / total : 0)}</td>
    </tr>`).join('')}</tbody></table>` : '<p>아직 입힌 주문 피해가 없어요.</p>';
}

function damageReport(run: Combat) {
  const { damage, total } = sortedDamage(run);
  return `<section class="damage-report" aria-labelledby="damage-heading">
    <header><div><h3 id="damage-heading">주문별 피해량</h3><small>적의 실제 체력 손실 · 초과 피해 제외</small></div>
      <span>총 피해 <strong>${formatDamage.format(total)}</strong></span></header>
    ${damage.length ? `<table aria-labelledby="damage-heading">
      <thead><tr><th scope="col">주문</th><th scope="col" aria-sort="descending">누적 피해</th><th scope="col">비중</th></tr></thead>
      <tbody>${damage.map(([id, amount]) => `<tr data-damage-spell="${id}">
        <th scope="row"><span class="damage-spell"><span class="spell-art ${id}">${spellArt(id)}</span>${spellById.get(id)!.name}</span></th>
        <td>${formatDamage.format(amount)}</td><td>${formatShare.format(total ? amount / total : 0)}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p>이번 모험에서 적에게 준 주문 피해가 없어요.</p>'}
  </section>`;
}

function openPanel(next: Panel, focusSpell?: string) {
  const npc = next === 'quest' ? game?.nearbyQuestNpc : undefined;
  if (next === 'quest-reward' && !questReward) return;
  if ((next === 'quest' && !npc) || (['quest', 'talents', 'map'].includes(next) && game?.status !== 'playing')) return;
  keys.clear();
  panel = next;
  dialog.className = `dialog${['upgrade', 'permanent', 'talents', 'map'].includes(next) ? ` ${next}-dialog` : ''}`;
  let title: string, subtitle: string, glyph: string, content: string;
  const closeButton = next === 'upgrade' || next === 'result' ? '' : `<button class="icon-button dialog-close" type="button" data-action="close" aria-label="닫기">${icon('close', 18)}</button>`;
  if (next === 'guide') {
    title = '조작 방법';
    subtitle = `${FIELD_X * 2}×${FIELD_Z * 2} 전장에서 ${STAGES.length}개 스테이지를 버티세요. 각 ${STAGE_TIME / 60}분씩, 총 ${RUN_TIME / 60}분이에요.`;
    glyph = icon('keyboard', 23);
    content = `<div class="guide-table">
      <div><span>전진·후진 / 좌우 옆걸음</span><span>${control('W', 'S')} <small>/</small> ${control('A', 'D')}</span></div>
      <div><span>키보드로 방향 돌리기</span><span>${control('←', '→')}</span></div>
      <div><span>둘러보기 / 캐릭터 방향 전환</span><span>왼쪽 / 오른쪽 버튼 드래그</span></div>
      <div><span>카메라 확대·축소</span><span>마우스 휠</span></div>
      <div><span>전술 시점 전환 · 뒤로 시점 맞추기</span><span>${control('V', 'C')}</span></div>
      <div><span>NPC와 대화 · 공용 특성 · 전장 지도</span><span>${control('F', 'G', 'M')}</span></div>
      <div><span>실시간 피해 집계 열기·닫기</span><span>${control('T')}</span></div>
      <div><span>습득한 주문 · 위험할 때 점멸</span><span class="guide-auto">자동 시전</span></div>
      <div><span>레벨업 주문 / 강화 선택</span><span>${control('1', '2', '3')}</span></div>
      <div><span>일시 정지</span><span>${control('ESC')}</span></div>
    </div>
    <p class="tip">${icon('spark', 16)} ${spellById.get(MAGE_CLASSES[selectedClass].starter)!.name} 하나로 시작해요. 모든 주문은 자동 시전돼요. 공격은 캐릭터가 바라보는 전방 180°만 조준하며, 시전해도 방향은 바뀌지 않아요. 민트색은 일반, 보라색은 정예, 금빛은 보스 경험치예요.</p>
    <ol class="guide-route">${STAGES.map((stage, i) => `<li><b>${clock(i * STAGE_TIME)}–${clock((i + 1) * STAGE_TIME)}</b><span>${stage.name}<small>보스 · ${stage.boss.name}</small></span></li>`).join('')}</ol>`;
  } else if (next === 'spellbook') {
    title = '마법 도감';
    subtitle = game ? '이번 모험에서 획득한 주문을 순서대로 보여줘요.'
      : `새 주문은 ${SPELL_LEARN_INTERVAL}레벨마다 고를 수 있어요. 레어·에픽·유니크는 각각 레벨 ${RARITIES.rare.level}·${RARITIES.epic.level}·${RARITIES.unique.level}부터 등장해요.`;
    glyph = icon('book', 23);
    const book = game ? [...game.spells].map((id) => spellById.get(id)!) : classSpells();
    content = `<div class="spellbook">${book.map(({ id, name, english, detail, cooldown }) => `
      <article class="entry${id === focusSpell ? ' highlighted' : ''}" data-entry="${id}" data-rarity="${SPELL_RARITY[id]}">
        <span class="spell-art ${id}">${spellArt(id)}</span>
        <div><h3>${name} <small>${english}</small></h3><p>${detail}</p></div>
        <span class="entry-key">${rarityBadge(SPELL_RARITY[id])}<b class="entry-state${learned(id) ? ' learned' : ''}">${learned(id) ? '자동 시전' : '레벨업 습득'}</b><small>${cooldown ? `${cooldown}초` : '쿨타임 없음'}</small></span>
      </article>`).join('')}</div>`;
  } else if (next === 'permanent') {
    title = '영구 강화';
    subtitle = `모험을 마칠 때 완료한 스테이지마다 ${POINTS_PER_STAGE} P를 얻어요. 구매한 강화는 두 직업의 다음 모험에 모두 적용돼요.`;
    glyph = icon('gem', 23);
    content = permanentContent();
  } else if (next === 'talents') {
    title = '공용 특성';
    subtitle = `퀘스트에서 받은 골드로 이번 모험의 공용 특성을 강화해요. 1단계당 ${goldLabel(COMMON_TALENT_PRICE)}이며 영구 강화와는 별도예요.`;
    glyph = icon('coin', 23);
    content = commonTalentShop(game!);
  } else if (next === 'map') {
    title = '전장 지도';
    subtitle = '내 위치를 중심으로 NPC와 보급품을 표시해요. 설원의 맞은편이 이어지며, M을 다시 누르면 닫혀요.';
    glyph = icon('compass', 23);
    content = expeditionMap(game!);
  } else if (next === 'quest' && npc) {
    const quest = QUESTS[npc.quest];
    title = quest.title;
    subtitle = `${npc.name}의 의뢰 · 완료 시 보상은 즉시 지급돼요.`;
    glyph = icon('quest', 23);
    content = `<div class="quest-brief"><p>${quest.detail}</p>
      <div><span>${icon('gem', 17)} 경험치 ${game!.questXp(npc.quest)}</span><span>${icon('coin', 17)} ${goldLabel(quest.gold)}</span>
      <span>${icon('spark', 17)} 무작위 ${QUEST_BUFF_SECONDS / 60}분 버프</span></div>
      <small>${QUEST_BUFF_IDS.map((kind) => QUEST_BUFFS[kind].label).join(' · ')} 중 하나</small></div>
      <div class="dialog-buttons">${button('나중에', 'close', false)}
      <button type="button" class="primary" data-npc="${npc.id}">${icon('quest', 17)} 의뢰 수락</button></div>`;
  } else if (next === 'quest-reward' && questReward) {
    const reward = questReward, buff = QUEST_BUFFS[reward.buff];
    title = '퀘스트 완료';
    subtitle = `${QUESTS[reward.quest].title} · 아래 보상이 이미 지급됐어요.`;
    glyph = icon('trophy', 23);
    content = `<div class="quest-reward-grid">
      <div>${icon('gem', 19)} <small>경험치</small><strong>+${reward.xp.toLocaleString('ko-KR')}</strong></div>
      <div>${icon('coin', 19)} <small>골드</small><strong>+${goldLabel(reward.gold)}</strong></div>
      <div style="--reward:${buff.color}">${icon(buff.icon, 19)} <small>${QUEST_BUFF_SECONDS / 60}분 버프</small><strong>${buff.label}</strong></div>
    </div><div class="dialog-buttons">${game?.status === 'playing' && game.gold >= COMMON_TALENT_PRICE ? button('공용 특성', 'talents', false, icon('coin', 16)) : ''}
      ${button(game?.status === 'upgrade' ? '레벨 업 보러 가기' : '계속하기', 'close', true, icon('play', 17))}</div>`;
  } else if (next === 'settings') {
    title = '설정';
    subtitle = '나에게 맞는 전장 환경으로 바꿔 보세요.';
    glyph = icon('settings', 23);
    content = `<div class="settings-list">
      <label><span><b>효과음</b><small>주문 시전, 전투, 레벨업 효과음</small></span><input type="checkbox" id="sound-setting"${audio.enabled ? ' checked' : ''}><i></i></label>
      <label><span><b>피해 수치</b><small>적이 입은 피해를 숫자로 표시</small></span><input type="checkbox" id="numbers-setting"${showNumbers ? ' checked' : ''}><i></i></label>
    </div>`;
  } else if (next === 'pause') {
    title = '일시 정지';
    subtitle = '잠시 쉬어 가도 좋아요.';
    glyph = icon('pause', 23);
    content = `<div class="dialog-buttons">${button('전장 나가기', 'menu', false)}${button('계속하기', 'close', true, icon('play', 18))}</div>`;
  } else if (next === 'upgrade') {
    title = '레벨 업!';
    const { level, choices, spells } = game!;
    const nextSpellLevel = (Math.floor(level / SPELL_LEARN_INTERVAL) + 1) * SPELL_LEARN_INTERVAL;
    const learning = choices.some((choice) => 'spell' in choice);
    subtitle = `레벨 ${level} · ${learning ? '새 주문을 고르세요.' : '배운 주문이나 능력을 강화하세요.'}`
      + (!learning && spells.size < classSpells().length ? ` 다음 새 주문은 레벨 ${nextSpellLevel}에 선택할 수 있어요.` : '');
    glyph = icon('spark', 22);
    content = `<div class="upgrade-options">${game!.choices.map((choice, i) => {
      const fresh = 'spell' in choice;
      const label = 'spell' in choice ? '새 주문 습득' : `능력 강화 · ${(game!.perks[choice.id] ?? 0) + 1}단계`;
      const rarity = fresh ? SPELL_RARITY[choice.spell] : 'common';
      return `<button class="upgrade-card${fresh ? ' new-spell' : ''}" type="button" data-upgrade="${choice.id}" data-rarity="${rarity}">
        <span class="spell-art ${choice.icon}">${spellArt(choice.icon)}</span><kbd>${i + 1}</kbd>
        <span class="upgrade-kind">${rarityBadge(rarity)} ${label}</span>
        <strong>${choice.name}</strong><small>${choice.description}</small>
      </button>`;
    }).join('')}</div>`;
  } else {
    const won = game?.status === 'won';
    const skipped = (trial?.stage ?? 1) - 1;
    title = trial ? (won ? '테스트를 완주했어요!' : '테스트가 끝났어요') : won ? `${STAGES.length}개 스테이지를 모두 버텼어요!` : '모험이 끝났어요';
    subtitle = trial ? `테스트 모드 · ${trial.stage}스테이지부터 시작했어요. 기록과 강화 포인트는 저장되지 않아요.`
      : won ? `${MAGE_CLASSES[game?.mageClass ?? selectedClass].character}의 모험: ${RUN_TIME / 60}분 동안 ${WAVE_COUNT * STAGES.length}번의 웨이브를 모두 버텨냈어요.`
        : `${game?.stage.name ?? STAGES[0].name} 스테이지에서 여정이 끝났어요. 다른 주문 조합으로 다시 도전해 보세요.`;
    glyph = icon(won ? 'trophy' : 'snow', 23);
    content = `${personalBest ? `<div class="record-ribbon">${icon('trophy', 15)} 새로운 최고 기록</div>` : ''}
      <div class="result-stats">
        <div><strong>${clock((game?.time ?? 0) - skipped * STAGE_TIME)}</strong><small>생존 시간</small></div>
        <div><strong>${game?.kills ?? 0}</strong><small>처치 수</small></div>
        <div><strong>${game?.level ?? 1}</strong><small>도달 레벨</small></div>
        <div><strong>${runReward?.cleared ?? 0} / ${STAGES.length - skipped}</strong><small>클리어한 스테이지</small></div>
      </div>
      <div class="result-points">${icon('gem', 19)} <span>획득한 강화 포인트 <small>${trial ? '테스트 모드에서는 지급하지 않아요.' : `완료한 스테이지 × ${POINTS_PER_STAGE} P`}</small></span><strong id="reward-points">+${pointsLabel(runReward?.points ?? 0)}</strong></div>
      ${game ? damageReport(game) : ''}
      <div class="dialog-buttons">${button('메인으로', 'menu', false)}${trial ? '' : button('영구 강화', 'permanent', false, icon('gem', 16))}${button('다시 도전', 'restart', true, icon('reset', 17))}</div>`;
  }

  const focusTitle = next === 'upgrade' || next === 'result';
  dialogContent.innerHTML = `${closeButton}
    <header class="dialog-head"><span class="dialog-icon">${glyph}</span><h2 id="dialog-title"${focusTitle ? ' tabindex="-1" autofocus' : ''}>${title}</h2><p>${subtitle}</p></header>${content}`;
  if (!dialog.open) dialog.showModal();
  else {
    dialog.scrollTop = 0;
    const initialFocus = dialogContent.querySelector<HTMLElement>('[autofocus]') ?? dialogContent.querySelector<HTMLElement>('button, input');
    initialFocus?.focus({ preventScroll: true });
  }
  dialogContent.querySelector('#sound-setting')?.addEventListener('change', (event) => setSound((event.target as HTMLInputElement).checked));
  dialogContent.querySelector('#numbers-setting')?.addEventListener('change', (event) => {
    showNumbers = (event.target as HTMLInputElement).checked;
    saveSetting('numbers', showNumbers ? 'on' : 'off');
    world?.setNumbers(showNumbers);
  });
  if (focusSpell) dialogContent.querySelector(`[data-entry="${focusSpell}"]`)?.scrollIntoView({ block: 'nearest' });
  syncState();
}

function closePanel() {
  if (panel === 'quest-reward') {
    questReward = null;
    if (game?.status === 'upgrade') {
      openPanel('upgrade');
      return;
    }
  }
  const wasOpen = dialog.open;
  panel = null;
  if (wasOpen) dialog.close();
  syncState();
  if (wasOpen && game?.status === 'playing') arena.focus({ preventScroll: true });
}

function choose(id: UpgradeId) {
  const choice = game?.choices.find((option) => option.id === id);
  if (!game?.choose(id)) return;
  if (game.status === 'upgrade') openPanel('upgrade');
  else {
    closePanel();
    arena.focus({ preventScroll: true });
  }
  updateHud();
  if (choice && 'spell' in choice) notice('새 주문을 배웠어요!', `${choice.name} · 이제 자동으로 시전돼요.`);
}

function finishRun() {
  if (!game || runReward || (game.status !== 'won' && game.status !== 'lost')) return;
  const cleared = game.clearedStages - ((trial?.stage ?? 1) - 1);
  setMeterOpen(false);
  runReward = { cleared, points: trial ? 0 : stagePoints(cleared) };
  if (runReward.points) saveProgression(addStagePoints(progression, cleared));
  const { time, kills } = game;
  const seconds = Math.floor(time);
  personalBest = !trial && (seconds > best.time || (seconds === best.time && kills > best.kills));
  if (personalBest) {
    best = { time: seconds, kills };
    saveSetting('best', JSON.stringify(best));
    bestTime.textContent = clock(best.time);
    bestTime.title = `${kills}마리 처치`;
  }
  hideToast();
  audio.play(game.status === 'won' ? 'win' : 'lose');
  openPanel('result');
}

function runEvent(event: CombatEvent) {
  world?.addEvent(event);
  audio.combat(event);
  if (event.kind === 'stage') {
    audio.play('start');
    const stage = STAGES[event.index];
    notice(`스테이지 ${event.index + 1} · ${stage.name}`, '체력 완전 회복 · 같은 전장에 새 적이 합류해요.', 4.5);
  } else if (event.kind === 'wave') {
    audio.play('wave');
    notice(`웨이브 ${event.wave}`, event.wave === WAVE_COUNT ? '보스가 시야 밖에서 접근 중이에요.' : `체력을 최대 ${game?.waveRecovery ?? 14} 회복했어요.`);
  } else if (event.kind === 'boss') {
    const boss = STAGES.find((stage) => stage.boss.kind === event.boss)!.boss;
    notice(`${boss.name} 등장!`, boss.warning ?? '다음 스테이지까지 버티세요.', 4.5);
  } else if (event.kind === 'supply') {
    audio.play('collect');
    const item = SUPPLIES[event.supply];
    notice(`${item.name} 획득`, event.supply === 'magnet' ? `전장의 경험치 구슬 ${event.count}개를 끌어와요.` : item.detail);
  } else if (event.kind === 'quest-complete') {
    audio.play('level');
    if (game?.status === 'playing' || game?.status === 'upgrade') {
      questReward = event;
      openPanel('quest-reward');
    }
  } else if (event.kind === 'quest-boss') {
    audio.play('wave');
    notice(`${QUEST_BOSS_NAME} 등장!`, '의뢰 미니보스 · 발밑의 균열 파동과 연속 낙하를 피하세요.', 4.5);
  } else if (event.kind === 'quest-signal') {
    audio.play('collect');
  }
}

arena.tabIndex = -1;
startButton.addEventListener('click', begin);
permanentShop.addEventListener('click', () => { if (!game) openPanel('permanent'); });
for (const button of classButtons) {
  button.addEventListener('click', () => {
    if (game) return;
    selectedClass = button.dataset.class === 'fire' ? 'fire' : 'frost';
    saveSetting('class', selectedClass);
    syncClass();
    updateHud();
  });
}
pauseButton.addEventListener('click', () => openPanel('pause'));
questTalk.addEventListener('click', () => openPanel('quest'));
commonTalentsButton.addEventListener('click', () => openPanel('talents'));
expeditionMapButton.addEventListener('click', () => openPanel('map'));
cameraButton.addEventListener('click', () => {
  changeCameraView(!wideCamera);
  arena.focus({ preventScroll: true });
});
viewport.addEventListener('pointerdown', (event) => {
  if (!world || panel || game?.status !== 'playing' || cameraDrag || (event.button !== 0 && event.button !== 2)) return;
  event.preventDefault();
  arena.focus({ preventScroll: true });
  cameraDrag = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY };
  cameraFollows = event.button === 2;
  if (cameraFollows) turnPlayer(world.cameraHeading);
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('dragging');
});
viewport.addEventListener('pointermove', (event) => {
  if (!world || !game || !cameraDrag || cameraDrag.id !== event.pointerId) return;
  const heading = world.orbitCamera(event.clientX - cameraDrag.x, event.clientY - cameraDrag.y);
  if (cameraDrag.button === 2) turnPlayer(heading);
  cameraDrag.x = event.clientX;
  cameraDrag.y = event.clientY;
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  viewport.addEventListener(name, (event) => endCameraDrag(event.pointerId));
}
viewport.addEventListener('contextmenu', (event) => { if (game?.status === 'playing') event.preventDefault(); });
viewport.addEventListener('wheel', (event) => {
  if (panel || game?.status !== 'playing' || event.ctrlKey) return;
  event.preventDefault();
  const units = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientHeight : 1;
  world?.zoomCamera(event.deltaY * units);
}, { passive: false });
soundButton.addEventListener('click', () => {
  setSound(!audio.enabled);
  if (game?.status === 'playing') arena.focus({ preventScroll: true });
});
meterToggle.addEventListener('click', () => {
  setMeterOpen(!meterOpen);
  arena.focus({ preventScroll: true });
});
meterClose.addEventListener('click', () => {
  setMeterOpen(false);
  arena.focus({ preventScroll: true });
});
$('#settings').addEventListener('click', () => openPanel('settings'));
$('#footer-guide').addEventListener('click', () => openPanel('guide'));

for (const element of app.querySelectorAll<HTMLButtonElement>('[data-nav]')) {
  element.addEventListener('click', () => {
    const nav = element.dataset.nav;
    if (nav === 'arena') {
      if (panel && panel !== 'upgrade' && panel !== 'result') closePanel();
      arena.scrollIntoView({ block: 'nearest' });
      if (game?.status === 'playing') arena.focus({ preventScroll: true });
    } else if (nav === 'guide' || nav === 'spellbook') {
      openPanel(nav);
    }
  });
}

slots.addEventListener('click', (event) => {
  const card = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-spell]');
  if (card?.dataset.spell) openPanel('spellbook', card.dataset.spell);
});

dialog.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const upgrade = target.closest<HTMLButtonElement>('[data-upgrade]')?.dataset.upgrade as UpgradeId | undefined;
  if (upgrade) { choose(upgrade); return; }
  const talent = target.closest<HTMLButtonElement>('[data-common-talent]')?.dataset.commonTalent as PerkId | undefined;
  if (talent && panel === 'talents') {
    if (game?.buyCommonTalent(talent)) {
      openPanel('talents');
      dialogContent.querySelector<HTMLButtonElement>(`[data-common-talent="${talent}"]:enabled`)?.focus({ preventScroll: true });
      updateHud();
    }
    return;
  }
  const npc = target.closest<HTMLButtonElement>('[data-npc]')?.dataset.npc;
  if (npc !== undefined && panel === 'quest') {
    if (game?.acceptQuest(Number(npc))) {
      closePanel();
      updateHud();
    }
    return;
  }
  const permanent = target.closest<HTMLButtonElement>('[data-permanent]')?.dataset.permanent as PermanentId | undefined;
  if (permanent && panel === 'permanent' && !game) {
    const next = buyPermanent(progression, permanent);
    if (next) {
      saveProgression(next);
      openPanel('permanent');
      dialogContent.querySelector<HTMLButtonElement>(`[data-permanent="${permanent}"]:enabled`)?.focus();
    }
    return;
  }
  const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
  if (action === 'close') closePanel();
  else if (action === 'menu') returnToArena();
  else if (action === 'restart') begin();
  else if (action === 'talents' && panel === 'quest-reward' && game?.status === 'playing') {
    questReward = null;
    openPanel('talents');
  }
  else if (action === 'permanent' && panel === 'result') {
    returnToArena();
    openPanel('permanent');
  }
  else if (target === dialog && panel !== 'upgrade' && panel !== 'result') closePanel();
});
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (panel !== 'upgrade' && panel !== 'result') closePanel();
});

fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await layout.requestFullscreen();
    if (game?.status === 'playing') arena.focus({ preventScroll: true });
  } catch {
    fullscreenButton.title = '이 브라우저에서는 전체 화면을 사용할 수 없어요.';
  }
});
document.addEventListener('fullscreenchange', () => {
  const expanded = Boolean(document.fullscreenElement);
  fullscreenButton.innerHTML = icon(expanded ? 'shrink' : 'expand', 18);
  fullscreenButton.setAttribute('aria-label', expanded ? '전체 화면 닫기' : '전체 화면');
  fullscreenButton.title = expanded ? '전체 화면 닫기' : '전체 화면';
});

window.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const code = event.code;
  if (panel) {
    if (code === 'Escape' || (code === 'KeyM' && panel === 'map')) {
      event.preventDefault();
      if (!event.repeat && panel !== 'upgrade' && panel !== 'result') closePanel();
      return;
    }
    if (panel === 'upgrade' && !event.repeat) {
      const option = /^Digit[1-3]$/.test(code) ? game?.choices[Number(code.at(-1)) - 1] : undefined;
      if (option) { event.preventDefault(); choose(option.id); }
    }
    return;
  }
  const interactive = (event.target as HTMLElement | null)?.closest?.('button, input, select, textarea, a');
  if (code === 'Enter' && !game && world && !interactive) {
    event.preventDefault();
    if (!event.repeat) begin();
    return;
  }
  if (game?.status !== 'playing') return;
  if (code === 'Escape' && !event.repeat) {
    event.preventDefault();
    openPanel('pause');
  } else if (code === 'KeyT' && !event.repeat) {
    event.preventDefault();
    setMeterOpen(!meterOpen);
  } else if ((code === 'KeyF' || code === 'KeyG' || code === 'KeyM') && !event.repeat) {
    event.preventDefault();
    openPanel(code === 'KeyF' ? 'quest' : code === 'KeyG' ? 'talents' : 'map');
  } else if ((code === 'KeyV' || code === 'KeyC') && !event.repeat) {
    event.preventDefault();
    if (code === 'KeyV') changeCameraView(!wideCamera);
    else {
      endCameraDrag();
      cameraFollows = true;
      world?.centerCamera(game.player.heading);
    }
  } else if (directions.has(code)) {
    event.preventDefault();
    keys.add(code);
  } else if (code === 'Space' && !interactive) {
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => { keys.delete(event.code); });
window.addEventListener('blur', () => { keys.clear(); endCameraDrag(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game?.status === 'playing' && !panel) openPanel('pause');
});

syncState();
syncClass();
syncPoints();
updateHud();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let last = performance.now();
let animationTime = .31;

function loop(now: number) {
  const dt = Math.min(.12, Math.max(0, (now - last) / 1000));
  last = now;
  let followHeading = false;
  const controls = !panel && game?.status === 'playing' ? input(dt) : null;
  if (controls) {
    if (!cameraDrag && (controls.turning || controls.movement.x || controls.movement.z)) cameraFollows = true;
    followHeading = !cameraDrag && cameraFollows;
  }
  world?.prepareView(game, dt, followHeading);
  if (!panel) {
    if (game && controls) {
      const iterations = Math.max(1, Math.ceil(dt / .024));
      for (let i = 0; i < iterations; i++) game.step(dt / iterations, controls.movement);
    }
    if (game?.status === 'upgrade') openPanel('upgrade');
    else if (game?.status === 'lost' || game?.status === 'won') finishRun();
    if (game || !reducedMotion.matches) animationTime += dt;
  }
  if (game?.events.length) {
    for (const event of game.events) runEvent(event);
    game.events.length = 0;
  }
  if (game) updateHud();
  world?.draw(game, animationTime, dt, Boolean(panel) || (!game && reducedMotion.matches));
  requestAnimationFrame(loop);
}

if (world) requestAnimationFrame(loop);
