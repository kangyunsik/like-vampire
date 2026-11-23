import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batch } from './art';

export type TerrainProp = 'fir' | 'boulder';
export type PropSite = {
  x: number; y: number; z: number;
  width: number; height: number; depth: number;
  yaw: number; lean: number; tone: number;
};
export type TerrainSector = { x: number; z: number; root: T.Group };

const styles = {
  fir: { file: 'snow-fir', width: 2.15, height: 3.64 },
  boulder: { file: 'snow-boulder', width: 2.64, height: .75 },
} as const;
const requests = new Map<TerrainProp, Promise<T.Group>>();
export const terrainCell = (coordinate: number) => Math.floor((coordinate + 16) / 32) * 32;

function groundPivot(root: T.Group, bounds: T.Box3, tree: boolean) {
  if (!tree) return bounds.getCenter(new T.Vector3());
  const foot = new T.Box3(), point = new T.Vector3();
  const threshold = T.MathUtils.lerp(bounds.min.y, bounds.max.y, .11);
  root.traverse((object) => {
    const mesh = object as T.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (point.y <= threshold) foot.expandByPoint(point);
    }
  });
  return (foot.isEmpty() ? bounds : foot).getCenter(point);
}

function loadTerrainProp(kind: TerrainProp) {
  const cached = requests.get(kind);
  if (cached) return cached;
  const style = styles[kind];
  const request = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}art/${style.file}.glb`).then(({ scene }) => {
    const root = new T.Group();
    root.add(scene);
    const bounds = new T.Box3().setFromObject(root, true);
    const size = bounds.getSize(new T.Vector3());
    if (Math.min(size.x, size.y, size.z) <= 0 || !Number.isFinite(size.lengthSq())) throw new Error(`Invalid ${kind} bounds`);
    const pivot = groundPivot(root, bounds, kind === 'fir');
    const horizontal = style.width / Math.max(size.x, size.z), vertical = style.height / size.y;
    root.scale.set(horizontal, vertical, horizontal);
    root.position.set(-pivot.x * horizontal, -bounds.min.y * vertical, -pivot.z * horizontal);
    const model = batch(root);
    const pieces = model.children as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>[];
    if (!pieces.length || pieces.some(({ material }) => !material.map)) throw new Error(`Missing textured ${kind} mesh`);
    for (const { geometry } of pieces) geometry.name = `meshy-${style.file}`;
    return model;
  }).catch((error: unknown) => {
    requests.delete(kind);
    throw error;
  });
  requests.set(kind, request);
  return request;
}

export async function terrainPropSectors(kind: TerrainProp, sites: readonly PropSite[]): Promise<TerrainSector[]> {
  if (!sites.length) return [];
  const model = await loadTerrainProp(kind);
  const cells = new Map<string, { x: number; z: number; sites: PropSite[] }>();
  for (const site of sites) {
    const x = terrainCell(site.x), z = terrainCell(site.z), key = `${x}/${z}`;
    const cell = cells.get(key) ?? { x, z, sites: [] };
    cell.sites.push(site);
    cells.set(key, cell);
  }
  const transform = new T.Object3D(), tint = new T.Color();
  const pieces = model.children as T.Mesh<T.BufferGeometry, T.Material>[];
  return [...cells.values()].map(({ x, z, sites }) => {
    const root = new T.Group();
    root.name = `terrain-${kind}-sector`;
    for (const { geometry, material } of pieces) {
      const instances = new T.InstancedMesh(geometry, material, sites.length);
      instances.name = geometry.name;
      for (const [i, site] of sites.entries()) {
        transform.position.set(site.x, site.y, site.z);
        transform.rotation.set(0, site.yaw, site.lean, 'YXZ');
        transform.scale.set(site.width, site.height, site.depth);
        transform.updateMatrix();
        instances.setMatrixAt(i, transform.matrix);
        instances.setColorAt(i, tint.setScalar(site.tone));
      }
      instances.instanceMatrix.needsUpdate = true;
      if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
      instances.computeBoundingSphere();
      root.add(instances);
    }
    return { x, z, root };
  });
}
