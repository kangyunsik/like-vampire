import * as T from 'three';
import type { CombatEvent, Point } from '../combat';
import type { MageClass } from '../data';
import { crystalGeometry, random } from './art';
import { bossHazardTone } from './boss-hazards';
import { crossedStrips, effectDisc, effectFan, effectPlane, etchedSurface, moltenCore, streamingRibbon,
  type Etching, type RibbonStroke } from './element-vfx';
import { frostSigil, frostVapor, prismaticIce } from './frost-vfx';
import { GlacialImpact } from './glacial-impact';
import { heightAt } from './terrain';
import { ThermalImpact } from './thermal-impact';

function blade(points: [number, number][], depth: number, bevel: number) {
  const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
  return new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel * .65, bevelSegments: 1 })
    .rotateX(Math.PI / 2);
}

export const frostShard = new T.IcosahedronGeometry(1, 1);
export const iceSpear = blade([
  [0, 1.02], [-.23, .31], [-.16, -.29], [-.31, -.66], [0, -.48], [.31, -.66], [.16, -.29], [.23, .31],
], .122, .045);
export const phoenixWing = blade([
  [0, .70], [-.12, .37], [-.54, .20], [-1.04, .62], [-.88, -.18], [-.56, -.24],
  [-.68, -.46], [-.18, -.38], [0, -.84], [.18, -.38], [.68, -.46], [.56, -.24], [.88, -.18], [1.04, .62], [.54, .20], [.12, .37],
], .07, .03);

const ray = new T.BoxGeometry(1, 1, 1);
const disc = new T.CircleGeometry(1, 44).rotateX(-Math.PI / 2);
const seal = new T.RingGeometry(.92, 1, 56).rotateX(-Math.PI / 2);
export const frontDisc = new T.CircleGeometry(1, 36, Math.PI, Math.PI).rotateX(-Math.PI / 2);
export const frontSeal = new T.RingGeometry(.92, 1, 36, 1, Math.PI, Math.PI).rotateX(-Math.PI / 2);
const snow = new T.RingGeometry(.86, 1, 6).rotateX(-Math.PI / 2);
const crest = new T.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const plume = new T.ConeGeometry(1, 1, 7, 1, true).translate(0, .5, 0);
const embersCore = new T.IcosahedronGeometry(1, 1);
const emberColors = ['#ff6b32', '#ffb25b', '#ffe2a2', '#d44236'].map((color) => new T.Color(color));
const iceColors = ['#7cc5ea', '#bbfbf4', '#a9adff', '#e4f8ff'].map((color) => new T.Color(color));
const moon = (() => {
  const s = new T.Shape();
  s.moveTo(.34, .82);
  s.bezierCurveTo(-1.02, 1.02, -1.18, -.75, -.12, -.93);
  s.bezierCurveTo(.36, -.99, .72, -.76, .85, -.39);
  s.bezierCurveTo(-.20, -.80, -.70, .43, .34, .82);
  return new T.ShapeGeometry(s, 18);
})();

type Flash = {
  mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial | T.ShaderMaterial>;
  left: number; duration: number; opacity: number; scale: T.Vector3;
  rise: number; expand: number; billboard: boolean;
  grow?: number;
  drift?: T.Vector3;
  ownsGeometry?: boolean;
  wait: number;
  spin: number;
};

type Cast = Extract<CombatEvent, { kind: 'cast' }>;
type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number;
  life: number; max: number; twist: number; color: T.Color; hot: boolean };
type EtchOptions = { heading?: number; vertical?: boolean; lift?: number; alpha?: number; delay?: number; spin?: number };
const point3 = (point: Point, h = 0) => new T.Vector3(point.x, heightAt(point.x, point.z) + h, point.z);

