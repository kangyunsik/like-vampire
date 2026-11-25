import * as T from 'three';
import type { Combat, CombatEvent, Enemy, Point } from '../combat';
import { makeEnemy } from './actors';
import { crystalGeometry, part, random, ring, surface } from './art';
import { OrbitCamera } from './camera';
import { BossWarning, ChargeWarning, bossHazardTone } from './boss-hazards';
import { effectPlane, etchedSurface, livingWings, moltenCore, streamingRibbon, torchTrail } from './element-vfx';
import { ExpeditionArt } from './expedition-art';
import { frostRibbon, frostRibbonGeometry, loadFrostBurst, loadFrostShard, prismaticIce } from './frost-vfx';
import { makePlayableMage } from './lumi-meshy';
import { loadPuffSlime } from './puff-slime';
import { groundSquare, heightAt, makeShadowMaterial, makeTerrain } from './terrain';
import { SpellFlashes, frostShard, iceSpear, phoenixWing } from './spell-effects';
import { CasterAuras, SpellFields } from './spell-fields';
import { WinterWeather } from './winter-weather';
import { ENEMY_KINDS, PICKUP_STYLES, QUEST_BOSS, QUEST_BOSS_NAME, STAGES, WAVE_MOB_LIMIT, isBoss, rangedElite,
  type EnemyKind, type MageClass, type Spell } from '../data';
import { SUPPLIES } from '../expedition';

const CAPACITY = WAVE_MOB_LIMIT + 64;
const RUN_FOG_DISTANCE = 101;
const ENEMY_HEALTH_BAR_RANGE = 30;
const ATMOSPHERE_SECONDS = 6;
const ice = surface('#acefff', .90, true);
const lightIce = surface('#aee9ff', .72, true);
const lavender = surface('#ad98fb', .86, true);
const basic = (color: string, opacity = 1) => new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
const gemCore = new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
const gemRing = new T.RingGeometry(.82, 1, 24).rotateX(-Math.PI / 2);
const gemGlow = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .94, depthWrite: false, toneMapped: false, side: T.DoubleSide });
const gemColors = Object.fromEntries(Object.entries(PICKUP_STYLES).map(([tier, look]) => [tier, { core: new T.Color(look.core), halo: new T.Color(look.halo) }]));
const fireBright = surface('#ffe49d', .84, true);
const staffEmissions = new Set<Spell>(['bolt', 'lance', 'fireball', 'fireBlast', 'pyro', 'phoenix', 'orb', 'frostChain', 'chainLightning', 'rimeVolley', 'emberFan', 'frostGale', 'cinderMarks']);
const atmospheres = {
  grove: { fog: '#7884bb', background: '#8391c7', sky: '#d2e8ff', ground: '#9289be', sun: '#fff2e2', bounce: '#aabfff', moon: '#d9bdff', air: '#ffffff', turf: '#ffffff' },
  cavern: { fog: '#2e758b', background: '#27576d', sky: '#a9ffed', ground: '#5ba3ad', sun: '#aff2ff', bounce: '#57e4c9', moon: '#adbbff', air: '#8fffee', turf: '#83c0cd' },
  citadel: { fog: '#63568a', background: '#463960', sky: '#dcceff', ground: '#8380bd', sun: '#ffcbdc', bounce: '#ada6fa', moon: '#ffc6f1', air: '#dcc0ff', turf: '#baa4e6' },
  pass: { fog: '#7399bd', background: '#536988', sky: '#c0edff', ground: '#526ba2', sun: '#ffdff1', bounce: '#99c7ff', moon: '#c9f3ff', air: '#a8e4ff', turf: '#b4c6f2' },
  eclipse: { fog: '#49425e', background: '#282842', sky: '#b2b8ed', ground: '#504571', sun: '#ffc3ac', bounce: '#9d8ac5', moon: '#e4a6c6', air: '#efbeaf', turf: '#9987b6' },
  workshop: { fog: '#806a60', background: '#4a3b4b', sky: '#ffd69c', ground: '#706081', sun: '#ffe3bb', bounce: '#db9370', moon: '#f0b690', air: '#ffcf86', turf: '#c2a086' },
  abyss: { fog: '#42447c', background: '#212143', sky: '#c8c1ff', ground: '#3f5c93', sun: '#c3edff', bounce: '#66f1cf', moon: '#f897e8', air: '#9bffe0', turf: '#87a1b5' },
  tempest: { fog: '#527f92', background: '#344e60', sky: '#c1f1ff', ground: '#537f91', sun: '#c5f3ff', bounce: '#79efff', moon: '#99b8ff', air: '#a8f8ff', turf: '#a0dce5' },
  rift: { fog: '#58406f', background: '#37264f', sky: '#e3bafa', ground: '#5b397d', sun: '#deacff', bounce: '#a1baff', moon: '#ffa7d7', air: '#deb6ff', turf: '#b4a1dc' },
  dawn: { fog: '#9e686d', background: '#704856', sky: '#ffe2aa', ground: '#8b576d', sun: '#fff0b7', bounce: '#f9b2af', moon: '#ffd285', air: '#ffe5ba', turf: '#f1c2b3' },
};
const wind = [.81, .43, .66, 1.20, .70, .75, .64, 1.35, 1.06, .58];

