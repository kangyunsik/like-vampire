import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { batch } from './art';

let puff: Promise<T.Group> | undefined;

export function loadPuffSlime() {
  return puff ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}art/puff-slime.glb`).then(({ scene }) => {
    const root = new T.Group();
    root.add(scene);
    const bounds = new T.Box3().setFromObject(root, true);
    const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
    if (Math.min(size.x, size.y, size.z) <= 0 || !Number.isFinite(size.lengthSq())) throw new Error('Invalid Puff bounds');

    // Match the original mob footprint and keep its pivot on the ground while it hops.
    const scale = Math.min(1.20 / size.x, 1.07 / size.y, 1.20 / size.z);
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const model = batch(root);
    const pieces = model.children as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>[];
    if (!pieces.length || pieces.some((piece) => !piece.material.map)) throw new Error('Puff is missing its textured mesh');
    for (const { geometry } of pieces) geometry.name = 'meshy-puff-slime';
    return model;
  }).catch((error: unknown) => {
    puff = undefined;
    throw error;
  });
}
