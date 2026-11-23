import * as T from 'three';
import type { Combat, Storm } from '../combat';
import { part } from './art';
import { effectDisc, effectFan, elementalWard, etchedSurface, moltenCore } from './element-vfx';
import { heightAt } from './terrain';

type Field = 'blizzard' | 'whiteout' | 'flamestrike' | 'cinderVortex';
const palettes = {
  blizzard: ['rime', '#66b4e1', '#e4fcff', .61],
  whiteout: ['spiral', '#a29bf0', '#f5e5ff', .63],
  flamestrike: ['slag', '#e65726', '#ffd076', .65],
  cinderVortex: ['spiral', '#df5037', '#ffc271', .57],
} as const;
const wing = new T.TorusGeometry(1, .016, 5, 44, Math.PI * .80);
const halo = new T.TorusGeometry(1, .014, 5, 56);
const sphere = new T.SphereGeometry(1, 32, 20);
const heartShape = (() => {
  const s = new T.Shape();
  s.moveTo(0, -.91); s.bezierCurveTo(-.22, -.62, -1, -.12, -1, .34);
  s.bezierCurveTo(-1, .97, -.32, 1.03, 0, .55); s.bezierCurveTo(.32, 1.03, 1, .97, 1, .34);
  s.bezierCurveTo(1, -.12, .22, -.62, 0, -.91);
  return new T.ExtrudeGeometry(s, { depth: .38, steps: 1, bevelSize: .11, bevelThickness: .12, bevelSegments: 2 }).translate(0, 0, -.19);
})();

function shimmer(color: string, opacity: number) {
  return new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false,
    blending: T.AdditiveBlending, toneMapped: false });
}

function makeField(scene: T.Scene, kind: Field) {
  const root = new T.Group();
  root.name = `spell-field-${kind}`;
  const [etch, tint, core, opacity] = palettes[kind];
  const land = etchedSurface(etch, tint, core, opacity);
  const mark = part(root, kind === 'cinderVortex' ? effectFan : effectDisc, land, 0, .13, 0);
  mark.renderOrder = -2;
  const stream = kind === 'whiteout' || kind === 'cinderVortex'
    ? Array.from({ length: 3 }, () => part(root, wing, shimmer(tint, .45))) : [];
  root.visible = false;
  scene.add(root);
  return { root, land, stream, opacity };
}

export class SpellFields {
  private pools: Record<Field, ReturnType<typeof makeField>[]> = { blizzard: [], whiteout: [], flamestrike: [], cinderVortex: [] };
  constructor(private scene: T.Scene) {}

  update(storms: readonly Storm[], heading: number, time: number, visible: (x: number, y: number, z: number, radius: number) => boolean) {
    const used: Record<Field, number> = { blizzard: 0, whiteout: 0, flamestrike: 0, cinderVortex: 0 };
    for (const storm of storms) {
      const y = heightAt(storm.x, storm.z);
      if (!visible(storm.x, y + 1, storm.z, storm.radius + 2)) continue;
      const kind = storm.mobile ? 'cinderVortex' : storm.fire ? 'flamestrike' : storm.pulses === undefined ? 'blizzard' : 'whiteout';
      const i = used[kind]++;
      const { root, land, stream, opacity } = this.pools[kind][i] ??= makeField(this.scene, kind);
      const age = storm.maxLife - storm.life;
      const fade = Math.min(1, storm.life * 2.9, age * 5.7 + .17);
      const radius = storm.radius;
      root.visible = true;
      root.position.set(storm.x, y, storm.z);
      root.scale.set(radius, 1, radius);
      root.rotation.y = storm.mobile ? heading : 0;
      land.uniforms.clock.value = time;
      land.uniforms.phase.value = Math.min(1, age * 1.4);
      land.uniforms.strength.value = opacity * fade;
      for (const [index, ribbon] of stream.entries()) {
        const a = time * (storm.mobile ? 2.9 : -.6) + index * 2.094;
        const side = storm.mobile ? Math.sin(a) * .43 : Math.sin(a) * .26;
        ribbon.position.set(side, .31 + index * .31 + .1 * Math.sin(a), storm.mobile ? .41 + Math.cos(a) * .22 : Math.cos(a) * .29);
        ribbon.rotation.set(-Math.PI / 2 + .12 * Math.cos(a), 0, a);
        ribbon.scale.set(.55 + .05 * index, .55 + .05 * index, .83 / radius);
        (ribbon.material as T.MeshBasicMaterial).opacity = fade * (storm.mobile ? .47 : .22);
      }
    }
    for (const kind of Object.keys(this.pools) as Field[]) {
      for (let i = used[kind]; i < this.pools[kind].length; i++) this.pools[kind][i].root.visible = false;
    }
  }
}

