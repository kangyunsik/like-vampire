import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CAST_TIMES, type MageClass, type Spell } from '../data';
import { makeMageStaff } from './actors';
import { makeLumiCast } from './lumi-cast';
import { makeMageStride } from './mage-stride';

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
  time: number; dt: number; side: number; forward: number; casting: number; castSide?: number; pose?: Spell; hurt?: boolean; menu?: boolean;
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
  const actions = clips.map((clip, i) => mixer.clipAction(clip).setEffectiveWeight(i === 0 ? 1 : 0).play());
  mixer.update(0);
  const stride = makeMageStride(root, bone);
  const staff = makeMageStaff(fire);
  const swing = makeLumiCast(actor, bone, staff.root, .64, fire
    ? { grip: [.7, 12, -2], spellcast: T.AnimationClip.findByName(asset.animations, 'Spellcast') ?? undefined }
    : {});

  const animate = ({ time, dt, side, forward, casting, castSide = 0, pose = 'bolt', hurt, menu }: MageFrame) => {
    const landed = stride.advance(dt, side, forward);
    const run = T.MathUtils.smoothstep(stride.forward, .24, .87);
    stride.restore();
    swing.restore();
    actions[0].setEffectiveWeight(1 - stride.weight);
    actions[1].setEffectiveWeight(stride.weight * (1 - run)).setEffectiveTimeScale(stride.forward < -.3 ? -.92 : 1.08);
    actions[2].setEffectiveWeight(stride.weight * run).setEffectiveTimeScale(1.03);
    mixer.update(dt);
    swing.capture();

    const phase = 1 - T.MathUtils.clamp(casting / CAST_TIMES[pose], 0, 1);
    const pulse = casting > 0 ? Math.sin(phase * Math.PI) : 0;
    root.position.y = pose === 'blink' ? pulse * .22 : 0;
    stride.apply();
    staff.animate(time, swing.apply(time, casting, pose, castSide, stride, Boolean(menu && !fire), hurt));
    return landed;
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
      return rig?.animate(frame);
    },
  };
}
