import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CAST_TIMES, type MageClass, type Spell } from '../data';
import { makeMageStaff } from './actors';
import { makeLumiCast } from './lumi-cast';

const MODEL_SCALE = 1.84;
const MODELS = {
  frost: { path: 'art/lumi-meshy.glb', name: 'lumi-meshy', centerZ: .135 },
  fire: { path: 'art/red-hood-magician.glb', name: 'red-hood-magician', centerZ: .067 },
} as const;

const requests = new Map<MageClass, Promise<GLTF>>();
function loadMage(mageClass: MageClass) {
  const cached = requests.get(mageClass);
  if (cached) return cached;
  const request = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}${MODELS[mageClass].path}`);
  requests.set(mageClass, request);
  return request;
}

export type MageFrame = {
  time: number; dt: number; moving: boolean; forward: number; casting: number; castSide?: number; pose?: Spell; hurt?: boolean; menu?: boolean;
};

function makeRig(asset: GLTF, mageClass: MageClass, actor: T.Group) {
  const appearance = MODELS[mageClass], fire = mageClass === 'fire';
  const root = new T.Group();
  root.name = appearance.name;
  const model = clone(asset.scene) as T.Group;
  model.scale.setScalar(MODEL_SCALE);
  model.position.z = -appearance.centerZ * MODEL_SCALE;
  root.add(model);
  const mesh = model.getObjectByProperty('isSkinnedMesh', true) as T.SkinnedMesh<T.BufferGeometry, T.MeshStandardMaterial> | undefined;
  if (!mesh?.material.map) throw new Error(`${appearance.name} is missing its textured skinned mesh`);
  mesh.frustumCulled = false;
  mesh.castShadow = true;

  const bone = (name: string) => {
    const target = fire ? name === 'Spine2' ? 'Spine' : name === 'Neck' ? 'neck' : name : `mixamorig${name}`;
    const joint = mesh.skeleton.bones.find((candidate) => candidate.name === target);
    if (!joint) throw new Error(`${appearance.name} is missing its ${target} bone`);
    return joint;
  };
  const mixer = new T.AnimationMixer(model);
  const clips = ['Idle', 'Walking', 'Running'].map((name) => {
    const clip = T.AnimationClip.findByName(asset.animations, name);
    if (!clip) throw new Error(`${appearance.name} is missing its ${name} motion`);
    return clip;
  });
  const weights = [1, 0, 0];
  const actions = clips.map((clip, i) => mixer.clipAction(clip).setEffectiveWeight(weights[i]).play());
  const staff = makeMageStaff(fire);
  const swing = makeLumiCast(actor, bone, staff.root, .64, fire
    ? { grip: [.7, 12, -2], spellcast: T.AnimationClip.findByName(asset.animations, 'Spellcast') ?? undefined }
    : {});

  const animate = ({ time, dt, moving, forward, casting, castSide = 0, pose = 'bolt', hurt, menu }: MageFrame) => {
    const gait = !moving ? 0 : forward > .62 ? 2 : 1;
    const blend = 1 - Math.exp(-dt * 15);
    swing.restore();
    for (let i = 0; i < actions.length; i++) {
      weights[i] = T.MathUtils.lerp(weights[i], Number(i === gait), blend);
      actions[i].setEffectiveWeight(weights[i]);
    }
    actions[1].setEffectiveTimeScale(forward < -.5 ? -.95 : 1.17);
    actions[2].setEffectiveTimeScale(1.03);
    mixer.update(dt);
    swing.capture();

    const phase = 1 - T.MathUtils.clamp(casting / CAST_TIMES[pose], 0, 1);
    const pulse = casting > 0 ? Math.sin(phase * Math.PI) : 0;
    root.position.y = pose === 'blink' ? pulse * .22 : 0;
    root.rotation.z = hurt ? -.038 : 0;
    staff.animate(time, swing.apply(time, casting, pose, castSide, weights[2], Boolean(menu && !fire)));
  };
  return { root, animate };
}

export function makePlayableMage(mageClass: MageClass = 'frost') {
  const root = new T.Group();
  root.name = mageClass === 'fire' ? 'fire-mage-player' : 'lumi-player';
  root.userData.model = 'loading';
  let rig: ReturnType<typeof makeRig> | undefined;
  const ready = loadMage(mageClass).then((asset) => {
    rig = makeRig(asset, mageClass, root);
    root.add(rig.root);
    root.userData.model = 'meshy';
    return true;
  }).catch((error: unknown) => {
    root.userData.model = 'unavailable';
    requests.delete(mageClass);
    console.warn(`Frostfall: could not load the ${mageClass} model.`, error);
    return false;
  });
  return {
    root, ready,
    animate(frame: MageFrame) {
      rig?.animate(frame);
    },
  };
}
