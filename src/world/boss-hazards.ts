import * as T from 'three';
import type { Hazard } from '../combat';
import type { BossAttackCue } from '../data';
import { crystalGeometry } from './art';
import { heightAt } from './terrain';

const tones = {
  prism: { color: '#8affeb', dark: '#16444f', form: 'crystal' },
  queen: { color: '#ffbfe8', dark: '#4a1e50', form: 'arcane' },
  glacier: { color: '#91deff', dark: '#163451', form: 'crystal' },
  eclipse: { color: '#ffb05c', dark: '#591e24', form: 'fire' },
  gearLine: { color: '#ffe09a', dark: '#542c1c', form: 'gear' },
  gearCross: { color: '#ffd482', dark: '#542c1c', form: 'gear' },
  abyssTrack: { color: '#df9cff', dark: '#39194b', form: 'arcane' },
  abyssLine: { color: '#f3aeff', dark: '#39194b', form: 'arcane' },
  riftPulse: { color: '#e2acff', dark: '#492057', form: 'arcane' },
  riftLine: { color: '#9cf7fd', dark: '#203f5a', form: 'crystal' },
  stormShot: { color: '#a5f9ff', dark: '#1d4356', form: 'crystal' },
  oracleShot: { color: '#efabff', dark: '#44244e', form: 'arcane' },
  dawnShot: { color: '#ffd080', dark: '#643b25', form: 'fire' },
  stormCross: { color: '#78dfff', dark: '#28365f', form: 'crystal' },
  stormVolley: { color: '#9aeaff', dark: '#233f67', form: 'crystal' },
  riftRing: { color: '#f6b5ff', dark: '#3e1b55', form: 'arcane' },
  riftChase: { color: '#d391ff', dark: '#3a1c53', form: 'arcane' },
  dawnRing: { color: '#ffc86e', dark: '#571b28', form: 'fire' },
  dawnCross: { color: '#ffc180', dark: '#542528', form: 'fire' },
  stormCharge: { color: '#a3f6ff', dark: '#284259', form: 'crystal' },
  dawnCharge: { color: '#ffdb8f', dark: '#6c3030', form: 'fire' },
} as const;
const neutral = { color: '#ffd097', dark: '#641c30', form: 'fire' } as const;
export const bossHazardTone = (cue?: BossAttackCue) => cue ? tones[cue] : neutral;

const horizontal = (mesh: T.BufferGeometry) => mesh.rotateX(-Math.PI / 2);
const plate = horizontal(new T.CircleGeometry(1, 48));
const rim = horizontal(new T.RingGeometry(.936, 1, 56));
const thinRing = horizontal(new T.RingGeometry(.96, 1, 48));
const marker = horizontal(new T.RingGeometry(.79, 1, 4).rotateZ(Math.PI / 4));
const vertical = new T.ConeGeometry(1, 1, 6, 1, true).translate(0, .5, 0);
const signs: Record<(typeof neutral | typeof tones[BossAttackCue])['form'], T.BufferGeometry> = {
  crystal: marker,
  arcane: horizontal(new T.RingGeometry(.81, 1, 6)),
  fire: horizontal(new T.RingGeometry(.83, 1, 3)),
  gear: horizontal(new T.RingGeometry(.78, 1, 8)),
};

export class BossWarning {
  readonly root = new T.Group();
  private fill = this.add(plate, '#641c30', .54, .002);
  private edge = this.add(rim, '#ff747e', .93, .017);
  private charge = this.add(thinRing, '#ffd097', .90, .026);
  private insignia = this.add(marker, '#fff1ce', .85, .042);
  private flare = this.add(vertical, '#ffd097', .43, .035);
  private embers = Array.from({ length: 4 }, () => this.add(crystalGeometry, '#ffd097', .75));

  constructor(scene: T.Scene) {
    this.root.name = 'boss-telegraph';
    scene.add(this.root);
  }

