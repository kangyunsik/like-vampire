import * as T from 'three';
import { CAST_TIMES, STAFF_RELEASE_PHASE, type Spell } from '../data';

// Wrist offset from the shoulder, then staff pitch and roll. In this rig +Z is forward.
type Stroke = readonly [phase: number, x: number, y: number, z: number, pitch: number, roll: number];
const carry: Stroke = [0, -.265, -.43, .25, -.10, .23];
const rest: Stroke = [1, -.265, -.43, .25, -.10, .23];
const flick: readonly Stroke[] = [
  carry, [.12, -.34, -.40, .155, -.34, .31], [STAFF_RELEASE_PHASE, -.26, -.28, .51, .92, .12],
  [.58, -.18, -.43, .40, .47, -.06], rest,
];
const sweep: readonly Stroke[] = [
  carry, [.14, -.37, -.39, .16, -.32, .40], [.34, -.37, -.25, .49, .54, -.20],
  [.61, -.29, -.39, .43, .31, -.28], rest,
];
const high: readonly Stroke[] = [
  carry, [.15, -.37, -.15, .21, -.46, .32], [.37, -.34, -.17, .51, 1.05, .17],
  [.62, -.27, -.43, .41, .78, .03], rest,
];
const fan: readonly Stroke[] = [
  carry, [.11, -.48, -.23, .12, -.28, .64], [STAFF_RELEASE_PHASE, -.36, -.19, .56, .72, .27],
  [.48, -.09, -.31, .59, .59, -.56], [.70, -.15, -.39, .38, .21, -.35], rest,
];
const jab: readonly Stroke[] = [
  carry, [.09, -.29, -.37, .11, -.37, .19], [STAFF_RELEASE_PHASE, -.22, -.23, .62, 1.26, .10],
  [.43, -.31, -.18, .42, .98, .16], [.67, -.26, -.36, .35, .46, -.05], rest,
];
const arc: readonly Stroke[] = [
  carry, [.15, -.35, -.07, .21, -.43, .29], [STAFF_RELEASE_PHASE, -.31, -.09, .55, 1.03, .12],
  [.56, -.24, -.29, .51, .78, -.24], [.74, -.30, -.35, .31, .39, -.15], rest,
];
const highCasts = new Set<Spell>(['blizzard', 'comet', 'meteor', 'whiteout', 'iceBloom', 'winterMoon', 'glacierWall', 'auroraStrike']);
const wideCasts = new Set<Spell>(['nova', 'barrier', 'fireBarrier', 'absoluteZero', 'glacialCollapse', 'combustion', 'supernova', 'infernoHeart', 'cinderVortex']);
const upBone = new T.Vector3(0, 1, 0), acrossPalm = new T.Vector3(1, 0, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);

type CastRig = {
  grip?: readonly [number, number, number];
  spellcast?: T.AnimationClip;
};
type Gait = { weight: number; phase: number; side: number; forward: number };

