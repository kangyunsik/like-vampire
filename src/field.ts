import { FIELD_X, FIELD_Z } from './data';

type GroundPoint = { x: number; z: number };

/** The canonical coordinate on a repeating axis. Local movement may stay unwrapped. */
export function wrapAxis(value: number, half: number) {
  return value >= -half && value < half ? value : value - Math.floor((value + half) / (2 * half)) * 2 * half;
}

export function nearestImage(value: number, origin: number, half: number) {
  const offset = value - origin;
  return offset >= -half && offset < half ? value : origin + wrapAxis(offset, half);
}

export function fieldDistanceSquared(a: GroundPoint, b: GroundPoint) {
  return wrapAxis(a.x - b.x, FIELD_X) ** 2 + wrapAxis(a.z - b.z, FIELD_Z) ** 2;
}
