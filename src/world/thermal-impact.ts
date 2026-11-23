import * as T from 'three';
import type { Point } from '../combat';
import { random } from './art';
import { effectPlane, heatBillow, moltenCore } from './element-vfx';
import { heightAt } from './terrain';

const rock = new T.DodecahedronGeometry(1, 0);
const lifespan = 1.66;
const batch = (geometry: T.BufferGeometry, material: T.ShaderMaterial, total: number) => {
  const mesh = new T.InstancedMesh(geometry, material, total);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  return mesh;
};

export class ThermalImpact {
  private root = new T.Group();
  private shards = batch(rock, moltenCore(true), 28);
  private flames = batch(effectPlane, heatBillow(false), 7);
  private ash = batch(effectPlane, heatBillow(true), 5);
  private pose = new T.Object3D();
  private age = 0;
  private rim;
  private ejecta;
  private plumes;
  private floor;

  constructor(scene: T.Scene, private point: Point, radius: number) {
    this.root.name = 'meteor-thermal-impact';
    this.shards.name = 'meteor-ejected-molten-rock';
    this.flames.name = 'meteor-flame-plumes';
    this.ash.name = 'meteor-rolling-ash';
    this.root.add(this.shards, this.flames, this.ash);
    scene.add(this.root);
    const rng = random(11717);
    const scalar = Math.min(1.43, Math.max(.66, radius / 4.15));
    this.floor = heightAt(point.x, point.z);
    this.rim = Array.from({ length: 14 }, (_, i) => {
      const a = i * Math.PI / 7 + (rng() - .5) * .21;
      const distance = radius * (.44 + rng() * .27);
      const x = point.x + Math.sin(a) * distance, z = point.z + Math.cos(a) * distance;
      return { x, z, y: heightAt(x, z), a, h: (.17 + rng() * .25) * scalar, width: (.22 + rng() * .36) * scalar, delay: i % 3 * .022 };
    });
    this.ejecta = Array.from({ length: 14 }, (_, i) => ({
      a: i * 2.39996, speed: (.88 + rng() * 2.74) * scalar, lift: 2.24 + rng() * 4.19,
      size: (.073 + rng() * .213) * scalar, spin: (rng() - .5) * 9.4,
      offset: (.30 + rng() * .63) * scalar, delay: rng() * .11,
    }));
    this.plumes = Array.from({ length: 12 }, (_, i) => ({
      a: i * 2.39996 + rng() * .43, r: (.26 + rng() * .81) * scalar,
      h: (.88 + rng() * .78) * scalar, width: (.60 + rng() * .74) * scalar,
      speed: rng() * .68 + .25, delay: rng() * .16, lean: (rng() - .5) * .31,
    }));
  }

  update(dt: number, camera: T.Camera) {
    const age = this.age += dt;
    if (age >= lifespan) return false;
    const { x, z } = this.point, pose = this.pose;
    const crumble = T.MathUtils.smoothstep(age, .79, lifespan);
    let count = 0;
    for (const { x, z, y, a, h, width, delay } of this.rim) {
      if (age <= delay) continue;
      const rise = T.MathUtils.smoothstep(age - delay, 0, .14);
      pose.position.set(x, y + h * (.23 + rise * .29) - crumble * h * .97, z);
      pose.rotation.set(.28, a, .21);
      pose.scale.set(width * (1 - crumble * .69), h * rise * (1 - crumble * .78), width * .81);
      pose.updateMatrix();
      this.shards.setMatrixAt(count++, pose.matrix);
    }
    for (const { a, speed, lift, size, spin, offset, delay } of this.ejecta) {
      const time = age - delay;
      if (time <= 0 || time > 1.23) continue;
      const d = offset + time * speed, y = this.floor + .51 + time * (lift - time * 5.9);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (y < heightAt(px, pz)) continue;
      const shrink = size * (1 - T.MathUtils.smoothstep(time, .46, 1.23) * .88);
      pose.position.set(px, y, pz);
      pose.rotation.set(time * spin, a + time * 4.9, time * spin * -.42);
      pose.scale.set(shrink, shrink * 1.22, shrink * .88);
      pose.updateMatrix();
      this.shards.setMatrixAt(count++, pose.matrix);
    }
    this.draw(this.shards, count, age, 1);

    let light = 0, soot = 0;
    for (const [i, p] of this.plumes.entries()) {
      const time = age - p.delay, isAsh = i >= 7;
      if (time <= 0 || (!isAsh && time > .92)) continue;
      const growth = .44 + T.MathUtils.smoothstep(time, 0, .27) * .56;
      const fadeUp = isAsh ? time * 1.33 : time * .81;
      const distance = (p.r + fadeUp * p.speed) * (isAsh ? 1.27 : 1);
      const width = p.width * (growth + fadeUp * .62);
      pose.position.set(x + Math.sin(p.a) * distance, this.floor + p.h * growth + fadeUp, z + Math.cos(p.a) * distance);
      pose.quaternion.copy(camera.quaternion);
      pose.rotateZ(p.lean);
      pose.scale.set(width, p.h * (growth + .4 * fadeUp) * (isAsh ? .89 : 1.58), 1);
      pose.updateMatrix();
      if (isAsh) this.ash.setMatrixAt(soot++, pose.matrix);
      else this.flames.setMatrixAt(light++, pose.matrix);
    }
    this.draw(this.ash, soot, age, .38 * T.MathUtils.smoothstep(age, .15, .47) * (1 - T.MathUtils.smoothstep(age, .70, lifespan)));
    this.draw(this.flames, light, age, .79 * (1 - T.MathUtils.smoothstep(age, .27, .91)));
    return true;
  }

  private draw(mesh: T.InstancedMesh<T.BufferGeometry, T.ShaderMaterial>, count: number, age: number, strength: number) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.material.uniforms.clock.value = age;
    mesh.material.uniforms.strength.value = strength;
  }

  dispose() {
    this.root.removeFromParent();
    for (const mesh of [this.shards, this.flames, this.ash]) {
      mesh.dispose();
      mesh.material.dispose();
    }
  }
}