  private add(geometry: T.BufferGeometry, color: string, opacity: number, y = 0) {
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false,
      toneMapped: false, side: T.DoubleSide }));
    mesh.position.y = y;
    this.root.add(mesh);
    return mesh;
  }

  update(hazard: Hazard) {
    const progress = T.MathUtils.clamp(1 - hazard.delay / hazard.windup, 0, 1);
    const tone = bossHazardTone(hazard.cue), radius = hazard.radius;
    this.root.visible = true;
    this.root.userData.cue = hazard.cue;
    this.root.position.set(hazard.x, heightAt(hazard.x, hazard.z) + .23, hazard.z);
    this.root.scale.set(radius, 1, radius);
    this.fill.material.color.set(tone.dark);
    this.fill.material.opacity = .45 + progress * .20;
    this.edge.material.color.set(hazard.elite ? '#ffbd80' : '#ff747e');
    this.edge.material.opacity = .82 + progress * .17;
    this.charge.material.color.set(tone.color);
    this.charge.scale.set(.12 + progress * .86, 1, .12 + progress * .86);
    this.insignia.geometry = signs[tone.form];
    this.insignia.material.color.set(tone.color);
    this.insignia.scale.set(.22 + progress * .12, 1, .22 + progress * .12);
    this.insignia.rotation.y = progress * (tone.form === 'gear' ? 2.2 : .85);
    this.flare.material.color.set(tone.color);
    this.flare.material.opacity = .25 + progress * .35;
    this.flare.scale.set(.09 + progress * .11, (.40 + progress * 1.37) * (hazard.elite ? .74 : 1), .09 + progress * .11);
    this.flare.rotation.y = progress * 2.3;
    for (const [i, ember] of this.embers.entries()) {
      const angle = i * Math.PI / 2 + progress * 5, ring = .38 + .31 * (1 - progress);
      ember.position.set(Math.sin(angle) * ring, .13 + .75 * progress + .19 * Math.sin(angle), Math.cos(angle) * ring);
      ember.rotation.y = angle;
      ember.scale.set(.035 + .018 * progress, .11 + .11 * progress, .04);
      ember.material.color.set(tone.color);
    }
  }
}

const arrowShape = new T.Shape();
arrowShape.moveTo(0, -.63);
arrowShape.lineTo(.45, .25);
arrowShape.lineTo(.15, .12);
arrowShape.lineTo(.15, .42);
arrowShape.lineTo(-.15, .42);
arrowShape.lineTo(-.15, .12);
arrowShape.lineTo(-.45, .25);
arrowShape.closePath();
const arrow = horizontal(new T.ShapeGeometry(arrowShape));

export class ChargeWarning {
  readonly root = new T.Group();
  private fill = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({
    color: '#623048', transparent: true, opacity: .48, depthWrite: false, side: T.DoubleSide, toneMapped: false,
  }));
  private edge = new T.LineLoop(new T.BufferGeometry(), new T.LineBasicMaterial({ color: '#ff7b86', toneMapped: false }));
  private ink = new T.MeshBasicMaterial({ color: '#f9ca91', transparent: true, opacity: .9, depthWrite: false, toneMapped: false, side: T.DoubleSide });
  private arrows = Array.from({ length: 6 }, () => new T.Mesh(arrow, this.ink));
  private current?: Hazard['charge'];

  constructor(scene: T.Scene) {
    this.root.name = 'boss-charge-telegraph';
    this.root.add(this.fill, this.edge, ...this.arrows);
    scene.add(this.root);
  }

  update(hazard: Hazard) {
    this.root.visible = true;
    const progress = T.MathUtils.clamp(1 - hazard.delay / hazard.windup, 0, 1);
    this.fill.material.opacity = .40 + progress * .20;
    this.ink.opacity = .59 + progress * .39;
    if (hazard.charge === this.current) return;
    const to = hazard.charge!.to, radius = hazard.radius;
    this.current = hazard.charge;
    const dx = to.x - hazard.x, dz = to.z - hazard.z;
    const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
    const tone = bossHazardTone(hazard.cue);
    this.ink.color.set(tone.color);
    this.fill.material.color.set(tone.dark);
    const at = (along: number, side: number, lift: number) => {
      const x = hazard.x + along * ux + side * uz, z = hazard.z + along * uz - side * ux;
      return new T.Vector3(x, heightAt(x, z) + lift, z);
    };
    const offsets: number[] = [];
    for (let i = 0; i < 9; i++) offsets.push(-radius + i / 9 * radius);
    const strips = Math.ceil(length / .52);
    for (let i = 0; i <= strips; i++) offsets.push(i / strips * length);
    for (let i = 1; i <= 9; i++) offsets.push(length + i / 9 * radius);
    const positions: number[] = [], indices: number[] = [], left: T.Vector3[] = [], right: T.Vector3[] = [];
    for (const [i, d] of offsets.entries()) {
      const end = Math.max(0, -d, d - length), width = Math.sqrt(Math.max(0, radius ** 2 - end ** 2));
      for (const side of [-width, 0, width]) positions.push(...at(d, side, .225).toArray());
      left.push(at(d, -width, .285));
      right.push(at(d, width, .285));
      if (!i) continue;
      const a = 3 * (i - 1);
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
    this.fill.geometry.dispose();
    this.fill.geometry = new T.BufferGeometry();
    this.fill.geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    this.fill.geometry.setIndex(indices);
    this.edge.geometry.dispose();
    this.edge.geometry = new T.BufferGeometry().setFromPoints([...left, ...right.reverse()]);
    const count = Math.min(this.arrows.length, Math.max(1, Math.floor(length / 2)));
    for (const [i, glyph] of this.arrows.entries()) {
      glyph.visible = i < count;
      glyph.position.copy(at((i + .55) / count * length, 0, .33));
      glyph.rotation.y = Math.atan2(dx, dz);
    }
  }
}