function instanced(scene: T.Object3D, geometry: T.BufferGeometry, material: T.Material, count: number) {
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

type Bit = {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number;
  size: number; spin: number; tint: T.Color; fire: boolean; settled?: boolean;
};
type Wave = { mesh: T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>; life: number; max: number; radius: number; opacity: number };
type NumberFx = { x: number; z: number; text: string; age: number; dx: number; color: string };

const shades = ['#b5efff', '#82cfff', '#c8b8ff', '#fcf2ff'].map((value) => new T.Color(value));
const embers = ['#ff846b', '#ffb057', '#ffcf77', '#fff2b5'].map((value) => new T.Color(value));
const preview: { kind: EnemyKind; x: number; z: number; size: number; phase: number; angle: number }[] = [
  { kind: 'puff', x: -4.18, z: -1.64, size: 1.24, phase: .5, angle: .44 },
  { kind: 'puff', x: 3.25, z: .62, size: 1.13, phase: 1.9, angle: -.43 },
  { kind: 'hare', x: 2.36, z: -3.66, size: 1.28, phase: 4, angle: -.3 },
  { kind: 'puff', x: -2.31, z: 4.83, size: .88, phase: 3.1, angle: .38 },
];

export class World {
  readonly obstacles;
  private scene = new T.Scene();
  private spellFlashes = new SpellFlashes(this.scene);
  private expedition = new ExpeditionArt(this.scene);
  private ground: T.MeshStandardMaterial;
  private updateGround: (x: number, z: number) => void;
  private background = new T.Color();
  private blendColor = new T.Color();
  private lastAtmosphere = '';
  private sky = new T.HemisphereLight('#d2e8ff', '#9289be', 1.76);
  private sun = new T.DirectionalLight('#fff2e2', 2.2);
  private bounce = new T.DirectionalLight('#aabfff', .78);
  private moon = new T.DirectionalLight('#d9bdff', .80);
  private camera: OrbitCamera;
  private viewProjection = new T.Matrix4();
  private frustum = new T.Frustum();
  private visibilitySphere = new T.Sphere();
  private renderer: T.WebGLRenderer;
  private context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private resolution = 1;
  private fog = new T.Fog('#7884bb', 24, 55);
  private mage: ReturnType<typeof makePlayableMage>;
  private mages = new Map<MageClass, ReturnType<typeof makePlayableMage>>();
  private mageClass: MageClass;
  private mageShadow: T.Mesh;
  private auras = new CasterAuras(this.scene);
  private fields = new SpellFields(this.scene);
  private xform = new T.Object3D();
  private vector = new T.Vector3();
  private enemies = new Map<EnemyKind, T.InstancedMesh[]>();
  private enemyHeights = new Map<EnemyKind, number>();
  private enemyShadows: T.InstancedMesh;
  private frost: T.InstancedMesh;
  private chillRings: T.InstancedMesh;
  private frostCages: T.InstancedMesh;
  private igniteRings: T.InstancedMesh;
  private questMarks: T.InstancedMesh;
  private heatCrown: T.InstancedMesh;
  private spawnGlint: T.InstancedMesh;
  private gems: T.InstancedMesh;
  private gemHalos: T.InstancedMesh;
  private gemBeams: T.InstancedMesh;
  private bolt: T.InstancedMesh;
  private frostGlow: T.InstancedMesh;
  private frostTrail: T.InstancedMesh;
  private frostTrailMaterial = frostRibbon();
  private iceMaterials: T.ShaderMaterial[] = [];
  private flurries: T.InstancedMesh;
  private lance: T.InstancedMesh;
  private phoenix: T.InstancedMesh;
  private phoenixMaterial = livingWings();
  private fireShots: T.InstancedMesh;
  private fireCore = moltenCore();
  private meteor: T.InstancedMesh;
  private meteorCore = moltenCore(true);
  private fireTrails: T.InstancedMesh;
  private plasmaTrails: T.InstancedMesh;
  private plasmaMaterial = streamingRibbon('#f04324', '#ffe59e', .78, false, true);
  private bombFuses: T.InstancedMesh;
  private fuseMaterial = etchedSurface('brand', '#ff6f48', '#ffe08b', .94, true);
  private orbCore: T.InstancedMesh;
  private orbMaterial = prismaticIce('#b4ebff', .98, true);
  private orbBands: T.InstancedMesh;
  private icicles: T.InstancedMesh;
  private frostAssetsRequested = false;
  private spellRings: T.InstancedMesh;
  private streak: T.InstancedMesh;
  private weather: WinterWeather;
  private airTint = new T.Color();
  private magic: T.InstancedMesh;
  private rain: T.InstancedMesh;
  private flameRain: T.InstancedMesh;
  private warnings: BossWarning[] = [];
  private chargeWarnings: ChargeWarning[] = [];
  private bits: Bit[] = [];
  private waves: Wave[] = [];
  private numbers: NumberFx[] = [];
  private projectileOrigins = new WeakMap<Point, { point: T.Vector3; age: number }>();
  private projectilePosition = new T.Vector3();
  private staffTip = new T.Vector3();
  private rng = random(Math.floor(Date.now()));
  private damageNumbers = true;
  private modelScale = 1.3;

  constructor(private holder: HTMLElement, private overlay: HTMLCanvasElement, mageClass: MageClass = 'frost') {
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#7784b9');
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.holder.appendChild(this.renderer.domElement);
    this.context = overlay.getContext('2d')!;
    this.mageClass = mageClass;
    this.mage = makePlayableMage(mageClass);
    this.mages.set(mageClass, this.mage);
    this.scene.fog = this.fog;
    this.scene.background = this.background;

    this.sun.position.set(-8, 15, 8);
    this.bounce.position.set(7, 9, -11);
    this.moon.position.set(-8, 3, -12);
    this.scene.add(this.sky, this.sun, this.bounce, this.moon);

    const terrain = new T.Group(), shadow = makeShadowMaterial();
    const { obstacles, groundMaterial, updateGround } = makeTerrain(terrain, shadow);
    this.obstacles = obstacles;
    this.ground = groundMaterial;
    this.updateGround = updateGround;
    this.camera = new OrbitCamera(heightAt, obstacles);
    this.scene.add(terrain, this.mage.root);
    this.mageShadow = part(this.scene, groundSquare, shadow);
    for (const kind of ENEMY_KINDS) this.setEnemyModel(kind, makeEnemy(kind));
    void loadPuffSlime().then((model) => this.setEnemyModel('puff', model)).catch(() => {
      // Keep the procedural enemy if the local model cannot load.
    });
    this.enemyShadows = instanced(this.scene, groundSquare, shadow, CAPACITY);
    this.frost = instanced(this.scene, new T.TorusGeometry(.75, .047, 5, 20).rotateX(-Math.PI / 2), basic('#74eafa', .82), CAPACITY);
    this.chillRings = instanced(this.scene, new T.RingGeometry(.80, 1, 6).rotateX(-Math.PI / 2), basic('#8cc7ff', .80), CAPACITY);
    this.frostCages = instanced(this.scene, crystalGeometry, basic('#a8f6ff', .79), CAPACITY * 4);
    this.igniteRings = instanced(this.scene, new T.RingGeometry(.86, 1, 31).rotateX(-Math.PI / 2), basic('#ff8b4a', .84), CAPACITY);
    this.questMarks = instanced(this.scene, new T.RingGeometry(.84, 1, 5).rotateX(-Math.PI / 2), basic('#ec9fff', .92), 24);
    this.heatCrown = instanced(this.scene, crystalGeometry, basic('#ffe38c', .96), 12);
    this.spawnGlint = instanced(this.scene, new T.TorusGeometry(1, .043, 5, 22).rotateX(-Math.PI / 2), basic('#d7b8ff', .6), 32);
    this.gems = instanced(this.scene, crystalGeometry, gemCore, 1024);
    this.gemHalos = instanced(this.scene, gemRing, gemGlow, 1024);
    this.gemBeams = instanced(this.scene, new T.CylinderGeometry(.096, .17, 1, 10, 1, true), basic('#ffca77', .54), 20);
    this.bolt = instanced(this.scene, frostShard, ice, 96);
    this.frostGlow = instanced(this.scene, frostShard, new T.MeshBasicMaterial({ color: '#83daff', transparent: true, opacity: .23,
      blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }), 136);
    this.frostTrail = instanced(this.scene, frostRibbonGeometry, this.frostTrailMaterial, 174);
    this.flurries = instanced(this.scene, crystalGeometry, basic('#a7f8ff', .80), 320);
    this.lance = instanced(this.scene, iceSpear, lavender, 48);
    this.phoenix = instanced(this.scene, phoenixWing, this.phoenixMaterial, 20);
    this.fireShots = instanced(this.scene, new T.IcosahedronGeometry(1, 2), this.fireCore, 40);
    this.meteor = instanced(this.scene, new T.DodecahedronGeometry(1, 1).scale(.91, 1.04, .88), this.meteorCore, 9);
    this.fireTrails = instanced(this.scene, crystalGeometry, basic('#ff7f44', .59), 72);
    this.plasmaTrails = instanced(this.scene, torchTrail, this.plasmaMaterial, 88);
    this.bombFuses = instanced(this.scene, effectPlane, this.fuseMaterial, 56);
    this.orbCore = instanced(this.scene, new T.IcosahedronGeometry(1, 1), this.orbMaterial, 12);
    this.orbBands = instanced(this.scene, new T.TorusGeometry(1, .028, 5, 36, Math.PI * 1.55),
      basic('#94e8ff', .65), 30);
    this.icicles = instanced(this.scene, crystalGeometry, lightIce, 32);
    this.spellRings = instanced(this.scene, new T.RingGeometry(.93, 1, 36).rotateX(-Math.PI / 2), basic('#93e8ff', .57), 24);
    this.streak = instanced(this.scene, crystalGeometry, basic('#c299ff', .61), 128);
    this.magic = instanced(this.scene, crystalGeometry, new T.MeshBasicMaterial({ color: '#ffffff' }), 600);
    this.rain = instanced(this.scene, crystalGeometry, lightIce, 150);
    this.flameRain = instanced(this.scene, crystalGeometry, fireBright, 280);
    this.weather = new WinterWeather(this.scene, heightAt);
    if (mageClass === 'frost') this.loadIceArt();
    this.updateAtmosphere(null);
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(holder);
    this.resize();
  }

  private setEnemyModel(kind: EnemyKind, model: T.Group) {
    const pieces = model.children as T.Mesh[];
    const previous = this.enemies.get(kind);
    this.enemyHeights.set(kind, new T.Box3().setFromObject(model).max.y);
    this.enemies.set(kind, pieces.map((mesh) => instanced(this.scene, mesh.geometry, mesh.material as T.Material, CAPACITY)));
    for (const mesh of previous ?? []) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }

  private updateAtmosphere(game: Combat | null) {
    const index = game?.stageIndex ?? 0;
    const progress = index ? T.MathUtils.smoothstep(game!.stageTime, 0, ATMOSPHERE_SECONDS) : 1;
    const state = `${index}:${progress}`;
    if (state === this.lastAtmosphere) return;
    this.lastAtmosphere = state;
    const from = atmospheres[STAGES[Math.max(0, index - 1)].id];
    const to = atmospheres[STAGES[index].id];
    const tint = (color: T.Color, key: keyof typeof to) => color.set(from[key]).lerp(this.blendColor.set(to[key]), progress);
    tint(this.background, 'background');
    tint(this.fog.color, 'fog');
    tint(this.sky.color, 'sky');
    tint(this.sky.groundColor, 'ground');
    tint(this.sun.color, 'sun');
    tint(this.bounce.color, 'bounce');
    tint(this.moon.color, 'moon');
    tint(this.ground.color, 'turf');
    tint(this.airTint, 'air');
    this.weather.climate(this.airTint, T.MathUtils.lerp(wind[Math.max(0, index - 1)], wind[index], progress));
  }

  private resize() {
    this.width = Math.max(1, this.holder.clientWidth);
    this.height = Math.max(1, this.holder.clientHeight);
    this.camera.resize(this.width / this.height);
    this.resolution = Math.min(devicePixelRatio, 1.65, Math.sqrt(2_100_000 / (this.width * this.height)));
    this.renderer.setPixelRatio(this.resolution);
    this.renderer.setSize(this.width, this.height, false);
    this.overlay.width = Math.round(this.width * this.resolution);
    this.overlay.height = Math.round(this.height * this.resolution);
    this.context.setTransform(this.resolution, 0, 0, this.resolution, 0, 0);
  }

  setNumbers(enabled: boolean) {
    this.damageNumbers = enabled;
    if (!enabled) this.numbers = [];
  }

  addEvent(event: CombatEvent) {
    if ('bombPower' in event && (event.bombPower ?? 1) < .06) return;
    if (event.kind === 'strike' && event.spell === 'livingBomb' && event.damage < 1) return;
    const tip = event.kind === 'cast' || (event.kind === 'chain-lightning-hit' && !event.hop) ? this.staffOrigin() : undefined;
    this.spellFlashes.add(event, tip, this.mageClass);
    if (event.kind === 'enemy-blast') {
      const { form, color } = bossHazardTone(event.cue);
      if (!event.cue) this.wave(event.x, event.z, event.radius, .46, color, .91);
      this.burst(event.x, event.z, event.elite ? 7 : event.cue ? 12 : 9, .48, 1.9, form === 'fire' || form === 'gear');
    } else if (event.kind === 'comet-impact') {
      this.wave(event.x, event.z, event.radius, .42, '#b2efff', .83);
      this.burst(event.x, event.z, 12, .59, 1.6);
    } else if (event.kind === 'fireburst') {
      this.burst(event.x, event.z, 9, .74, 1.73, true);
    } else if (event.kind === 'ignite-burst') {
      this.burst(event.x, event.z, event.spell === 'supernova' ? 36 : 13, .86, 2.3, true);
    } else if (event.kind === 'hot-streak') {
      this.burst(event.x, event.z, 9, 1.30, 1.16, true);
    } else if (event.kind === 'block') {
      this.burst(event.x, event.z, 7, 1.25, 1.1, this.mageClass === 'fire');
      if (this.damageNumbers && this.numbers.length < 45) this.numbers.push({
        x: event.x, z: event.z, text: `흡수 ${event.absorbed}`, age: 0, dx: 0, color: this.mageClass === 'fire' ? '#ffda9d' : '#b8fff2',
      });
    } else if (event.kind === 'cast') {
      if (event.spell === 'nova') {
        for (let i = 0; i < 25; i++) {
          const a = (event.heading ?? 0) + (this.rng() - .5) * Math.PI, r = 1.1 + this.rng() * 2.3;
          this.burst(event.x + Math.sin(a) * r, event.z + Math.cos(a) * r, 1, .18, 1.6);
        }
      } else if (event.spell === 'blink' && event.to) {
        this.burst(event.to.x, event.to.z, 6, .89, .92, this.mageClass === 'fire');
      } else if (event.spell === 'blizzard' && event.to) {
        this.wave(event.to.x, event.to.z, event.radius ?? 4, .51, '#95dfff', .74);
        this.burst(event.x, event.z, 9, 1.25, 1.4);
      } else if (event.spell === 'barrier') {
        this.wave(event.x, event.z, 1.42, .47, '#aaffed', .78);
      } else if (event.spell === 'fireBarrier' || event.spell === 'combustion') {
        this.wave(event.x, event.z, event.spell === 'combustion' ? 2.2 : 1.42, .48, '#ffb476', .89);
        this.burst(event.x, event.z, 13, 1.16, 1.7, true);
      } else if (!staffEmissions.has(event.spell)) {
        this.burst(event.x, event.z, 4, 1.25, .93, this.mageClass === 'fire' && event.spell !== 'blink');
      }
    } else if (event.kind === 'strike') {
      if (event.spell === 'lance') this.wave(event.x, event.z, .82, .24, event.frozen ? '#b2f6ff' : '#bf99ff', .61);
      if (!event.dot) this.burst(event.x, event.z, event.spell === 'lance' ? 8 : event.frozen || event.critical ? 6 : 3, .71, .74, event.fire);
      if (this.damageNumbers && this.numbers.length < 45) this.numbers.push({
        x: event.x, z: event.z, text: `${event.dot ? '·' : ''}${Number(event.damage.toFixed(event.damage % 1 ? 1 : 0))}${event.critical ? '!' : ''}`,
        age: 0, dx: (this.rng() - .5) * 22,
        color: event.critical ? '#ffdc94' : event.dot ? '#ff9b63' : event.fire ? '#ffc6a8' : event.frozen ? '#a7f2ff' : '#fbf3ff',
      });
    } else if (event.kind === 'vanish') {
      this.burst(event.x, event.z, 9, .50, 1.75);
    } else if (event.kind === 'collect') {
      this.burst(event.x, event.z, 5, .64, .75);
    } else if (event.kind === 'supply') {
      this.wave(event.x, event.z, event.supply === 'magnet' ? 8.2 : 3.1, .76, SUPPLIES[event.supply].color, .93);
      this.burst(event.x, event.z, 18, .7, 1.5);
    } else if (event.kind === 'quest-signal') {
      this.wave(event.x, event.z, 3.25, .64, '#91e8ff', .94);
      this.burst(event.x, event.z, 14, .7, 1.35);
    }
  }

  private burst(x: number, z: number, count: number, y: number, speed: number, fire = false) {
    const floor = heightAt(x, z);
    for (let i = 0; i < count && this.bits.length < 580; i++) {
      const a = this.rng() * Math.PI * 2, v = (.40 + this.rng() * 2.6) * speed;
      const life = .23 + this.rng() * .52;
      this.bits.push({
        x: x + (this.rng() - .5) * .48, y: y + floor + this.rng() * .48, z: z + (this.rng() - .5) * .48,
        vx: Math.cos(a) * v, vy: .82 + this.rng() * 2.1 * speed, vz: Math.sin(a) * v, life, max: life,
        size: .055 + this.rng() * .11, spin: this.rng() * 9, tint: (fire ? embers : shades)[Math.floor(this.rng() * shades.length)], fire,
      });
    }
  }

  private wave(x: number, z: number, radius: number, life: number, tint: string, opacity: number) {
    const mesh = ring(this.scene, 1, .05, basic(tint, opacity), x, heightAt(x, z) + .195, z) as Wave['mesh'];
    this.waves.push({ mesh, life, max: life, radius, opacity });
  }

  setGame(game: Combat | null) {
    this.clearEffects();
    if (game) {
      this.setMageClass(game.mageClass);
      this.setCameraView(false);
      this.camera.snap(game.player);
    } else this.mage.root.rotation.y = -.115;
  }

  setMageClass(id: MageClass) {
    if (id === 'frost') this.loadIceArt();
    if (id === this.mageClass && this.mage.root.userData.model !== 'unavailable') return;
    this.mage.root.removeFromParent();
    let mage = this.mages.get(id);
    if (!mage || mage.root.userData.model === 'unavailable') { mage = makePlayableMage(id); this.mages.set(id, mage); }
    this.mage = mage;
    this.mageClass = id;
    this.scene.add(mage.root);
  }

  get mageModelReady() { return this.mage.ready; }
  get hasMageModel() { return this.mage.root.userData.model === 'meshy'; }

  private loadIceArt() {
    if (this.frostAssetsRequested) return;
    this.frostAssetsRequested = true;
    void loadFrostShard().then((upright) => {
      const shaft = upright.clone().rotateX(Math.PI / 2);
      const spear = shaft.clone().scale(.63, .83, 1.12);
      const boltIce = prismaticIce('#6fbfff', 1, true);
      const lanceIce = prismaticIce('#aa8bff', 1, true);
      const fallingIce = prismaticIce('#6ddcff', .98, true);
      this.bolt.geometry = shaft;
      this.bolt.material = boltIce;
      this.lance.geometry = spear;
      this.lance.material = lanceIce;
      this.icicles.geometry = upright;
      this.icicles.material = fallingIce;
      this.iceMaterials = [boltIce, lanceIce, fallingIce];
      this.spellFlashes.setFrostShard(upright);
    }).catch(() => { /* Retain procedural effects if the local art cannot load. */ });
    void loadFrostBurst().then((geometry) => this.spellFlashes.setFrostBurst(geometry)).catch(() => {});
  }

  get cameraHeading() { return this.camera.heading; }
  orbitCamera(dx: number, dy: number) { return this.camera.orbit(dx, dy); }
  zoomCamera(delta: number) { this.camera.zoom(delta); }
  setCameraView(wide: boolean) { this.camera.preset(wide); }
  centerCamera(heading: number) { this.camera.center(heading); }
  cameraMovement(heading: number, strafe: number, forward: number): Point { return this.camera.movement(heading, strafe, forward); }

  private clearEffects() {
    this.spellFlashes.clear();
    this.bits = [];
    this.numbers = [];
    this.projectileOrigins = new WeakMap();
    for (const { mesh } of this.waves) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.waves = [];
  }

  private set(mesh: T.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, angle = 0, lean = 0, roll = 0) {
    if (index >= mesh.instanceMatrix.count) return;
    this.xform.position.set(x, y, z);
    this.xform.scale.set(sx, sy, sz);
    this.xform.rotation.set(lean, angle, roll);
    this.xform.updateMatrix();
    mesh.setMatrixAt(index, this.xform.matrix);
    mesh.count = Math.max(mesh.count, index + 1);
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateStorms(game: Combat | null, time: number) {
    this.fields.update(game?.storms ?? [], game?.player.heading ?? 0, time, (x, y, z, r) => this.inView(x, y, z, r));
    if (game) for (const storm of game.storms) {
      const whiteout = storm.pulses !== undefined;
      const floor = heightAt(storm.x, storm.z);
      if (!this.inView(storm.x, floor + 2, storm.z, storm.radius + 3)) continue;
      const particles = storm.mobile ? 36 : storm.fire ? 22 : whiteout ? 41 : 34;
      for (let j = 0; j < particles; j++) {
        const a = storm.mobile ? Math.PI / 2 - game.player.heading + ((j * .38197 + time * .84) % 1 - .5) * Math.PI
          : j * 2.399 + time * (whiteout ? -1.45 : .34);
        const r = (storm.mobile ? .34 + ((j * .11) % .61) : Math.sqrt((j * .37187) % 1)) * storm.radius;
        const y = storm.mobile ? .35 + (time * 2.7 + j * .63) % 1.16
          : storm.fire ? (time * (1.2 + (j % 5) * .18) + j * .54) % 1.4
          : whiteout ? .30 + (time * (1.08 + (j % 3) * .24) + j * .37) % 2.88
          : 6.1 - ((time * (4.9 + (j % 5) * .41) + j * .878) % 6.1);
        const sparks = storm.fire ? this.flameRain : this.rain;
        this.set(sparks, sparks.count, storm.x + Math.cos(a) * r + (storm.fire || whiteout ? 0 : y * .16), floor + .21 + y,
          storm.z + Math.sin(a) * r, .059 + (j % 4) * .017, .19 + (j % 4) * .074, .077, a, whiteout ? .78 : storm.mobile ? .51 : -.19);
      }
    }
  }

  private updateWarnings(game: Combat | null) {
    let count = 0, charges = 0;
    for (const hazard of game?.hazards ?? []) {
      if (hazard.delay > hazard.windup) continue;
      if (hazard.charge) {
        const warning = this.chargeWarnings[charges] ??= new ChargeWarning(this.scene);
        warning.update(hazard);
        charges++;
        continue;
      }
      const warning = this.warnings[count] ??= new BossWarning(this.scene);
      warning.update(hazard);
      count++;
    }
    for (let i = count; i < this.warnings.length; i++) this.warnings[i].root.visible = false;
    for (let i = charges; i < this.chargeWarnings.length; i++) this.chargeWarnings[i].root.visible = false;
  }

  private staffOrigin() {
    return this.mage.root.getObjectByName('lumi-staff-tip')?.getWorldPosition(this.staffTip);
  }

  private projectilePoint(projectile: Point & { age?: number }, height: number, fire = false) {
    const { x, z, age } = projectile;
    if (age !== undefined && age < 0) return null;
    const point = this.projectilePosition.set(x, heightAt(x, z) + height, z);
    if (age === undefined) return point;
    let origin = this.projectileOrigins.get(projectile);
    if (!origin && age < .18) {
      const tip = this.staffOrigin();
      if (tip) {
        origin = { point: tip.clone(), age };
        this.projectileOrigins.set(projectile, origin);
        this.burst(tip.x, tip.z, 3, tip.y - heightAt(tip.x, tip.z) - .17, .28, fire);
      }
    }
    if (!origin) return point;
    // Keep the combat path independent of the model. The visible head leaves the
    // crystal, then curls into the shot's normal path over the first few frames.
    const t = Math.min(1, (age - origin.age) / .105);
    return point.lerp(origin.point, (1 - t) ** 2);
  }

  private updateSpellArt(game: Combat, time: number) {
    for (const orb of game.orbs) {
      const point = this.projectilePoint(orb, .81);
      if (!point) continue;
      const { x, y, z } = point;
      const wake = Math.min(1, (orb.age ?? .13) / .13);
      const growth = orb.radius / orb.baseRadius;
      const radius = (.23 + .16 * wake) * growth;
      this.set(this.orbCore, this.orbCore.count, x, y, z, radius, radius * .95, radius, time * 4.1, time * 3.1);
      for (let i = 0; i < 2; i++) this.set(this.orbBands, this.orbBands.count, x, y, z,
        radius * (1.55 + i * .31), radius * (1.55 + i * .31), 1, time * (3 - i * 7), .74 + i * 1.11, time * (i ? -3.2 : 4.1));
      if (wake > .8) this.set(this.spellRings, this.spellRings.count, orb.x, heightAt(orb.x, orb.z) + .15, orb.z, orb.radius, 1, orb.radius);
      for (let i = 0; i < 7; i++) {
        const a = time * 7 + i * 2.399, r = (.49 + i * .115) * wake * growth, index = this.magic.count;
        if (index >= this.magic.instanceMatrix.count) break;
        this.set(this.magic, index, x + Math.cos(a) * r - orb.vx * i * .022 * wake, y + .39 * Math.sin(a * 1.3) * wake * growth,
          z + Math.sin(a) * r - orb.vz * i * .022 * wake, .065, .13, .065, a);
        this.magic.setColorAt(index, shades[i % shades.length]);
      }
    }
    for (const comet of game.comets) {
      const { x, z } = comet, y = heightAt(x, z);
      const fall = Math.pow(Math.max(0, comet.delay / comet.windup), 1.65);
      this.set(this.spellRings, this.spellRings.count, x, y + .13, z, comet.radius, 1, comet.radius);
      this.set(this.icicles, this.icicles.count, x, y + .76 + fall * 5.3, z, .30, .83, .30, time * 3.5, Math.PI - .11);
      this.set(this.frostGlow, this.frostGlow.count, x, y + 1.37 + fall * 5.3, z, .23, .75, .23);
      this.set(this.frostTrail, this.frostTrail.count, x, y + 1.18 + fall * 5.3, z, .72, .72, 1.38 + fall * .9, 0, Math.PI / 2);
    }
    for (const impact of game.impacts) {
      const { x, z, radius } = impact;
      const y = heightAt(x, z), progress = Math.max(0, impact.delay / impact.windup);
      if (impact.spell === 'meteor') {
        const fall = progress ** 1.45 * 8;
        this.set(this.igniteRings, this.igniteRings.count, x, y + .20, z, radius, 1, radius);
        this.set(this.meteor, this.meteor.count, x + progress * 1.5, y + .65 + fall, z, .72, .82, .68, time * 3.5, .32);
        this.set(this.plasmaTrails, this.plasmaTrails.count, x + progress * 1.5, y + .65 + fall, z, 1.36, 1.13, 3.0 + progress * 2.2, 0, 1.31);
      } else {
        this.set(this.spellRings, this.spellRings.count, x, y + .16, z, radius, 1, radius);
        this.set(this.icicles, this.icicles.count, x, y + .31 + (1 - progress) * .40, z, .22, .81 - progress * .42, .22, time * 4);
      }
    }
    for (const wall of game.walls) {
      const dx = wall.to.x - wall.from.x, dz = wall.to.z - wall.from.z;
      const count = Math.max(1, Math.min(24, Math.ceil(Math.hypot(dx, dz) / .49)));
      const fade = Math.min(1, wall.life * 3, (wall.maxLife - wall.life) * 6 + .18);
      for (let i = 0; i <= count; i++) {
        const x = wall.from.x + dx * i / count, z = wall.from.z + dz * i / count;
        const height = (.65 + (i * 7 % 5) * .23) * fade;
        this.set(this.icicles, this.icicles.count, x, heightAt(x, z) + height * .54, z,
          .31 * fade, height, wall.width * .76 * fade, -Math.atan2(dz, dx), (i % 2 ? .22 : -.13));
      }
    }
    for (const bomb of game.bombs) {
      const y = heightAt(bomb.x, bomb.z) + bomb.target.size * 1.38, scale = .22 + .065 * Math.sin(time * 16);
      this.set(this.flameRain, this.flameRain.count, bomb.x, y, bomb.z, scale, scale * 1.5, scale, time * 3.3);
      const fuse = .48 + .13 * Math.sin((1.3 - bomb.delay) * 17) + Math.max(0, .50 - bomb.delay) * .31;
      this.set(this.bombFuses, this.bombFuses.count, bomb.x, y, bomb.z, fuse, fuse, 1,
        this.camera.heading, 0, time * (bomb.spread ? -2.4 : 1.7));
    }
    if (game.combustion > 0) {
      const { x, z } = game.player, y = heightAt(x, z);
      for (let i = 0; i < 12; i++) {
        const angle = i * 2.399 + time * 4.5;
        const height = (i * .29 + time * 2.5) % 2.3;
        const radius = .84 + .11 * Math.sin(i + time * 6);
        this.set(this.flameRain, this.flameRain.count, x + radius * Math.sin(angle), y + height, z + radius * Math.cos(angle), .08, .14, .08, angle);
      }
    }
    if (game.heat === 2) {
      const p = game.player, y = heightAt(p.x, p.z), angle = time * 4.25;
      for (let i = 0; i < 2; i++) {
        const a = angle + i * Math.PI, x = p.x + .92 * Math.sin(a), z = p.z + .92 * Math.cos(a);
        this.set(this.heatCrown, this.heatCrown.count, x, y + 1.70 + .27 * Math.sin(a), z, .19, .35, .19, a, .2);
        this.set(this.fireTrails, this.fireTrails.count, x, y + 1.53 + .27 * Math.sin(a), z, .24, .42, .24, -a);
      }
    }
    if (game.inferno > 0) {
      const p = game.player, y = heightAt(p.x, p.z), spread = 1.1 + .1 * Math.sin(time * 6);
      this.set(this.igniteRings, this.igniteRings.count, p.x, y + .24, p.z, spread, 1, spread);
      for (let i = 0; i < 7; i++) {
        const angle = time * 3.2 + i * Math.PI * 2 / 7;
        this.set(this.heatCrown, this.heatCrown.count, p.x + Math.cos(angle) * spread, y + .75 + .31 * Math.sin(angle * 2), p.z + Math.sin(angle) * spread,
          .09, .24, .09, angle);
      }
    }
  }

  private inView(x: number, y: number, z: number, radius: number) {
    this.visibilitySphere.center.set(x, y, z);
    this.visibilitySphere.radius = radius;
    return this.frustum.intersectsSphere(this.visibilitySphere);
  }

  prepareView(game: Combat | null, dt: number, followHeading: boolean) {
    this.camera.update(game?.player ?? null, Math.max(dt, .006), followHeading);
    const camera = this.camera.view;
    this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  }

  spawnVisible(x: number, z: number, size: number) {
    const y = heightAt(x, z) + size * .82, padding = size * 1.45 + 2.2;
    const depth = -this.vector.set(x, y, z).applyMatrix4(this.camera.view.matrixWorldInverse).z;
    return depth - padding < RUN_FOG_DISTANCE && this.inView(x, y, z, padding);
  }

  draw(game: Combat | null, time: number, dt: number, paused: boolean) {
    const p = game?.player;
    const dtFx = paused ? 0 : dt;
    const blend = 1 - Math.exp(-Math.max(dt, .006) * 5);
    this.updateAtmosphere(game);
    const camera = this.camera.view;
    this.modelScale = T.MathUtils.lerp(this.modelScale, game ? 1 : 1.3, blend);
    this.fog.near = game ? 24 : 19;
    this.fog.far = game ? RUN_FOG_DISTANCE : 85;

    const x = p?.x ?? 0, z = p?.z ?? 0, y = heightAt(x, z);
    this.updateGround(x, z);
    this.mage.root.position.set(x, y, z);
    this.mage.root.scale.setScalar(this.modelScale);
    const facing = p?.heading ?? -.115 + Math.sin(time * .79) * .046;
    const r = this.mage.root.rotation.y;
    this.mage.root.rotation.y += Math.atan2(Math.sin(facing - r), Math.cos(facing - r)) * Math.min(1, blend * 2.1);
    const movement = game?.movement, sin = Math.sin(this.mage.root.rotation.y), cos = Math.cos(this.mage.root.rotation.y);
    const footfall = this.mage.animate({ time, dt: dtFx, menu: !game,
      side: movement ? movement.x * cos - movement.z * sin : 0,
      forward: movement ? movement.x * sin + movement.z * cos : 0,
      casting: p?.casting ?? 0, castSide: p?.castSide, pose: p?.pose, hurt: Boolean(p?.hurt) });
    this.mageShadow.position.set(x + .09, y + .135, z + .075);
    this.mageShadow.scale.set(this.modelScale * 2.32, 1, this.modelScale * 1.76);
    this.mageShadow.visible = this.hasMageModel;
    this.auras.update(game, x, y, z, time);

    for (const meshes of this.enemies.values()) for (const mesh of meshes) mesh.count = 0;
    this.frostTrailMaterial.uniforms.clock.value = time;
    this.phoenixMaterial.uniforms.clock.value = time;
    this.plasmaMaterial.uniforms.clock.value = time;
    this.fireCore.uniforms.clock.value = time;
    this.meteorCore.uniforms.clock.value = time;
    this.fuseMaterial.uniforms.clock.value = time;
    this.orbMaterial.uniforms.clock.value = time;
    for (const material of this.iceMaterials) material.uniforms.clock.value = time;
    for (const mesh of [this.enemyShadows, this.frost, this.gems, this.gemHalos, this.gemBeams, this.bolt, this.lance, this.streak, this.flurries,
      this.orbCore, this.icicles, this.spellRings, this.magic, this.rain, this.flameRain, this.fireShots, this.fireTrails, this.spawnGlint,
      this.phoenix, this.chillRings, this.frostCages, this.igniteRings, this.heatCrown, this.questMarks, this.frostGlow, this.frostTrail,
      this.orbBands, this.plasmaTrails, this.meteor, this.bombFuses]) mesh.count = 0;
    for (const e of game?.enemies ?? preview) {
      const y = heightAt(e.x, e.z);
      if (!this.inView(e.x, y + e.size * .65, e.z, e.size * 1.35)) continue;
      const real = game ? e as Enemy : null;
      const t = time * (e.kind === 'hare' ? 8.9 : 6.7) + e.phase;
      const jump = real?.frozen ? 0 : Math.pow(Math.abs(Math.sin(t)), 2) * (game ? .19 : .15);
      const jelly = e.kind === 'puff';
      const squash = real?.frozen ? 1 : 1 + Math.cos(t * 2) * (jelly ? .13 : .075);
      const scale = e.size * (real?.flash ? 1.04 : 1);
      const width = jelly ? scale / Math.sqrt(squash) : scale;
      const meshes = this.enemies.get(e.kind)!;
      const index = meshes[0].count;
      const lean = real?.dash ? .42 : real?.bracing ? -.16 : real?.frozen ? 0 : Math.cos(t) * .084;
      for (const mesh of meshes) this.set(mesh, index, e.x, y + jump, e.z, width, scale * squash, width, e.angle, lean);
      this.set(this.enemyShadows, this.enemyShadows.count, e.x, y + .12, e.z + .04, 2.0 * scale, 1, 1.58 * scale);
      if (real?.questNpcId !== undefined) {
        this.set(this.questMarks, this.questMarks.count, e.x, y + .232, e.z, scale, 1, scale, time * .45);
      }
      if (real?.frozen) {
        this.set(this.frost, this.frost.count, e.x, y + .215, e.z, scale, scale, scale);
        for (let i = 0; i < 4; i++) {
          const a = e.phase + i * Math.PI * .5;
          this.set(this.frostCages, this.frostCages.count, e.x + scale * Math.sin(a) * .53, y + .53 * scale, e.z + scale * Math.cos(a) * .53,
            .125 * scale, (.45 + i % 2 * .16) * scale, .15 * scale, a, .20);
        }
      } else if (real?.slow) {
        this.set(this.chillRings, this.chillRings.count, e.x, y + .152, e.z, .74 * scale, 1, .74 * scale, time * -.7);
      }
      if (real?.ignite) {
        this.set(this.igniteRings, this.igniteRings.count, e.x, y + .18, e.z, .8 * scale, 1, .8 * scale);
        for (let i = 0; i < 2; i++) {
          const a = time * 3.7 + e.phase + i * Math.PI, s = .10 + .02 * Math.sin(a);
          this.set(this.flameRain, this.flameRain.count, e.x + .47 * scale * Math.sin(a), y + (.68 + .22 * Math.cos(a)) * scale,
            e.z + .47 * scale * Math.cos(a), s, s * 2, s, a);
        }
      }
      if (real && game!.time - real.born < .52) {
        const scale = e.size * (.41 + (game!.time - real.born) * 1.36);
        this.set(this.spawnGlint, this.spawnGlint.count, e.x, y + .14, e.z, scale, 1, scale);
      }
    }
    if (game) {
      for (const g of game.pickups) {
        if (Math.abs(g.x - x) > 135 || Math.abs(g.z - z) > 135) continue;
        const h = heightAt(g.x, g.z);
        const boss = g.tier === 'boss';
        if (!this.inView(g.x, h + (boss ? 1.6 : .44), g.z, boss ? 2.8 : .85)) continue;
        const look = PICKUP_STYLES[g.tier];
        const tint = gemColors[g.tier];
        const s = look.size * Math.min(1, g.age * 6 + .5);
        const halo = s * (2.0 + Math.sin(time * 4.7 + g.phase) * .12);
        const y = h + (boss ? .98 : .53) + Math.sin(time * 6 + g.phase) * .09;
        const index = this.gems.count;
        if (index >= this.gems.instanceMatrix.count) break;
        this.set(this.gemHalos, index, g.x, h + .14, g.z, halo, 1, halo);
        this.set(this.gems, index, g.x, y, g.z, s, s * 1.38, s, time * 3.3 + g.phase, .19);
        this.gemHalos.setColorAt(index, tint.halo);
        this.gems.setColorAt(index, tint.core);
        if (boss) this.set(this.gemBeams, this.gemBeams.count, g.x, y + 1.34, g.z, 1, 2.55, 1, time * 1.3);
      }
      if (this.gemHalos.instanceColor) this.gemHalos.instanceColor.needsUpdate = true;
      if (this.gems.instanceColor) this.gems.instanceColor.needsUpdate = true;
      for (const shot of game.shots) {
        const point = this.projectilePoint(shot, shot.kind === 'phoenix' ? 1.27 : 1.02, this.mageClass === 'fire');
        if (!point) continue;
        const { x, y, z } = point;
        const wake = Math.min(1, (shot.age ?? .13) / .13);
        const a = Math.atan2(shot.vx, shot.vz);
        if (shot.kind === 'fireball' || shot.kind === 'pyro') {
          const scale = (shot.kind === 'pyro' ? .43 : .23) * (.51 + .49 * wake);
          this.set(this.fireShots, this.fireShots.count, x, y, z, scale, scale, scale * 1.17, a + time * 5.5, .35);
          if (wake > .04) this.set(this.plasmaTrails, this.plasmaTrails.count, x, y, z,
            scale * 2.85, scale * 2.4, .45 + wake * (shot.kind === 'pyro' ? 3.9 : 2.1), a);
          this.set(this.fireTrails, this.fireTrails.count, x - shot.vx * .035 * wake, y, z - shot.vz * .035 * wake,
            scale * .72, scale * .63, scale * (1 + 1.9 * wake), a);
          continue;
        }
        if (shot.kind === 'phoenix') {
          const wings = .40 + wake * (.72 + Math.sin(time * 21) * .18);
          this.set(this.phoenix, this.phoenix.count, x, y, z, wings, 1, .52 + .64 * wake, a, .10);
          for (const side of [-1, 1]) this.set(this.plasmaTrails, this.plasmaTrails.count,
            x + side * Math.cos(a) * wings * .62, y + .09, z - side * Math.sin(a) * wings * .62, .43, .42, .52 + wake * 2.5, a + side * .23);
          this.set(this.fireTrails, this.fireTrails.count, x - shot.vx * .046 * wake, y - .11 * wake, z - shot.vz * .046 * wake,
            .16, .14, .46 + .94 * wake, a);
        } else if (shot.kind === 'bolt') {
          const scale = .15 + .13 * wake;
          this.set(this.bolt, this.bolt.count, x, y, z, scale, scale, scale * 1.41, a, .05, time * 9);
          this.set(this.frostGlow, this.frostGlow.count, x - shot.vx * .016 * wake, y, z - shot.vz * .016 * wake,
            scale * .75, scale * .67, scale * (1.25 + wake * 1.7), a);
          if (wake > .05) this.set(this.frostTrail, this.frostTrail.count, x, y, z, .73, .68, .45 + wake * 2.35, a);
          for (let i = 1; i <= 4; i++) {
            const d = .017 * i * wake, twirl = time * 11 + i, s = .13 - i * .02;
            this.set(this.flurries, this.flurries.count, x - shot.vx * d + .12 * Math.sin(twirl) * wake, y + .12 * Math.cos(twirl) * wake,
              z - shot.vz * d, s, s * 1.3, s, twirl);
          }
        } else {
          const width = shot.charged ? 1.13 : .92;
          this.set(this.lance, this.lance.count, x, y, z, width, .66, .54 + .67 * wake, a, .036, time * 3.1);
          this.set(this.frostGlow, this.frostGlow.count, x - shot.vx * .018 * wake, y, z - shot.vz * .018 * wake,
            .19 * width, .25 * width, .78 + wake, a);
          if (wake > .05) this.set(this.frostTrail, this.frostTrail.count, x, y, z, 1.05 * width, .75 * width, .56 + wake * 3.35, a);
          this.set(this.streak, this.streak.count, x - shot.vx * .048 * wake, y, z - shot.vz * .048 * wake, .13, .117, .43 + 1.25 * wake, a);
          if (shot.charged) this.set(this.flurries, this.flurries.count, x, y + .12, z, .10, .075, .47, a);
        }
      }
      this.updateSpellArt(game, time);
    }
    this.updateStorms(game, time);
    this.updateWarnings(game);
    this.expedition.update(game, time, (x, y, z, radius) => this.inView(x, y, z, radius));
    this.updateEffects(dtFx, time, game);
    this.spellFlashes.update(dtFx, camera);
    this.renderer.render(this.scene, camera);
    this.updateLabels(dtFx, game);
    return footfall;
  }

  private updateEffects(dt: number, time: number, game: Combat | null) {
    this.weather.update(game?.player.x ?? 0, game?.player.z ?? 0, dt);
    if (!game) {
      for (let i = 0; i < 22; i++) {
        const angle = i * 2.4 + time * (i % 2 ? .41 : -.34);
        const r = 2.25 + (i % 7) * .21;
        const y = .31 + (i % 6) * .26 + Math.sin(time * 2.1 + i * 3.81) * .18;
        const size = (.053 + (i % 4) * .025) * (.65 + Math.sin(time * 2.7 + i) * .27);
        const index = this.magic.count;
        this.set(this.magic, index, Math.cos(angle) * r, y, Math.sin(angle) * r, size, size * 1.73, size, time * 1.6 + i);
        this.magic.setColorAt(index, shades[i % shades.length]);
      }
    }
    const emberDrag = Math.exp(-dt * 2.6), iceDrag = Math.exp(-dt * .80);
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const bit = this.bits[i];
      bit.life -= dt;
      if (bit.life <= 0) {
        this.bits.splice(i, 1);
        continue;
      }
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.z += bit.vz * dt;
      const drag = bit.fire ? emberDrag : iceDrag;
      bit.vx *= drag; bit.vz *= drag;
      if (bit.fire) {
        bit.vx += .36 * dt;
        bit.vy = Math.min(3.1, bit.vy + dt * .62);
      } else if (dt > 0) {
        bit.vy -= dt * 6.2;
        if (bit.vy < 0) {
          const floor = heightAt(bit.x, bit.z) + .046;
          if (bit.y < floor) {
            bit.y = floor;
            bit.vy = bit.settled ? 0 : Math.min(.95, -bit.vy * .29);
            bit.settled = true;
            bit.vx *= .39; bit.vz *= .39;
            bit.life = Math.min(bit.life, .19);
          }
        }
      }
      const size = bit.size * Math.min(1, (bit.life / bit.max) * 1.66);
      const index = this.magic.count;
      if (index >= this.magic.instanceMatrix.count) continue;
      this.set(this.magic, index, bit.x, bit.y, bit.z, size, size * 1.52, size, bit.life * bit.spin, bit.life * 2);
      this.magic.setColorAt(index, bit.tint);
    }
    if (this.magic.instanceColor) this.magic.instanceColor.needsUpdate = true;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.life -= dt;
      if (wave.life <= 0) {
        this.scene.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        wave.mesh.material.dispose();
        this.waves.splice(i, 1);
        continue;
      }
      const ratio = wave.life / wave.max;
      wave.mesh.scale.setScalar(wave.radius * (1 - Math.pow(ratio, 2.5)) + .09);
      wave.mesh.material.opacity = wave.opacity * ratio;
    }
  }

  private updateLabels(dt: number, game: Combat | null) {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!game) return;
    ctx.textAlign = 'center';
    ctx.font = '700 17px "Space Grotesk Variable", sans-serif';
    ctx.lineWidth = 3.1;
    ctx.lineJoin = 'round';
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.age += dt;
      if (n.age >= .68) {
        this.numbers.splice(i, 1);
        continue;
      }
      const point = this.screen(n.x, heightAt(n.x, n.z) + 1.28 + n.age * 1.7, n.z);
      if (!point) continue;
      const { x, y } = point;
      ctx.globalAlpha = Math.min(1, (.68 - n.age) * 6.3);
      ctx.strokeStyle = '#333951';
      ctx.fillStyle = n.color;
      ctx.strokeText(n.text, x + n.dx * n.age, y - n.age * 9);
      ctx.fillText(n.text, x + n.dx * n.age, y - n.age * 9);
    }
    ctx.globalAlpha = 1;
    this.drawEnemyHealthBars(game);
  }

  private drawEnemyHealthBars(game: Combat) {
    const ctx = this.context;
    const { x, z } = game.player;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const enemy of game.enemies) {
      if (enemy.hp <= 0 || enemy.maxHp <= 0) continue;
      if ((enemy.x - x) ** 2 + (enemy.z - z) ** 2 > ENEMY_HEALTH_BAR_RANGE ** 2) continue;
      const boss = isBoss(enemy.kind);
      const maxHp = Math.ceil(enemy.maxHp);
      const hp = Math.min(maxHp, Math.ceil(enemy.hp));
      const name = enemy.kind === QUEST_BOSS ? QUEST_BOSS_NAME : rangedElite(enemy.kind)?.name;
      const label = `${name ? `${name} · ` : ''}${hp} / ${maxHp}`;
      const height = boss ? 20 : 16;
      ctx.font = `700 ${boss ? 12 : 11}px "Space Grotesk Variable", sans-serif`;
      const width = Math.max(boss ? 100 : 72, Math.ceil(ctx.measureText(label).width) + 12);
      const head = heightAt(enemy.x, enemy.z) + (this.enemyHeights.get(enemy.kind) ?? 1.4) * enemy.size + .5;
      const point = this.screen(enemy.x, head, enemy.z);
      if (!point) continue;
      const left = Math.round(point.x - width / 2), top = Math.round(point.y - height);
      if (left + width < 0 || left > this.width || top + height < 0 || top > this.height) continue;
      const ratio = T.MathUtils.clamp(enemy.hp / enemy.maxHp, 0, 1);
      ctx.fillStyle = '#201222';
      ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
      ctx.fillStyle = enemy.questNpcId === undefined ? '#431a26' : '#422356';
      ctx.fillRect(left, top, width, height);
      ctx.fillStyle = enemy.questNpcId === undefined ? '#eb4055' : '#bb58c5';
      ctx.fillRect(left, top, width * ratio, height);
      ctx.fillStyle = '#ff7c87';
      ctx.fillRect(left, top, width * ratio, 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffb5be99';
      ctx.strokeRect(left + .5, top + .5, width - 1, height - 1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#31111b';
      ctx.strokeText(label, left + width / 2, top + height / 2 + .5);
      ctx.fillStyle = '#fff6f7';
      ctx.fillText(label, left + width / 2, top + height / 2 + .5);
      const frostMark = (enemy.frostMarkUntil ?? 0) - game.time;
      if (enemy.frozen || enemy.slow || enemy.ignite || frostMark > 0) {
        const status = enemy.frozen ? `빙결 ${enemy.frozen.toFixed(1)}s` : enemy.ignite
          ? `작열 ${Math.ceil(enemy.ignite.remaining)}` : frostMark > 0 ? `혹한의 표식 · ${Math.ceil(frostMark)}초`
          : `둔화 ${Math.round((enemy.slowPower ?? .47) * 100)}%`;
        ctx.font = '700 10px "Noto Sans KR Variable", sans-serif';
        const badge = Math.ceil(ctx.measureText(status).width) + 9;
        ctx.fillStyle = enemy.ignite ? '#421c2be8' : '#182d51eb';
        ctx.fillRect(left + Math.round((width - badge) / 2), top - 15, badge, 13);
        ctx.fillStyle = enemy.frozen ? '#bef7ff' : enemy.ignite ? '#ffba7e' : '#a9d8ff';
        ctx.fillText(status, left + width / 2, top - 8);
      }
    }
    ctx.restore();
  }

  private screen(x: number, y: number, z: number) {
    this.vector.set(x, y, z).project(this.camera.view);
    if (this.vector.z < -1 || this.vector.z > 1 || !Number.isFinite(this.vector.x + this.vector.y)) return null;
    return { x: (this.vector.x + 1) * .5 * this.width, y: (1 - this.vector.y) * .5 * this.height };
  }
}
