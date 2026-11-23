import * as T from 'three';
import { paint, random } from './art';
import { wrapAxis } from '../field';

const AIR_X = 63, AIR_Z = 57;
const POWDER_RANGE = 28;
const profiles = [
  { count: 410, radius: .086, opacity: .65, ceiling: 14, fall: .68, wind: .76 },
  { count: 124, radius: .143, opacity: .61, ceiling: 11, fall: .92, wind: 1.00 },
  { count: 46, radius: .22, opacity: .47, ceiling: 9, fall: 1.26, wind: 1.34 },
] as const;

const powderPlane = new T.PlaneGeometry(1, 1, 4, 2).rotateX(-Math.PI / 2);
type Powder = { mesh: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>; x: number; z: number; length: number; width: number; phase: number };
type Flight = {
  points: T.Points<T.BufferGeometry, T.PointsMaterial>;
  profile: typeof profiles[number]; ground: Float32Array; phase: Float32Array; fall: Float32Array;
};

function flakesTexture() {
  return paint(64, (ctx, size) => {
    const r = size * .5, gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,254,250,.98)');
    gradient.addColorStop(.28, 'rgba(236,243,255,.84)');
    gradient.addColorStop(.56, 'rgba(212,232,252,.33)');
    gradient.addColorStop(1, 'rgba(193,219,247,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

function powderTexture() {
  return paint(128, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = 2 * x / (size - 1) - 1, v = 2 * y / (size - 1) - 1;
      const center = .16 * Math.sin(u * 4.1) + .056 * Math.sin(u * 11.7);
      const bank = Math.exp(-6.4 * (v - center) ** 2);
      const strands = .76 + .11 * Math.cos(v * 38 + u * 5) + .10 * Math.sin(u * 12 - v * 5);
      const i = (y * size + x) * 4;
      image.data[i] = 223;
      image.data[i + 1] = 239;
      image.data[i + 2] = 255;
      image.data[i + 3] = 186 * bank * strands * Math.max(0, 1 - u * u) ** 2 * Math.max(0, 1 - v * v) ** 1.5;
    }
    ctx.putImageData(image, 0, 0);
  });
}

export class WinterWeather {
  private flights: Flight[] = [];
  private powder: Powder[] = [];
  private phase = 0;
  private gust = .8;
  private terrainFrame = 0;

  constructor(scene: T.Scene, private heightAt: (x: number, z: number) => number) {
    const flake = flakesTexture(), drift = powderTexture();
    const rng = random(329);
    for (const profile of profiles) {
      const positions = new Float32Array(profile.count * 3);
      const ground = new Float32Array(profile.count), phase = new Float32Array(profile.count), fall = new Float32Array(profile.count);
      for (let i = 0; i < profile.count; i++) {
        const x = (rng() - .5) * 2 * AIR_X, z = (rng() - .5) * 2 * AIR_Z;
        ground[i] = heightAt(x, z);
        phase[i] = rng() * Math.PI * 2;
        fall[i] = profile.fall * (.63 + .68 * rng());
        positions.set([x, ground[i] + .16 + rng() * profile.ceiling, z], i * 3);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
      const points = new T.Points(geometry, new T.PointsMaterial({ map: flake, size: profile.radius,
        transparent: true, opacity: profile.opacity, depthWrite: false }));
      points.name = 'winter-snowflakes';
      points.frustumCulled = false;
      scene.add(points);
      this.flights.push({ points, profile, ground, phase, fall });
    }
    for (let i = 0; i < 16; i++) {
      const mesh = new T.Mesh(powderPlane.clone(), new T.MeshBasicMaterial({ map: drift,
        transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1 }));
      mesh.name = 'winter-spindrift';
      mesh.renderOrder = -5;
      mesh.frustumCulled = false;
      (mesh.geometry.attributes.position as T.BufferAttribute).setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
      this.powder.push({ mesh, x: (rng() - .5) * 2 * POWDER_RANGE, z: (rng() - .5) * 2 * POWDER_RANGE,
        length: 4 + rng() * 5.9, width: .68 + rng() * 1.19, phase: rng() * Math.PI * 2 });
    }
    this.update(0, 0, .001);
  }

  climate(tint: T.Color, gust: number) {
    this.gust = gust;
    for (const { points, profile } of this.flights) {
      points.material.color.copy(tint);
      points.material.opacity = profile.opacity * T.MathUtils.lerp(.65, 1, Math.min(1, gust));
    }
    for (const { mesh } of this.powder) mesh.material.color.copy(tint);
  }

  update(centerX: number, centerZ: number, dt: number) {
    if (dt <= 0) return;
    this.phase += dt;
    const time = this.phase, angle = .28 + .25 * Math.sin(time * .22);
    const cosine = Math.cos(angle), sine = Math.sin(angle), wind = (.81 + .4 * Math.sin(time * .78)) * this.gust;
    this.terrainFrame = (this.terrainFrame + 1) % 8;
    for (const { points, profile, ground, phase, fall } of this.flights) {
      const position = points.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const swirl = Math.sin(time * 1.4 + phase[i]) * .37;
        const x = position.getX(i) + dt * (cosine * wind * profile.wind - sine * swirl);
        const z = position.getZ(i) + dt * (sine * wind * profile.wind + cosine * swirl);
        const xx = centerX + wrapAxis(x - centerX, AIR_X), zz = centerZ + wrapAxis(z - centerZ, AIR_Z);
        const wrapped = Math.abs(xx - x) > 1 || Math.abs(zz - z) > 1;
        if (wrapped || i % 8 === this.terrainFrame) {
          const floor = this.heightAt(xx, zz);
          if (wrapped) {
            position.setXYZ(i, xx, floor + Math.max(.08, position.getY(i) - ground[i]), zz);
            ground[i] = floor;
            continue;
          }
          ground[i] = floor;
        }
        let y = position.getY(i) - fall[i] * dt;
        if (y < ground[i] + .06) y += profile.ceiling;
        position.setXYZ(i, xx, y, zz);
      }
      position.needsUpdate = true;
    }
    const base = powderPlane.attributes.position;
    for (const drift of this.powder) {
      const speed = wind * (.68 + .22 * Math.sin(drift.phase + time * .35));
      drift.x = centerX + wrapAxis(drift.x - centerX + dt * cosine * speed, POWDER_RANGE);
      drift.z = centerZ + wrapAxis(drift.z - centerZ + dt * sine * speed, POWDER_RANGE);
      const distance = Math.max(Math.abs(drift.x - centerX), Math.abs(drift.z - centerZ));
      const edge = 1 - T.MathUtils.smoothstep(distance, POWDER_RANGE - 7, POWDER_RANGE - 1);
      const breath = (.5 + .5 * Math.sin(time * .52 + drift.phase)) ** 2;
      const { mesh } = drift;
      mesh.material.opacity = .31 * edge * breath * Math.min(1.16, this.gust);
      mesh.visible = mesh.material.opacity > .01;
      if (!mesh.visible) continue;
      const y = this.heightAt(drift.x, drift.z);
      mesh.position.set(drift.x, y, drift.z);
      const points = mesh.geometry.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const u = base.getX(i) * drift.length, v = base.getZ(i) * drift.width;
        const x = cosine * u - sine * v, z = sine * u + cosine * v;
        points.setXYZ(i, x, this.heightAt(drift.x + x, drift.z + z) - y + .10, z);
      }
      points.needsUpdate = true;
    }
  }
}
