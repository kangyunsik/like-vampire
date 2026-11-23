import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const surfaces = new Map<string, T.MeshStandardMaterial>();
export const sphere = new T.SphereGeometry(1, 20, 14);
export const littleSphere = new T.SphereGeometry(1, 12, 8);
export const crystalGeometry = new T.OctahedronGeometry(1);
export const up = new T.Vector3(0, 1, 0);

export function surface(color: string, glow = 0, flat = false) {
  const key = `${color}/${glow}/${flat}`;
  let material = surfaces.get(key);
  if (!material) {
    material = new T.MeshStandardMaterial({ color, roughness: glow ? 0.38 : 0.76, emissive: color, emissiveIntensity: glow, flatShading: flat });
    surfaces.set(key, material);
  }
  return material;
}

export function part(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function oval(parent: T.Object3D, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, low = false) {
  const mesh = part(parent, low ? littleSphere : sphere, material, x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

export function tube(parent: T.Object3D, points: number[][], width: number, material: T.Material, segments = 14) {
  const curve = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
  return part(parent, new T.TubeGeometry(curve, segments, width, 7, false), material);
}

export function lathe(profile: number[][], segments = 32) {
  return new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), segments);
}

export function ring(parent: T.Object3D, radius: number, width: number, material: T.Material, x: number, y: number, z: number) {
  const mesh = part(parent, new T.TorusGeometry(radius, width, 8, 64), material, x, y, z);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function batch(group: T.Group) {
  const buckets = new Map<string, { material: T.Material; geometry: T.BufferGeometry[]; cast: boolean; receive: boolean }>();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    const mesh = object as T.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const key = `${mesh.material.id}/${Object.keys(mesh.geometry.attributes).sort().join()}/${Boolean(mesh.geometry.index)}/${mesh.castShadow}/${mesh.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, { material: mesh.material, geometry: [], cast: mesh.castShadow, receive: mesh.receiveShadow });
    buckets.get(key)!.geometry.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  });
  const result = new T.Group();
  for (const { material, geometry, cast, receive } of buckets.values()) {
    const mesh = part(result, geometry.length === 1 ? geometry[0] : mergeGeometries(geometry), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (geometry.length > 1) geometry.forEach((item) => item.dispose());
  }
  return result;
}

export function paint(size: number, draw: (context: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  draw(context, size);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

export function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function bentHat(dark = '#27213a', light = '#6b567e') {
  const profile = [
    [0, 0.66, 0, 0], [0.11, 0.65, -0.01, 0], [0.26, 0.57, -0.04, -0.01],
    [0.47, 0.48, -0.09, -0.045], [0.69, 0.39, -0.18, -0.05], [0.90, 0.29, -0.31, -0.03],
    [1.07, 0.21, -0.46, 0.01], [1.15, 0.13, -0.63, 0.08], [1.14, 0.071, -0.77, 0.14],
    [1.08, 0.025, -0.87, 0.19], [1.06, 0.004, -0.905, 0.20],
  ];
  const positions: number[] = [], indices: number[] = [], colors: number[] = [];
  const n = 36;
  const shade = new T.Color(dark), lit = new T.Color(light);
  for (let level = 0; level < profile.length; level++) {
    const [y, radius, x, z] = profile[level];
    for (let i = 0; i <= n; i++) {
      const theta = i / n * Math.PI * 2;
      positions.push(x + radius * Math.cos(theta), y + 0.036 * Math.sin(theta) * (radius / 0.66), z + radius * 0.86 * Math.sin(theta));
      const color = shade.clone().lerp(lit, 0.2 + level / 21 + Math.sin(theta + 0.7) * 0.12);
      colors.push(color.r, color.g, color.b);
      if (level && i) {
        const j = level * (n + 1) + i;
        indices.push(j - n - 2, j - 1, j, j - n - 2, j, j - n - 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