export class CasterAuras {
  private wards: Record<'frost' | 'fire', ReturnType<CasterAuras['ward']>>;
  private mantle: T.Group;
  private core: T.Mesh;
  private heat = moltenCore(true);

  constructor(parent: T.Scene) {
    this.wards = { frost: this.ward(parent, false), fire: this.ward(parent, true) };
    this.mantle = new T.Group();
    this.mantle.name = 'combustion-living-mantle';
    for (let i = 0; i < 4; i++) {
      const stream = part(this.mantle, wing, shimmer(i % 2 ? '#ff9562' : '#ffcd86', .67));
      stream.rotation.x = -.88 - i * .16;
    }
    this.core = new T.Mesh(heartShape, this.heat);
    this.core.name = 'inferno-heart-core';
    this.mantle.visible = this.core.visible = false;
    parent.add(this.mantle, this.core);
  }

  private ward(scene: T.Scene, fire: boolean) {
    const root = new T.Group();
    root.name = fire ? 'blazing-barrier-ward' : 'ice-barrier-ward';
    const shell = elementalWard(fire);
    part(root, sphere, shell, 0, 1.41, 0).scale.set(1.27, 1.49, 1.27);
    const layer = new T.Group();
    const sparks = fire ? ['#ff7945', '#ffb858'] : ['#8adefd', '#dafbff'];
    for (let i = 0; i < 3; i++) {
      const arc = part(layer, fire ? wing : halo, shimmer(sparks[i % 2], fire ? .78 : .47), 0, 1.38 + (i - 1) * .11, 0);
      arc.scale.setScalar(1.31 + i * .055);
      arc.rotation.set(-1.4 + (.21 * (i - 1)), .5 * i, Math.PI * i / 3);
    }
    root.add(layer);
    root.visible = false;
    scene.add(root);
    return { root, shell, layer };
  }

  update(game: Combat | null, x: number, y: number, z: number, time: number) {
    for (const key of ['frost', 'fire'] as const) {
      const { root, shell, layer } = this.wards[key];
      root.visible = Boolean(game?.barrier && game.mageClass === key);
      if (!root.visible) continue;
      const life = game!.barrierTime, fade = Math.min(1, life * 3, (6 - life) * 10 + .25);
      root.position.set(x, y, z);
      root.scale.setScalar(.97 + Math.sin(time * 4.3) * .026);
      shell.uniforms.clock.value = time;
      shell.uniforms.strength.value = fade * .84;
      layer.rotation.y = time * (key === 'fire' ? -1.6 : .62);
    }
    this.mantle.visible = Boolean(game?.combustion);
    if (this.mantle.visible) {
      this.mantle.position.set(x, y + 1.24, z);
      this.mantle.rotation.y = time * 1.92;
      this.mantle.children.forEach((stream, i) => {
        const phase = time * 4.7 + i * 1.57;
        const scale = .82 + .19 * Math.sin(phase);
        stream.rotation.z = phase;
        stream.scale.set(scale, scale, 1);
        stream.position.y = (i - 1.5) * .20 + .18 * Math.cos(phase);
      });
    }
    this.core.visible = Boolean(game?.inferno);
    if (this.core.visible) {
      const angle = time * 2.9, pulse = Math.max(0, Math.sin(time * 7.2)) ** 5;
      this.core.position.set(x + Math.sin(angle) * .73, y + 2.67 + .13 * Math.sin(angle), z + Math.cos(angle) * .73);
      this.core.rotation.set(.16, angle, -.12);
      this.core.scale.setScalar(.24 + .065 * pulse);
      this.heat.uniforms.clock.value = time;
    }
  }
}
