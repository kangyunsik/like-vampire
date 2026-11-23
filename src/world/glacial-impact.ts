import * as T from 'three';
import type { Point } from '../combat';
import { crystalGeometry, random } from './art';
import { fracturedIce, frostVapor, prismaticIce } from './frost-vfx';
import { heightAt } from './terrain';

const DURATION = 2.45;
const wispPlane = new T.PlaneGeometry(1, 1);
const crystalColors = ['#c8f8ff', '#88d9f0', '#b4b0ff', '#659ed6'].map((hex) => new T.Color(hex));
const ribs = [
  // Angle, distance, footprint, height. Tall silhouettes alternate with low ice.
  [-1.23, .66, .59, .81], [-.91, .62, .89, 1.21], [-.66, .82, .66, .88],
  [-.50, .44, .70, .87], [-.34, .65, 1.13, 1.70], [-.16, .81, .69, 1.16],
  [ .12, .50, 1.05, 1.47], [ .31, .79, .63, 1.05], [ .49, .64, .97, 1.34],
  [ .73, .46, .69, .85], [ .92, .79, .78, 1.14], [1.24, .68, .58, .79],
] as const;

function icePatch(center: Point, radius: number, heading: number) {
  const segments = 48, rings = 12;
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const y = heightAt(center.x, center.z);
  const vertices = [0, .155, 0], uv = [.5, 0], indices: number[] = [];
  for (let band = 1; band <= rings; band++) {
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments - .5) * Math.PI;
      const x = Math.sin(angle) * band / rings, z = Math.cos(angle) * band / rings;
      const h = heightAt(center.x + (x * cos + z * sin) * radius, center.z + (z * cos - x * sin) * radius);
      vertices.push(x, h - y + .155, z);
      uv.push(x * .5 + .5, z);
      if (i === 0) continue;
      const index = 1 + (band - 1) * (segments + 1) + i;
      if (band === 1) indices.push(0, index - 1, index);
      else {
        const inner = index - segments - 1;
        indices.push(inner - 1, index - 1, index, inner - 1, index, inner);
      }
    }
  }
  return new T.BufferGeometry()
    .setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
    .setAttribute('uv', new T.Float32BufferAttribute(uv, 2)).setIndex(indices);
}

const layers = (geometry: T.BufferGeometry, material: T.ShaderMaterial, count: number) => {
  const batch = new T.InstancedMesh(geometry, material, count);
  batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
  batch.frustumCulled = false;
  batch.count = 0;
  return batch;
};

export class GlacialImpact {
  private root = new T.Group();
  private ground: T.Mesh<T.BufferGeometry, T.ShaderMaterial>;
  private ridges: T.InstancedMesh<T.BufferGeometry, T.ShaderMaterial>;
  private shards: T.InstancedMesh<T.BufferGeometry, T.ShaderMaterial>;
  private wisps: T.InstancedMesh<T.BufferGeometry, T.ShaderMaterial>;
  private pose = new T.Object3D();
  private age = 0;
  private ridgeLocations;
  private flurry;
  private vapor;

  constructor(scene: T.Scene, center: Point, radius: number, heading: number, burst?: T.BufferGeometry, shard?: T.BufferGeometry) {
    this.root.name = 'absolute-zero-glacial-impact';
    this.ground = new T.Mesh(icePatch(center, radius, heading), fracturedIce());
    this.ground.name = 'absolute-zero-ice-ground';
    this.ground.position.set(center.x, heightAt(center.x, center.z), center.z);
    this.ground.rotation.y = heading;
    this.ground.scale.set(radius, 1, radius);
    this.ground.renderOrder = -1;
    this.ridges = layers(burst ?? crystalGeometry, prismaticIce('#8ccdf4', .98), ribs.length);
    this.ridges.name = burst ? 'meshy-ice-crystal-burst' : 'absolute-zero-ice-spires';
    this.shards = layers(shard ?? crystalGeometry, prismaticIce('#b1e5ff', .94), 26);
    this.shards.name = 'absolute-zero-airborne-shards';
    this.wisps = layers(wispPlane, frostVapor(), 8);
    this.wisps.name = 'absolute-zero-frost-vapor';
    this.root.add(this.ground, this.ridges, this.shards, this.wisps);
    scene.add(this.root);

    const scaled = T.MathUtils.clamp(radius / 7.1, .76, 1.6);
    const at = (angle: number, distance: number) => {
      const x = center.x + Math.sin(angle) * distance, z = center.z + Math.cos(angle) * distance;
      return { x, y: heightAt(x, z), z };
    };
    this.ridgeLocations = ribs.map(([arc, distance, breadth, height], i) => {
      const angle = heading + arc;
      return { ...at(angle, radius * distance), angle, breadth: breadth * scaled, height: height * scaled,
        delay: .075 + distance * .28 + (i % 3) * .026, lean: (i % 2 ? -.16 : .14) * height, color: crystalColors[i % crystalColors.length] };
    });
    const rng = random(431);
    this.flurry = Array.from({ length: this.shards.instanceMatrix.count }, (_, i) => {
      const angle = heading + (rng() - .5) * 2.5, distance = .18 + rng() * .52;
      return { ...at(angle, radius * distance), angle, size: (.065 + rng() * .15) * scaled,
        speed: (1.14 + rng() * 3.2) * scaled, lift: 2.9 + rng() * 3.9, life: .60 + rng() * .53,
        delay: .14 + distance * .29 + rng() * .17, spin: (rng() - .5) * 8.5, color: crystalColors[i % crystalColors.length] };
    });
    this.vapor = Array.from({ length: this.wisps.instanceMatrix.count }, (_, i) => {
      const angle = heading + (i / 7 - .5) * 2.6, distance = .36 + rng() * .33;
      return { ...at(angle, radius * distance), angle, size: (1.95 + rng() * 2.05) * scaled, delay: .21 + rng() * .25 };
    });
  }