export function makeLumiCast(
  actor: T.Group, bone: (name: string) => T.Bone, staff: T.Group, staffScale: number, rig: CastRig = {},
) {
  const upper = bone('RightArm'), lower = bone('RightForeArm'), palm = bone('RightHand');
  const offUpper = bone('LeftArm'), offLower = bone('LeftForeArm'), offPalm = bone('LeftHand'), chest = bone('Spine2');
  const scale = palm.getWorldScale(new T.Vector3()).x;
  palm.add(staff);
  staff.position.set(...(rig.grip ?? [.4, 6.9, 1.5]));
  staff.quaternion.setFromAxisAngle(acrossPalm, Math.PI / 2);
  staff.scale.setScalar(staffScale / scale);

  const head = bone('Head');
  const posed = [upper, lower, palm, offUpper, offLower, chest, head];
  const spellcast = rig.spellcast;
  if (spellcast) posed.push(bone('LeftShoulder'), bone('RightShoulder'), bone('Neck'));
  const base = new Map(posed.map((joint) => [joint, joint.quaternion.clone()]));
  const authored = spellcast ? posed.flatMap((joint) => {
    // Keep the authored upper-body gesture, without baking its crouch or root motion into gameplay.
    if (joint === palm) return [];
    const track = spellcast.tracks.find(({ name }) => name === `${joint.name}.quaternion`);
    return track ? [{ joint, sample: track.InterpolantFactoryMethodLinear(new Float32Array(4)) }] : [];
  }) : [];
  const actorRotation = new T.Quaternion(), parentInverse = new T.Quaternion();
  const desired = new T.Quaternion(), current = new T.Quaternion(), turn = new T.Quaternion(), gesture = new T.Quaternion();
  const actorScale = new T.Vector3(), axis = new T.Vector3(), pole = new T.Vector3();
  const shoulder = new T.Vector3(), elbow = new T.Vector3(), wrist = new T.Vector3(), aim = new T.Vector3(), solved = new T.Vector3();
  const flex = new T.Vector3(), goal = new T.Vector3(), shaft = new T.Vector3(), palmForward = new T.Vector3(), palmSide = new T.Vector3();
  const holdOffset = new T.Vector3(), offOffset = new T.Vector3(), basis = new T.Matrix4(), angles = new T.Euler();

  function orient(joint: T.Bone, direction: T.Vector3) {
    joint.getWorldQuaternion(current);
    axis.copy(upBone).applyQuaternion(current);
    turn.setFromUnitVectors(axis, direction);
    joint.parent!.getWorldQuaternion(parentInverse).invert();
    joint.quaternion.copy(turn.multiply(current).premultiply(parentInverse));
  }

  function bendArm(top: T.Bone, forearm: T.Bone, hand: T.Bone, offset: T.Vector3, side: number, blend: number) {
    top.getWorldPosition(shoulder);
    forearm.getWorldPosition(elbow);
    hand.getWorldPosition(wrist);
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    goal.copy(offset).multiplyScalar(actorScale.x).applyQuaternion(actorRotation).add(shoulder);
    aim.copy(wrist).lerp(goal, blend).sub(shoulder);
    const distance = T.MathUtils.clamp(aim.length(), Math.abs(a - b) + .001, (a + b) * .975);
    aim.normalize();
    solved.copy(shoulder).addScaledVector(aim, distance);
    // Keep the elbow on the outside and below the hand, instead of locking the arm straight.
    pole.set(side * .67, -.91, -.10).normalize().applyQuaternion(actorRotation);
    pole.addScaledVector(aim, -pole.dot(aim)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    elbow.copy(shoulder).addScaledVector(aim, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
    orient(top, flex.subVectors(elbow, shoulder).normalize());
    forearm.getWorldPosition(elbow);
    orient(forearm, flex.subVectors(solved, elbow).normalize());
  }

  function lean(joint: T.Bone, x: number, y: number, z: number) {
    joint.parent!.getWorldQuaternion(parentInverse).invert().multiply(actorRotation);
    turn.copy(parentInverse).invert();
    desired.setFromEuler(angles.set(x, y, z, 'YXZ')).premultiply(parentInverse).multiply(turn);
    joint.quaternion.premultiply(desired);
  }

  return {
    restore() { for (const [joint, rotation] of base) joint.quaternion.copy(rotation); },
    capture() { for (const [joint, rotation] of base) rotation.copy(joint.quaternion); },
    apply(time: number, casting: number, spell: Spell, aimSide: number, gait: Gait, showcase = false, hurt = false) {
      const progress = casting > 0 && spell !== 'blink' ? 1 - T.MathUtils.clamp(casting / CAST_TIMES[spell], 0, 1) : 0;
      const cone = spell === 'emberFan' || spell === 'frostGale';
      const immediate = cone || spell === 'fireBlast' || spell === 'chainLightning';
      // Hitscan spells snap through anticipation early and spend more time recovering.
      // Projectiles keep the authored release fraction used by the simulation.
      const phase = !immediate ? progress : progress < .14 ? progress * STAFF_RELEASE_PHASE / .14
        : STAFF_RELEASE_PHASE + (progress - .14) * (1 - STAFF_RELEASE_PHASE) / .86;
      const broad = cone || wideCasts.has(spell);
      const keys = cone ? fan : spell === 'fireBlast' ? jab : spell === 'chainLightning' ? arc : highCasts.has(spell) ? high : broad ? sweep : flick;
      let upperKey = 1;
      while (upperKey < keys.length - 1 && phase > keys[upperKey][0]) upperKey++;
      const a = keys[upperKey - 1], b = keys[upperKey];
      const t = smooth((phase - a[0]) / (b[0] - a[0]));
      const envelope = smooth(Math.min(1, phase * 4.6, (1 - phase) * 3.4));
      const sway = Math.sin(gait.phase * Math.PI * 2) * gait.weight * (1 - envelope);
      const steer = T.MathUtils.clamp(aimSide, -1, 1) * envelope;
      const breath = showcase ? Math.sin(time * 2.35) : 0;
      const flourish = showcase ? T.MathUtils.smoothstep(Math.sin(time * .98 - .55), .18, .91) : 0;
      const pitch = T.MathUtils.lerp(a[4], b[4], t) - sway * .070 + flourish * .44 + breath * .045;
      const roll = T.MathUtils.lerp(a[5], b[5], t) - steer * .18 + sway * .045 - flourish * .25;
      holdOffset.set(T.MathUtils.lerp(a[1], b[1], t) + steer * .105,
        T.MathUtils.lerp(a[2], b[2], t) + flourish * .18 + breath * .029,
        T.MathUtils.lerp(a[3], b[3], t) - Math.abs(steer) * .046 + flourish * .13);

      actor.getWorldQuaternion(actorRotation);
      actor.getWorldScale(actorScale);
      const clipBlend = authored.length ? envelope * (immediate ? .35 : .67 - gait.weight * .15) : 0;
      if (spellcast && clipBlend > 0) {
        const release = .34;
        const sampleTime = phase < STAFF_RELEASE_PHASE
          ? phase / STAFF_RELEASE_PHASE * release
          : release + (phase - STAFF_RELEASE_PHASE) / (1 - STAFF_RELEASE_PHASE) * (1 - release);
        for (const { joint, sample } of authored) {
          joint.quaternion.slerp(gesture.fromArray(sample.evaluate(sampleTime * spellcast.duration)), clipBlend);
        }
      }
      const recoil = immediate ? Math.sin(Math.PI * T.MathUtils.smoothstep(phase, .25, .65)) : 0;
      lean(chest, gait.forward * .10 + envelope * .085 - recoil * .095, sway * .06 + envelope * .11 + steer * .20,
        -gait.side * .20 + (hurt ? -.072 : 0) - (cone ? .13 : .040) * envelope);
      lean(head, -gait.forward * .06 - envelope * .043, steer * .21, gait.side * .095);
      if (showcase) {
        chest.rotateZ(breath * .027 - flourish * .050);
        chest.rotateY(flourish * .11 + Math.sin(time * .95) * .056);
        head.rotateY(-.19 * flourish + .09 * Math.sin(time * .98 - 1));
        head.rotateX(.11 * flourish - breath * .038);
      }
      bendArm(upper, lower, palm, holdOffset, -1, .82 + .18 * envelope - .54 * clipBlend);
      if (envelope > .001) {
        const support = broad || spell === 'chainLightning';
        offOffset.set(support ? .49 - steer * .06 : .31, support ? -.32 + recoil * .13 : -.43, support ? .36 : .10 + recoil * .11);
        bendArm(offUpper, offLower, offPalm, offOffset, 1, envelope * (support ? .86 : .40) * (1 - clipBlend));
      } else if (Math.abs(gait.side) > .05) {
        offOffset.set(.36 + Math.abs(gait.side) * .16, -.47 + Math.abs(sway) * .06, .08 - sway * .10);
        bendArm(offUpper, offLower, offPalm, offOffset, 1, Math.abs(gait.side) * .46);
      } else if (flourish > .001) {
        offOffset.set(.35 + .10 * flourish, -.45 + .22 * flourish, .11 + .20 * flourish);
        bendArm(offUpper, offLower, offPalm, offOffset, 1, flourish * .78);
      }

      // The shaft is attached across the palm. Rotate the wrist to follow the stroke,
      // with the palm still pointing along the forearm instead of sliding off the staff.
      shaft.copy(upBone).applyEuler(angles.set(pitch, 0, roll)).applyQuaternion(actorRotation);
      palm.getWorldPosition(wrist);
      lower.getWorldPosition(elbow);
      palmForward.subVectors(wrist, elbow).normalize();
      palmForward.addScaledVector(shaft, -palmForward.dot(shaft));
      if (palmForward.lengthSq() < .01) {
        palmForward.set(-.2, 0, 1).applyQuaternion(actorRotation);
        palmForward.addScaledVector(shaft, -palmForward.dot(shaft));
      }
      palmForward.normalize();
      palmSide.crossVectors(palmForward, shaft).normalize();
      desired.setFromRotationMatrix(basis.makeBasis(palmSide, palmForward, shaft));
      palm.parent!.getWorldQuaternion(parentInverse).invert();
      palm.quaternion.copy(desired.premultiply(parentInverse));
      return envelope;
    },
  };
}