export class SpellFlashes {
  private items: Flash[] = [];
  private glacial: GlacialImpact[] = [];
  private thermal: ThermalImpact[] = [];
  private sigil?: T.Texture;
  private frostBurst?: T.BufferGeometry;
  private shard?: T.BufferGeometry;
  private embers: Spark[] = [];
  private sparkPose = new T.Object3D();
  private flecks = new T.InstancedMesh(crystalGeometry, new T.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: .89, depthWrite: false, blending: T.AdditiveBlending,
  }), 180);
  private rng = random(60117);

  constructor(private parent: T.Scene) {
    this.flecks.name = 'spell-spectral-flecks';
    this.flecks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.flecks.frustumCulled = false;
    this.flecks.count = 0;
    parent.add(this.flecks);
  }
  setFrostBurst(geometry: T.BufferGeometry) { this.frostBurst = geometry; }
  setFrostShard(geometry: T.BufferGeometry) { this.shard = geometry; }

  private flash(geometry: T.BufferGeometry, tint: string, opacity: number, duration: number,
    options: { rise?: number; expand?: number; billboard?: boolean; map?: T.Texture;
      frost?: 'crystal' | 'sigil'; grow?: number; drift?: T.Vector3; shader?: T.ShaderMaterial;
      ownsGeometry?: boolean; delay?: number; spin?: number } = {}) {
    if (this.items.length >= 115) {
      this.release(this.items.shift()!);
    }
    const material = options.shader ?? (options.frost === 'crystal' ? prismaticIce(tint, opacity) : options.frost === 'sigil' ? frostSigil(tint, opacity)
      : new T.MeshBasicMaterial({ color: tint, opacity, transparent: true, depthWrite: false, toneMapped: false,
        blending: T.AdditiveBlending, side: T.DoubleSide, map: options.map ?? null }));
    const mesh = new T.Mesh(geometry, material);
    mesh.visible = !options.delay;
    this.parent.add(mesh);
    const info = { mesh, left: duration, duration, opacity, scale: mesh.scale, rise: options.rise ?? 0,
      expand: options.expand ?? 0, billboard: options.billboard ?? false, grow: options.grow, drift: options.drift,
      ownsGeometry: options.ownsGeometry, wait: options.delay ?? 0, spin: options.spin ?? 0 };
    this.items.push(info);
    return mesh;
  }

  private release(item: Flash) {
    item.mesh.removeFromParent();
    item.mesh.material.dispose();
    if (item.ownsGeometry) item.mesh.geometry.dispose();
  }

  private etch(point: Point, radius: number, pattern: Etching, tint: string, core: string, life: number,
    { heading, vertical = false, lift = vertical ? 1.3 : .16, alpha = .7, delay = 0, spin = 0 }: EtchOptions = {}) {
    const geometry = vertical ? effectPlane : heading === undefined ? effectDisc : effectFan;
    const mesh = this.flash(geometry, tint, alpha, life,
      { shader: etchedSurface(pattern, tint, core, alpha, vertical), billboard: vertical, delay, spin });
    mesh.name = `${pattern}-spell-etch`;
    mesh.position.copy(point3(point, lift));
    mesh.scale.set(radius, vertical ? radius : 1, vertical ? 1 : radius);
    mesh.rotation.y = heading ?? 0;
    if (!vertical) mesh.renderOrder = -2;
    return mesh;
  }

  private stream(strokes: readonly RibbonStroke[], origin: T.Vector3, tint: string, core: string, life: number, electric = false) {
    if (!strokes.length) return;
    const mesh = this.flash(crossedStrips(strokes, origin), tint, electric ? .84 : .67, life,
      { shader: streamingRibbon(tint, core, .8, electric), ownsGeometry: true });
    mesh.position.copy(origin);
    mesh.name = electric ? 'forked-spell-arc' : 'flowing-spell-ribbon';
  }

  private wake(point: Point, size: number, life: number, fire: boolean, lift = .39) {
    const shader = frostVapor();
    if (fire) shader.uniforms.tint.value.set('#f6844c');
    const alpha = fire ? .21 : .23;
    const mesh = this.flash(effectPlane, '', alpha, life, { shader, billboard: true, rise: fire ? .57 : .24, expand: .37 });
    mesh.position.copy(point3(point, lift));
    mesh.scale.set(size, size * .49, 1);
    mesh.name = fire ? 'embers-afterglow' : 'frost-afterglow';
  }

  private scatter(point: Point, count: number, hot: boolean, spread: number, lift: number, heading?: number) {
    const y = heightAt(point.x, point.z) + lift;
    for (let i = 0; i < count && this.embers.length < 180; i++) {
      const a = heading === undefined ? this.rng() * 2 * Math.PI : heading + (this.rng() - .5) * 2.03;
      const speed = (.46 + this.rng() * .81) * spread, foot = this.rng() * .33;
      const max = .27 + this.rng() * .43;
      this.embers.push({ x: point.x + Math.sin(a) * foot, y: y + this.rng() * .37, z: point.z + Math.cos(a) * foot,
        vx: Math.sin(a) * speed, vy: .43 + this.rng() * (hot ? 2.4 : 1.8), vz: Math.cos(a) * speed,
        size: .036 + this.rng() * .077, life: max, max,
        twist: a * 2.7 + i, color: (hot ? emberColors : iceColors)[i % 4], hot });
    }
  }

  private scatterFrame(dt: number) {
    let index = 0;
    const pose = this.sparkPose;
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const b = this.embers[i];
      b.life -= dt;
      if (b.life <= 0) { this.embers.splice(i, 1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.vy -= (b.hot ? .41 : 6.3) * dt;
      const left = b.life / b.max;
      const size = b.size * left * (.76 + .24 * Math.abs(Math.sin(b.twist + b.life * 33)));
      pose.position.set(b.x, b.y, b.z);
      pose.rotation.set(b.twist + b.life * 9, b.twist, b.life * 5 + b.twist * .3);
      pose.scale.set(size, size * (b.hot ? 2.13 : 2.70), size);
      pose.updateMatrix();
      this.flecks.setMatrixAt(index, pose.matrix);
      this.flecks.setColorAt(index++, b.color);
    }
    this.flecks.count = index;
    if (!index) return;
    this.flecks.instanceMatrix.needsUpdate = true;
    if (this.flecks.instanceColor) this.flecks.instanceColor.needsUpdate = true;
  }

  private floor(center: Point, geometry: T.BufferGeometry, radius: number, tint: string, life: number, opacity: number, h = .24, map?: T.Texture) {
    const mesh = this.flash(geometry, tint, opacity, life, { expand: .18, map });
    mesh.position.set(center.x, heightAt(center.x, center.z) + h, center.z);
    mesh.scale.set(radius, 1, radius);
    return mesh;
  }

  private beam(a: Point, b: Point, color: string, width: number, life: number, height = .9, source?: T.Vector3) {
    if (Math.hypot(a.x - b.x, a.z - b.z) < .04) return;
    const start = source ?? new T.Vector3(a.x, heightAt(a.x, a.z) + height, a.z);
    const end = new T.Vector3(b.x, heightAt(b.x, b.z) + height, b.z);
    const mesh = this.flash(ray, color, .86, life);
    mesh.position.copy(start).lerp(end, .5);
    mesh.lookAt(end);
    mesh.scale.set(width, width, start.distanceTo(end));
  }

  add(event: CombatEvent, staff?: T.Vector3, mageClass: MageClass = 'frost') {
    if (event.kind === 'frost-crit-freeze') {
      this.floor(event, snow, .76, '#c4faff', .42, .85);
      this.iceCrystals(event, .37, '#aeeeff', .44, event.x * .59 + event.z);
      return;
    }
    if (event.kind === 'comet-impact') {
      this.iceCrystals(event, Math.min(1.34, event.radius * .92), '#58cbff', .78, event.x * .7 + event.z);
      this.etch(event, event.radius, 'lattice', '#379fb8', '#d5fbff', .81, { alpha: .86 });
      this.iceSplinters(event, 8, .71, '#a4edff');
      this.wake(event, event.radius * .71, .70, false, .32);
      return;
    }
    if (event.kind === 'enemy-blast' && event.cue) {
      const { color, form } = bossHazardTone(event.cue), r = event.radius;
      if (event.to) {
        this.beam(event, event.to, color, r * .29, .56, .61);
        this.beam(event, event.to, '#fff0d0', r * .10, .27, .79);
        this.floor(event.to, seal, r, color, .56, .84);
        return;
      }
      this.floor(event, disc, r * .86, color, .45, .26);
      this.floor(event, seal, r * .89, color, .61, .94);
      if (form === 'crystal') {
        this.crown(event, r * .52, 8, color, .65);
        this.column(event, r * .26, 3.9, '#d3f3ff', .39);
      } else if (form === 'fire') {
        this.column(event, r * .59, 4.65, '#ff9456', .64);
        this.column(event, r * .24, 3.5, '#ffe3a3', .45);
      } else if (form === 'gear') {
        this.floor(event, snow, r * .72, '#ffe8ad', .63, .82, .30);
        this.crown(event, r * .45, 6, color, .53);
        this.column(event, r * .33, 3.65, color, .42);
      } else {
        this.floor(event, snow, r * .64, '#f3c1ff', .57, .92, .34);
        this.column(event, r * .46, 4.3, '#bc78ff', .61);
        this.crown(event, r * .39, 6, color, .52);
      }
      return;
    }
    if (event.kind === 'hot-streak') {
      this.floor(event, seal, 1.38, '#ffab45', .50, .75);
      const spark = this.flash(crystalGeometry, '#ffee88', .89, .55, { rise: 2.55 });
      spark.position.set(event.x, heightAt(event.x, event.z) + 2.25, event.z);
      spark.scale.set(.22, .36, .22);
      return;
    }
    if (event.kind === 'fireburst') {
      if ((event.bombPower ?? 1) < .4) {
        this.etch(event, event.radius, 'eclipse', '#e9732a', '#ffe396', .39, { alpha: .37 });
        return;
      }
      const heavy = event.spell === 'pyro';
      this.etch(event, event.radius, heavy ? 'crater' : 'eclipse', heavy ? '#e25921' : '#ff8138',
        '#fff199', heavy ? 1.19 : .67, { alpha: .84 });
      this.tongues(event, event.radius * (heavy ? .64 : .49), heavy ? 2.2 : 1.3, heavy ? 6 : 4, .58);
      this.wake(event, event.radius * .62, .95, true);
      this.scatter(event, heavy ? 28 : 16, true, event.radius * 1.7, .28);
      return;
    }
    if (event.kind === 'ignite-burst') {
      const r = event.radius;
      if (event.spell === 'supernova') {
        this.etch(event, r, 'eclipse', '#bc214c', '#ffd486', 1.21, { alpha: .94 });
        this.etch(event, r * .81, 'slag', '#99273a', '#ff903b', 1.35, { delay: .16, alpha: .51 });
        const star = this.flash(embersCore, '', 1, .38, { shader: moltenCore(true), rise: 1.66, expand: .84 });
        star.name = 'supernova-black-core';
        star.position.copy(point3(event, .74));
        star.scale.setScalar(Math.min(1.08, r * .26));
        this.tongues(event, r * .78, 3.5, 9, .75, '#ed3961', '#ffe7a8');
        this.scatter(event, 35, true, r * 1.44, .37);
      } else if (event.spell === 'flashpoint') {
        this.etch(event, r, 'slag', '#b2372e', '#ffb85a', .73);
        this.etch(event, .74, 'brand', '#ff7133', '#fff9aa', .45, { vertical: true, spin: -2.4 });
        this.collapse(event, Math.min(1.45, r * .53), true);
        this.scatter(event, 13, true, 1.98, .87);
      } else {
        this.etch(event, r * .57, 'seal', '#dd6736', '#fffba8', .42, { alpha: .63 });
        this.scatter(event, 8, true, 1.42, .75);
      }
      return;
    }
    if (event.kind === 'strike' && !event.dot) {
      if (event.spell === 'bolt') this.scatter(event, event.critical ? 5 : 2, false, 1.03, .61);
      if (event.spell === 'fireball') this.scatter(event, event.critical ? 5 : 2, true, 1.28, .61);
      if (event.spell === 'lance' && event.frozen) {
        this.etch(event, .59, 'lattice', '#6e81d7', '#d1fbff', .26, { vertical: true, lift: .75, alpha: .65 });
        this.scatter(event, 7, false, 1.98, .76);
      }
      return;
    }
    if (event.kind === 'spell-impact') {
      const { spell, radius } = event;
      if (spell === 'absoluteZero') {
        if (!this.sigil) this.sigil = new T.TextureLoader().load(`${import.meta.env.BASE_URL}art/absolute-zero.png`);
        this.sigil.colorSpace = T.SRGBColorSpace;
        const heading = event.heading ?? 0;
        const mark = { x: event.x + Math.sin(heading) * radius * .29, z: event.z + Math.cos(heading) * radius * .29 };
        this.floor(mark, crest, radius * .19, '#d2f8ff', 1.48, .56, .27, this.sigil).rotation.y = heading;
        this.iceSigil(event, radius, '#88b9dd', .63, heading);
        if (this.glacial.length >= 3) this.glacial.shift()!.dispose();
        this.glacial.push(new GlacialImpact(this.parent, event, radius, heading, this.frostBurst, this.shard));
      } else if (spell === 'iceBloom') {
        this.etch(event, radius, 'rime', '#5196d3', '#d9fff6', .95, { spin: -.33, alpha: .79 });
        this.iceCrystals(event, Math.min(1.49, radius * .40), '#75ddfc', .85, event.x + event.z * .23);
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5 + .52, r = radius * .47;
          this.iceCrystals({ x: event.x + Math.sin(a) * r, z: event.z + Math.cos(a) * r },
            Math.min(.67, radius * .22), '#aabcf8', .76, a);
        }
        this.iceSplinters(event, 7, .70, '#b1f0ff');
      } else if (spell === 'winterMoon') {
        const shadow = this.flash(moon, '#627bb7', .52, 1.01, { billboard: true, rise: -.42, spin: -.65, delay: .09 });
        shadow.position.copy(point3(event, 2.92));
        shadow.scale.setScalar(radius * .39);
        const crescent = this.flash(moon, '#d2c6ff', .82, .92, { billboard: true, rise: -.71, spin: -.52 });
        crescent.position.set(event.x, heightAt(event.x, event.z) + 3.10, event.z);
        crescent.scale.setScalar(radius * .34);
        this.etch(event, radius, 'spiral', '#9289d4', '#efe5ff', .93, { spin: .46 });
        this.etch(event, radius * .18, 'seal', '#b4caff', '#f7edff', .75, { vertical: true, lift: 3.10, spin: .6 });
      } else if (spell === 'auroraStrike') {
        this.skyArc(event, Math.min(3, radius * .71));
        this.etch(event, radius, 'lattice', '#8c81ff', '#c4fff8', .72);
        this.iceSplinters(event, 5, .52, '#164ddd');
      } else if (spell === 'whiteout') {
        this.etch(event, radius, 'rime', '#b6a4ed', '#eeeaff', .68, { lift: .21, alpha: .64, spin: .29 });
        this.wake(event, radius * .68, .71, false);
      } else if (spell === 'frostBind') {
        this.etch(event, radius * .84, 'lattice', '#70bbc9', '#e5ffff', .67, { vertical: true, lift: .87, spin: -.8 });
        this.etch(event, radius, 'seal', '#258ead', '#9dfdff', .50, { spin: 1.3 });
      } else if (spell === 'glacierWall') {
        this.etch(event, radius * 1.38, 'lattice', '#5697c1', '#defbfc', .31, { lift: .18 });
        this.scatter(event, 5, false, 1.43, .38);
      } else if (spell === 'glacialCollapse') {
        this.etch(event, radius, 'spiral', '#6f79d6', '#e7d9ff', .84, { spin: -1.6 });
        this.collapse(event, radius * .70, false);
        this.iceSplinters(event, 8, .67, '#c2e5ff');
      } else if (spell === 'flamestrike') {
        this.tongues(event, radius * .70, 4.1, 7, .79);
        this.etch(event, radius, 'slag', '#d94a21', '#ffdc83', .94);
        this.scatter(event, 16, true, 2.9, .39);
      } else if (spell === 'fireball') {
        this.etch(event, radius * .77, 'slag', '#bd5028', '#ffad58', .35, { alpha: .51 });
      } else if (spell === 'fireBlast') {
        this.etch(event, radius, 'eclipse', '#e85a21', '#fff4b6', .49);
        this.tongues(event, radius * .37, 1.12, 4, .32);
        this.scatter(event, 11, true, 2.8, .77);
      } else if (spell === 'fireBarrier') {
        this.etch(event, radius, 'spiral', '#d75d30', '#ffc171', .42, { alpha: .53, spin: .9 });
      } else if (spell === 'barrier') {
        this.etch(event, radius, 'lattice', '#539db2', '#c1fcfa', .46, { alpha: .55 });
      } else if (spell === 'phoenix') {
        this.scatter(event, 7, true, 1.7, .98);
        this.etch(event, Math.max(.52, radius), 'fan', '#d65d38', '#ffe088', .36, { vertical: true, lift: .86, spin: .91 });
      } else if (spell === 'emberBrand') {
        this.etch(event, Math.max(.53, radius * .76), 'seal', '#ffa552', '#fff3b9', .66, { vertical: true, lift: 1.11, spin: 2.1 });
        this.etch(event, radius, 'slag', '#a33931', '#ffc06e', .59);
      } else if (spell === 'meteor') {
        this.etch(event, radius, 'crater', '#c64128', '#fff1a6', 1.51, { alpha: .97 });
        this.etch(event, radius, 'eclipse', '#ec6134', '#fff2b0', .56, { alpha: .68, lift: .18 });
        if (this.thermal.length >= 2) this.thermal.shift()!.dispose();
        this.thermal.push(new ThermalImpact(this.parent, event, radius));
        this.scatter(event, 25, true, radius * 1.47, .50);
      } else if (spell === 'infernoHeart') {
        const heading = event.heading ?? 0;
        this.etch(event, radius, 'eclipse', '#db352d', '#ffdd91', .77, { heading, alpha: .78 });
        this.etch(event, radius * .81, 'fan', '#f15f2e', '#ffde85', .63, { heading, delay: .15, lift: .23 });
        this.scatter(event, 19, true, radius * .71, .45, heading);
      }
      return;
    }
    if (event.kind === 'cast') this.cast(event, staff, mageClass);
  }

  private cast(event: Cast, staff: T.Vector3 | undefined, mageClass: MageClass) {
    const { spell, to, path, radius = 1.3, heading = 0 } = event;
    switch (spell) {
      case 'bolt':
        this.focus(event, staff, 'rime', '#579fce', '#d5f7ff', .27, .21, 1.8);
        break;
      case 'lance':
        this.focus(event, staff, 'lattice', '#8986e8', '#e5ffff', .40, .36, -2.1);
        break;
      case 'nova': {
        this.etch(event, radius, 'rime', '#538bc8', '#bafffa', .89, { heading, alpha: .89 });
        this.iceSigil(event, radius * .91, '#83cdeb', .47, heading);
        this.iceFan(event, radius * .58, heading, 4, '#75d6ff', .78, .70);
        this.scatter(event, 12, false, radius * .75, .23, heading);
        break;
      }
      case 'blizzard':
        if (to) {
          this.etch(to, radius, 'lattice', '#539bd2', '#daf8ff', .68, { alpha: .67 });
          this.wake(to, radius * .52, .91, false, 1.22);
        }
        break;
      case 'blink':
        if (to) this.blink(event, to, mageClass === 'fire');
        break;
      case 'barrier':
        this.etch(event, 1.46, 'lattice', '#4aabcb', '#dbffff', .57);
        this.scatter(event, 10, false, 1.31, 1.15);
        break;
      case 'orb':
        this.focus(event, staff, 'spiral', '#6f8ff5', '#e1ffff', .39, .44, -3.2);
        break;
      case 'comet':
        this.focus(event, staff, 'seal', '#5a9fc9', '#e7ffff', .32, .47, .8);
        break;
      case 'frostChain':
        if (path) this.links(path, '#2f83c6', '#d8fcff', .42, false, staff);
        break;
      case 'iceBloom':
        if (to) this.etch(to, radius, 'rime', '#4764ad', '#b0f9ff', .55, { spin: .26, alpha: .62 });
        break;
      case 'rimeVolley':
        if (path) {
          const origin = staff?.clone() ?? point3(event, 1.06);
          const strokes = path.map((point, i) => {
            const end = point3(point, .71), mid = origin.clone().lerp(end, .41);
            mid.y += .11 + .09 * i;
            return { points: [origin, mid, end], width: .13 + (i % 2) * .045 };
          });
          this.stream(strokes, origin, '#3f9bde', '#e9ffff', .41);
          for (const point of path) this.scatter(point, 3, false, .65, .6);
        }
        break;
      case 'frostBind':
        if (path) this.links(path, '#5ca5c6', '#cbffff', .44, false);
        else if (to) this.etch(to, .47, 'seal', '#56a1ce', '#c1fff6', .47, { vertical: true, lift: 1.22, spin: -.95 });
        break;
      case 'frostGale':
        if (to) this.gust(event, to, heading, radius, false, staff);
        break;
      case 'whiteout':
        if (to) {
          this.etch(to, radius, 'spiral', '#9786da', '#ded4ff', .95, { alpha: .73, spin: -.89 });
          this.wake(to, radius * .82, 1.13, false, 1.07);
        }
        break;
      case 'winterMoon':
        this.focus(event, staff, 'portal', '#a0a3ec', '#f6e6ff', .47, .42, -.38);
        break;
      case 'glacierWall':
        if (path?.length === 2) {
          const origin = point3(path[0], .24), end = point3(path[1], .24);
          const raised = origin.clone().lerp(end, .54).add(new T.Vector3(0, .13, 0));
          this.stream([{ points: [origin, raised, end], width: Math.min(.35, radius * .095) }], origin,
            '#337fa9', '#d3ffff', 1.14);
        }
        break;
      case 'auroraStrike':
        this.focus(event, staff, 'lattice', '#8d73df', '#aafff6', .36, .29, .44);
        break;
      case 'absoluteZero':
        this.focus(event, staff, 'rime', '#537ac6', '#edfaff', .62, .70, -1.45);
        break;
      case 'glacialCollapse':
        this.focus(event, staff, 'spiral', '#5c70cf', '#e0d3ff', .43, .44, -2.94);
        break;
      case 'chainLightning':
        if (path) this.links(path, '#a179ff', '#fff2b6', .55, true, staff);
        break;
      case 'fireball':
        this.focus(event, staff, 'brand', '#ff602e', '#ffe9a5', .27, .23, -1.71);
        break;
      case 'fireBlast':
        if (to) this.links([event, to], '#e45824', '#fff1bc', .23, true, staff);
        break;
      case 'pyro':
        this.focus(event, staff, 'eclipse', '#eb4826', '#fff0a6', .46, .39, 1.74);
        break;
      case 'flamestrike':
        this.focus(event, staff, 'slag', '#f16d32', '#ffe2a4', .42, .53, -.55);
        break;
      case 'livingBomb':
        if (path) for (const target of path.slice(1, 9)) this.links([path[0], target], '#e9732a', '#ffe396', .33, false);
        if (to) this.etch(to, .59, 'brand', '#d84935', '#ffd887', .48, { vertical: true, lift: .89, spin: 1.17 });
        break;
      case 'combustion':
        this.etch(event, 1.82, 'spiral', '#f44824', '#ffe5a2', .71, { spin: -1.68 });
        this.tongues(event, 1.18, 1.9, 4, .54);
        break;
      case 'fireBarrier':
        this.etch(event, 1.52, 'slag', '#ca472d', '#ffd194', .67);
        this.tongues(event, .99, 1.74, 4, .55);
        break;
      case 'emberFan':
        if (to) this.gust(event, to, heading, radius, true, staff);
        break;
      case 'flashpoint':
        this.focus(event, staff, 'seal', '#d66132', '#ffeea3', .32, .31, 2.65);
        break;
      case 'cinderMarks':
        if (path) {
          const origin = staff?.clone() ?? point3(event, .88);
          const rays = path.map((target) => ({ points: [origin, point3(target, .95)], width: .102 }));
          this.stream(rays, origin, '#e95b32', '#ffdf92', .32, true);
          for (const mark of path) this.etch(mark, .53, 'brand', '#f35a37', '#ffd88b', .66, { vertical: true, delay: .09, spin: -.44 });
        }
        break;
      case 'emberBrand':
        if (to) this.links([event, to], '#e88439', '#ffe3af', .38, false, staff);
        break;
      case 'phoenix':
        this.focus(event, staff, 'fan', '#e46a2b', '#ffec9e', .49, .52, -.86);
        this.scatter(event, 7, true, 1.45, 1.38);
        break;
      case 'meteor':
        if (to) this.etch(to, radius, 'crater', '#be6636', '#ffdb91', .75, { alpha: .59 });
        break;
      case 'cinderVortex':
        this.etch(event, radius, 'spiral', '#eb6a3e', '#ffd381', .47, { heading, alpha: .53 });
        break;
      case 'supernova':
        this.focus(event, staff, 'eclipse', '#e23862', '#ffdaa9', .66, .56, -.31);
        break;
      case 'infernoHeart':
        this.focus(event, staff, 'brand', '#e93742', '#ffe3a7', .51, .67, 1.08);
        break;
      default: {
        const unhandled: never = spell;
        return unhandled;
      }
    }
  }

  private focus(event: Point, staff: T.Vector3 | undefined, pattern: Etching, tint: string, core: string,
    size: number, life: number, turn: number) {
    const origin = staff?.clone() ?? point3(event, 1.28);
    const mark = this.etch(origin, size, pattern, tint, core, life, { vertical: true, spin: turn });
    mark.position.copy(origin);
  }

  private links(path: readonly Point[], tint: string, core: string, life: number, electric: boolean, staff?: T.Vector3) {
    if (path.length < 2) return;
    const points = path.map((point) => point3(point, .94));
    if (staff) points[0].copy(staff);
    const strokes: RibbonStroke[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], r = b.distanceTo(a);
      if (r < .03) continue;
      const dx = (b.x - a.x) / r, dz = (b.z - a.z) / r;
      const curve: T.Vector3[] = [a];
      const samples = electric ? 7 : 5;
      for (let j = 1; j < samples; j++) {
        const t = j / samples;
        const k = electric ? (j % 2 ? .35 : -.25) * (1 + (j + i) % 3 * .15) : Math.sin((t * 2 - .5) * Math.PI) * .41;
        curve.push(a.clone().lerp(b, t).add(new T.Vector3(dz * k, .16 + (j % 3) * .11, -dx * k)));
      }
      curve.push(b);
      const from = (i - 1) / (points.length - 1), stop = i / (points.length - 1);
      strokes.push({ points: curve, width: electric ? .14 : .112, start: from, end: stop });
      if (electric && i % 2 && r > .7) {
        const branch = curve[3], turn = i % 4 === 3 ? -1 : 1;
        const fork = branch.clone().lerp(b, .30).add(new T.Vector3(dz * .42 * turn, .42, -dx * .42 * turn));
        const tip = fork.clone().lerp(b, .34).add(new T.Vector3(dz * .35 * turn, .31, -dx * .35 * turn));
        strokes.push({ points: [branch, fork, tip], width: .059, start: (from + stop) * .5, end: stop });
      }
    }
    this.stream(strokes, points[0], tint, core, life, electric);
    for (let i = 1; i < path.length; i += path.length < 8 ? 1 : 2) {
      this.scatter(path[i], 2, false, .79, .72);
      if (electric) this.etch(path[i], .54, 'seal', tint, core, .37, { alpha: .64, lift: .21 });
    }
  }

  private skyArc(point: Point, width: number) {
    const bottom = point3(point, .42), top = point3(point, 7.1).add(new T.Vector3(-width, 0, .69));
    const main = Array.from({ length: 8 }, (_, i) => {
      const t = i / 7, p = top.clone().lerp(bottom, t);
      if (i > 0 && i < 7) { p.x += Math.sin(i * 33.8) * .69; p.z += Math.cos(i * 48) * .46; }
      return p;
    });
    const fork = main[3], tips = [-1, 1].map((side) => {
      const mid = fork.clone().add(new T.Vector3(side * .57, -.9, .2)), end = mid.clone().add(new T.Vector3(side * 1.37, -.89, -.51));
      return { points: [fork, mid, end], width: .073, start: .49 };
    });
    this.stream([{ points: main, width: .24 }, ...tips], bottom, '#9c7bff', '#d6fff7', .56, true);
  }

  private blink(from: Point, to: Point, fire: boolean) {
    const tint = fire ? '#ad497e' : '#7756c4', core = fire ? '#ffd49f' : '#e0d7ff';
    this.etch(from, 1.17, 'portal', tint, core, .56, { vertical: true, spin: 1.7, alpha: .78 });
    this.etch(to, 1.23, 'portal', tint, core, .56, { vertical: true, spin: -1.4, alpha: .86 });
    this.etch(to, 1.65, 'seal', tint, core, .53, { alpha: .57 });
    const origin = point3(from, 1.3), end = point3(to, 1.31), mid = origin.clone().lerp(end, .57);
    mid.y += .54;
    this.stream([{ points: [origin, mid, end], width: .21 }], origin, tint, core, .49);
    this.scatter(to, 9, fire, 1.7, .62);
  }

  private gust(from: Point, target: Point, heading: number, radius: number, hot: boolean, staff?: T.Vector3) {
    const origin = staff?.clone() ?? point3(from, 1.13);
    const aim = Math.atan2(target.x - from.x, target.z - from.z);
    const angle = Math.atan2(Math.sin(aim - heading), Math.cos(aim - heading));
    const strokes: RibbonStroke[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = radius * (1 - Math.abs(i) * .088), a = heading + T.MathUtils.clamp(angle + i * .305, -Math.PI / 2, Math.PI / 2);
      const mid = point3({ x: from.x + Math.sin(a - .15) * d * .59, z: from.z + Math.cos(a - .15) * d * .59 }, hot ? .98 : .39);
      const end = point3({ x: from.x + Math.sin(a) * d, z: from.z + Math.cos(a) * d }, hot ? .69 + (i % 2) * .17 : .24);
      const bend = mid.clone().lerp(end, .43);
      bend.y += hot ? .24 : .12;
      strokes.push({ points: [origin, mid, bend, end], width: hot ? .25 - Math.abs(i) * .03 : .17 - Math.abs(i) * .023 });
    }
    this.stream(strokes, origin, hot ? '#ed4d30' : '#4c9dc5', hot ? '#ffdc87' : '#d7fbff', hot ? .53 : .61);
    this.scatter(target, hot ? 13 : 9, hot, 2.14, .42, aim);
  }

  private tongues(center: Point, radius: number, height: number, count: number, life: number, tint = '#e85224', core = '#ffe0a0') {
    const origin = point3(center, .23);
    const strokes: RibbonStroke[] = [];
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996 + center.x * .12, r = radius * (.42 + (i % 3) * .19);
      const foot = point3({ x: center.x + Math.sin(a) * r * .7, z: center.z + Math.cos(a) * r * .7 }, .10);
      const raised = origin.clone().add(new T.Vector3(Math.sin(a + .82) * r, height * (.43 + i % 3 * .13), Math.cos(a + .82) * r));
      const tip = origin.clone().add(new T.Vector3(Math.sin(a + 1.61) * r * .72, height * (.83 + (i % 4) * .13), Math.cos(a + 1.61) * r * .72));
      strokes.push({ points: [foot, foot.clone().lerp(raised, .54), raised, tip], width: .12 + r * .084 });
    }
    this.stream(strokes, origin, tint, core, life);
  }

  private collapse(center: Point, radius: number, hot: boolean) {
    const origin = point3(center, .73);
    const strokes = Array.from({ length: hot ? 5 : 7 }, (_, i) => {
      const a = i * 2.39996, r = radius * (.67 + (i % 3) * .11);
      const edge = origin.clone().add(new T.Vector3(Math.sin(a) * r, .42 + (i % 4) * .19, Math.cos(a) * r));
      const bend = origin.clone().add(new T.Vector3(Math.sin(a + .50) * r * .50, .34, Math.cos(a + .50) * r * .50));
      return { points: [edge, bend, origin], width: .13 + i % 2 * .052 };
    });
    this.stream(strokes, origin, hot ? '#ed5836' : '#8278e0', hot ? '#ffe6a3' : '#e7fdff', hot ? .37 : .50);
  }

  private column(center: Point, width: number, height: number, tint: string, life: number) {
    const mesh = this.flash(plume, tint, .45, life, { rise: .46, expand: .35 });
    mesh.position.set(center.x, heightAt(center.x, center.z) + .12, center.z);
    mesh.scale.set(width, height, width);
  }

  private iceCrystals(point: Point, size: number, tint: string, life: number, yaw: number) {
    if (!this.frostBurst) return;
    const mesh = this.flash(this.frostBurst, tint, 1, life, { frost: 'crystal', grow: size });
    mesh.name = 'meshy-ice-crystal-burst';
    mesh.position.set(point.x, heightAt(point.x, point.z) + .07, point.z);
    mesh.rotation.y = yaw;
    mesh.scale.set(size, size * .14, size);
  }

  private iceSigil(point: Point, radius: number, tint: string, life: number, heading?: number) {
    const mesh = this.flash(heading === undefined ? disc : frontDisc, tint, .94, life, { frost: 'sigil' });
    mesh.name = 'frost-sigil';
    mesh.position.set(point.x, heightAt(point.x, point.z) + .205, point.z);
    mesh.scale.set(radius, 1, radius);
    mesh.rotation.y = heading ?? 0;
  }

  private iceSplinters(point: Point, count: number, life: number, tint: string) {
    if (!this.shard) return;
    const y = heightAt(point.x, point.z) + .24;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996 + point.x * .33, speed = 1.65 + (i % 3) * .59, size = .11 + (i % 4) * .036;
      const drift = new T.Vector3(Math.sin(angle) * speed, 2.7 + (i % 3) * .59, Math.cos(angle) * speed);
      const mesh = this.flash(this.shard, tint, .99, life - (i % 2) * .12, { frost: 'crystal', drift });
      mesh.position.set(point.x + Math.sin(angle) * .36, y, point.z + Math.cos(angle) * .36);
      mesh.rotation.set(.31 + (i % 2) * .43, angle, .31 - i * .18);
      mesh.scale.set(size * .73, size * 1.18, size);
    }
  }

  private iceFan(point: Point, radius: number, heading: number, count: number, tint: string, size: number, life: number) {
    for (let i = 0; i < count; i++) {
      const angle = heading + (i / (count - 1) - .5) * 2.04;
      this.iceCrystals({ x: point.x + Math.sin(angle) * radius, z: point.z + Math.cos(angle) * radius },
        size * (i % 2 ? .82 : 1), tint, life, angle);
    }
  }

  private crown(center: Point, radius: number, count: number, color: string, life: number, heading?: number) {
    for (let i = 0; i < count; i++) {
      const a = heading === undefined ? i * Math.PI * 2 / count : heading + ((i + .5) / count - .5) * Math.PI;
      const x = center.x + Math.sin(a) * radius, z = center.z + Math.cos(a) * radius;
      const mesh = this.flash(crystalGeometry, color, .70, life, { rise: .93 });
      mesh.position.set(x, heightAt(x, z) + .54, z);
      mesh.rotation.set(.28, a, .24);
      mesh.scale.set(.21, .81 + (i % 3) * .15, .25);
    }
  }

  update(dt: number, camera: T.Camera) {
    this.scatterFrame(dt);
    for (const collection of [this.glacial, this.thermal]) for (let i = collection.length - 1; i >= 0; i--) {
      if (collection[i].update(dt, camera)) continue;
      collection[i].dispose();
      collection.splice(i, 1);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.wait > 0) {
        item.wait -= dt;
        if (item.wait > 0) continue;
        item.mesh.visible = true;
        item.left += item.wait;
        item.wait = 0;
      } else item.left -= dt;
      if (item.left <= 0) {
        this.release(item);
        this.items.splice(i, 1);
        continue;
      }
      const fraction = item.left / item.duration, material = item.mesh.material;
      if ('uniforms' in material) {
        material.uniforms.strength.value = item.opacity * Math.min(1, fraction * (item.grow ? 2.45 : 1.8));
        material.uniforms.phase.value = 1 - fraction;
        material.uniforms.clock.value = item.duration - item.left;
      } else material.opacity = item.opacity * fraction ** .74;
      item.mesh.position.y += item.rise * dt;
      if (item.drift) {
        item.mesh.position.addScaledVector(item.drift, dt);
        item.drift.y -= dt * 6.2;
        item.mesh.rotation.x += dt * 2.32;
        item.mesh.rotation.z += dt * 1.92;
      }
      if (item.grow) {
        const t = Math.min(1, (1 - item.left / item.duration) / .30);
        item.scale.y = item.grow * (.14 + .86 * Math.sin(t * Math.PI * .5));
      }
      if (item.expand) item.scale.multiplyScalar(1 + item.expand * dt);
      if (item.billboard) {
        item.mesh.quaternion.copy(camera.quaternion);
        if (item.spin) item.mesh.rotateZ((item.duration - item.left) * item.spin);
      } else if (item.spin) item.mesh.rotation.y += item.spin * dt;
    }
  }

  clear() {
    for (const collection of [this.glacial, this.thermal]) for (const impact of collection) impact.dispose();
    this.glacial = [];
    this.thermal = [];
    for (const item of this.items) this.release(item);
    this.items = [];
    this.embers = [];
    this.flecks.count = 0;
  }
}
