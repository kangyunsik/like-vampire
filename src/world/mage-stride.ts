import * as T from 'three';
import { heightAt } from './terrain';

export type Footfall = 'left' | 'right';
const { clamp, lerp, smoothstep } = T.MathUtils;
const tau = Math.PI * 2;
const wrap = (phase: number) => phase - Math.floor(phase);

export function makeMageStride(root: T.Group, bone: (name: string) => T.Bone) {
  const hips = bone('Hips');
  const legs = (['left', 'right'] as const).map((side, index) => {
    const name = index ? 'Right' : 'Left', sign = index ? -1 : 1;
    const top = bone(`${name}UpLeg`), knee = bone(`${name}Leg`), ankle = bone(`${name}Foot`), toe = bone(`${name}ToeBase`);
    const rest = root.worldToLocal(ankle.getWorldPosition(new T.Vector3()));
    const toeAt = root.worldToLocal(toe.getWorldPosition(new T.Vector3())).sub(rest);
    const direction = new T.Vector3(sign * .19, -.67, .72).normalize();
    const align = new T.Quaternion().setFromUnitVectors(toeAt.clone().normalize(), direction);
    const boot = ankle.getWorldQuaternion(new T.Quaternion()).premultiply(root.getWorldQuaternion(new T.Quaternion()).invert());
    boot.premultiply(align);
    // Both imported rigs have different bind axes, heel heights and toe angles.
    const toeFloor = rest.y + toeAt.y;
    toeAt.applyQuaternion(align);
    return { side, sign, top, knee, ankle, rest, toeAt, boot, height: toeFloor - toeAt.y };
  });
  const joints = [hips, ...legs.flatMap(({ top, knee, ankle }) => [top, knee, ankle])];
  const base = joints.map((joint) => joint.quaternion.clone()), hipPosition = hips.position.clone();
  const restHip = root.worldToLocal(hips.getWorldPosition(new T.Vector3()));
  const centerZ = (legs[0].rest.z + legs[1].rest.z) * .5;
  let phase = .14, weight = 0, side = 0, forward = 1, pace = 0, cycle = 2.27, stance = .55;
  const rootTurn = new T.Quaternion(), inverse = new T.Quaternion(), original = new T.Quaternion();
  const turn = new T.Quaternion(), current = new T.Quaternion(), shoe = new T.Quaternion();
  const position = new T.Vector3(), origin = new T.Vector3(), local = new T.Vector3(), goal = new T.Vector3(), foot = new T.Vector3();
  const hip = new T.Vector3(), joint = new T.Vector3(), aim = new T.Vector3(), pole = new T.Vector3(), axis = new T.Vector3();
  const angle = new T.Euler(0, 0, 0, 'YXZ');

  function orient(to: T.Bone, child: T.Bone, direction: T.Vector3) {
    to.getWorldQuaternion(current);
    axis.copy(child.position).normalize().applyQuaternion(current);
    turn.setFromUnitVectors(axis, direction);
    to.parent!.getWorldQuaternion(inverse).invert();
    to.quaternion.copy(turn.multiply(current).premultiply(inverse));
  }

  return {
    get weight() { return weight; },
    get phase() { return phase; },
    get side() { return side * weight; },
    get forward() { return forward * weight; },
    restore() {
      joints.forEach((joint, i) => joint.quaternion.copy(base[i]));
      hips.position.copy(hipPosition);
    },
    advance(dt: number, x: number, z: number): Footfall | undefined {
      if (dt <= 0) return;
      const speed = Math.hypot(x, z), moving = speed > .13;
      const blend = 1 - Math.exp(-dt * 15);
      weight = lerp(weight, Math.min(1, speed / 1.65), blend);
      pace = lerp(pace, speed, blend);
      if (!moving) {
        if (weight < .015) phase = .14;
        return;
      }
      const desiredX = x / speed, desiredZ = z / speed;
      // Direction changes cross-fade instead of mirroring a planted foot in one frame.
      const steering = weight < .20 ? 1 : blend;
      side = lerp(side, desiredX, steering);
      forward = lerp(forward, desiredZ, steering);
      const direct = Math.max(0, forward);
      cycle = lerp(1.66, lerp(2.13, 2.62, direct), clamp(pace / 5.35, 0, 1));
      stance = lerp(.59, .50, direct);
      const next = phase + speed * dt / cycle;
      const landed = next >= 1 ? 'left' : phase < .5 && next >= .5 ? 'right' : undefined;
      phase = wrap(next);
      return landed;
    },
    apply() {
      joints.forEach((joint, i) => base[i].copy(joint.quaternion));
      hipPosition.copy(hips.position);
      if (weight < .008) return;
      root.getWorldQuaternion(rootTurn);
      root.getWorldPosition(position);
      const ground = heightAt(position.x, position.z);
      const strafe = Math.abs(side), backward = Math.max(0, -forward);
      const bounce = Math.sin(phase * tau * 2 - .75) * (.038 + .020 * Math.max(0, forward));
      local.copy(restHip);
      local.x += side * .085 + Math.cos(phase * tau) * (.038 + strafe * .033);
      local.z += forward * .068;
      local.y += bounce - (.19 + strafe * .096 + backward * .021);
      hips.parent!.worldToLocal(root.localToWorld(local));
      hips.position.lerp(local, weight);

      for (const [i, leg] of legs.entries()) {
        const p = wrap(phase + i * .5), planted = p < stance;
        const swing = planted ? 0 : (p - stance) / (1 - stance);
        const half = cycle * stance * .5;
        // In contact, the boot travels backward relative to the body at exactly
        // ground speed; the return stroke uses a softer, lifted trajectory.
        const progress = planted ? p / stance : smoothstep(swing, 0, 1);
        const reach = half * (planted ? 1 - 2 * progress : 2 * progress - 1);
        const lift = Math.sin(Math.PI * swing) ** 1.36 * (.39 - strafe * .14 - backward * .11);
        const width = lerp(Math.max(.21, Math.abs(leg.rest.x)), .47, strafe);
        const x = leg.sign * Math.max(.095, width + leg.sign * side * reach);
        const z = lerp(leg.rest.z, centerZ, .77) + forward * (reach + .05);
        const toesUp = -.19 * forward, pushOff = .43 * forward;
        const roll = planted ? toesUp * (1 - smoothstep(progress, 0, .22)) + pushOff * smoothstep(progress, .64, 1)
          : lerp(pushOff, toesUp, swing) + forward * .12 * Math.sin(swing * Math.PI);
        turn.setFromEuler(angle.set(roll, side * .12, -side * .13 * Math.sin(swing * Math.PI)));
        shoe.copy(leg.boot).premultiply(turn).premultiply(rootTurn);
        const toeDelta = local.copy(leg.toeAt).applyQuaternion(turn).y - leg.toeAt.y;
        goal.set(x, leg.height + lift + Math.max(-toeDelta, -roll * .12), z);
        root.localToWorld(goal);
        goal.y += clamp(heightAt(goal.x, goal.z) - ground, -.10, .10);

        leg.ankle.getWorldPosition(foot);
        leg.ankle.getWorldQuaternion(original);
        leg.top.getWorldPosition(origin);
        leg.knee.getWorldPosition(joint);
        const upper = origin.distanceTo(joint), lower = joint.distanceTo(foot);
        aim.copy(foot).lerp(goal, weight).sub(origin);
        const length = clamp(aim.length(), Math.abs(upper - lower) + .002, (upper + lower) * .996);
        aim.normalize();
        foot.copy(origin).addScaledVector(aim, length);
        pole.set(leg.sign * .22 + side * .16, 0, 1).applyQuaternion(rootTurn);
        pole.addScaledVector(aim, -pole.dot(aim)).normalize();
        const along = (upper * upper - lower * lower + length * length) / (2 * length);
        hip.copy(origin).addScaledVector(aim, along).addScaledVector(pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
        orient(leg.top, leg.knee, local.subVectors(hip, origin).normalize());
        leg.knee.getWorldPosition(joint);
        orient(leg.knee, leg.ankle, local.subVectors(foot, joint).normalize());
        leg.ankle.parent!.getWorldQuaternion(inverse).invert();
        leg.ankle.quaternion.copy(original.slerp(shoe, weight).premultiply(inverse));
      }
    },
  };
}