  update(dt: number, camera: T.Camera) {
    const time = this.age += dt;
    if (time >= DURATION) return false;
    const fade = 1 - T.MathUtils.smoothstep(time, 1.17, DURATION);
    const surface = this.ground.material.uniforms;
    surface.clock.value = time;
    surface.phase.value = time / DURATION;
    surface.strength.value = fade;
    const pose = this.pose;
    let count = 0;
    for (const { x, y, z, delay, breadth, height, angle, lean, color } of this.ridgeLocations) {
      const life = time - delay;
      if (life <= 0) continue;
      const rise = 1 - (1 - Math.min(1, life / .36)) ** 3;
      const sink = T.MathUtils.smoothstep(time, 1.40, DURATION);
      const width = breadth * (.76 + .24 * rise);
      pose.position.set(x, y + .07 - sink * .54 * height, z);
      pose.rotation.set(lean * .72, angle, lean);
      pose.scale.set(width, height * rise, width * .89);
      pose.updateMatrix();
      this.ridges.setMatrixAt(count, pose.matrix);
      this.ridges.setColorAt(count++, color);
    }
    this.apply(this.ridges, count, time, fade);

    count = 0;
    for (const { x, y, z, delay, life, angle, speed, lift, size, spin, color } of this.flurry) {
      const flight = time - delay;
      if (flight <= 0 || flight >= life) continue;
      const height = y + .47 + flight * (lift - flight * 5.3);
      const px = x + Math.sin(angle) * flight * speed, pz = z + Math.cos(angle) * flight * speed;
      if (height < heightAt(px, pz)) continue;
      const shrink = size * (1 - .86 * T.MathUtils.smoothstep(flight, life * .48, life));
      pose.position.set(px, height, pz);
      pose.rotation.set(.45 + flight * spin, angle + flight * 4, .22 - flight * spin);
      pose.scale.set(shrink, shrink * 1.55, shrink);
      pose.updateMatrix();
      this.shards.setMatrixAt(count, pose.matrix);
      this.shards.setColorAt(count++, color);
    }
    this.apply(this.shards, count, time, .94);

    count = 0;
    for (const { x, y, z, angle, size, delay } of this.vapor) {
      const drift = time - delay;
      if (drift <= 0) continue;
      const width = size * (.63 + drift * .54);
      pose.position.set(x + Math.sin(angle) * drift * .94, y + .32 + drift * .31, z + Math.cos(angle) * drift * .94);
      pose.quaternion.copy(camera.quaternion);
      pose.scale.set(width, width * .45, 1);
      pose.updateMatrix();
      this.wisps.setMatrixAt(count++, pose.matrix);
    }
    this.apply(this.wisps, count, time, .66 * fade * T.MathUtils.smoothstep(time, .26, .82));
    return true;
  }

  private apply(mesh: T.InstancedMesh<T.BufferGeometry, T.ShaderMaterial>, count: number, time: number, strength: number) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.uniforms.clock.value = time;
    mesh.material.uniforms.strength.value = strength;
  }

  dispose() {
    this.root.removeFromParent();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    for (const mesh of [this.ridges, this.shards, this.wisps]) {
      mesh.dispose();
      mesh.material.dispose();
    }
  }
}
