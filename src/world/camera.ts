import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Point } from '../combat';
import { FIELD_X, FIELD_Z, type Obstacle } from '../data';
import { nearestImage } from '../field';

const MENU_AIM = new Vector3(-3.55, 2.25, -.86);
const MENU_EYE = new Vector3(-3.55, 7.1, 10.7);
const CHASE = { pitch: MathUtils.degToRad(22), distance: 11.4 };
const OVERVIEW = { pitch: MathUtils.degToRad(66), distance: 24.5 };
const MIN_PITCH = MathUtils.degToRad(5), MAX_PITCH = MathUtils.degToRad(79);
const wrap = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

export class OrbitCamera {
  readonly view = new PerspectiveCamera(52, 1, .12, 158);
  private pivot = new Vector3();
  private aim = new Vector3();
  private boom = new Vector3();
  private viewHeading = Math.PI;
  private pitch = CHASE.pitch;
  private distance = CHASE.distance;
  private safeDistance = CHASE.distance;
  private blockerColumn = Infinity;
  private blockerRow = Infinity;
  private blockers: { x: number; z: number; radius: number; top: number }[];
  private nearbyBlockers: typeof this.blockers = [];

  constructor(private heightAt: (x: number, z: number) => number, obstacles: readonly Obstacle[]) {
    this.blockers = obstacles.flatMap(({ x, z, canopy }) => canopy
      ? [{ x, z, radius: canopy.radius + .24, top: heightAt(x, z) + canopy.height }]
      : []);
    this.view.position.copy(MENU_EYE);
    this.view.lookAt(MENU_AIM);
    this.view.updateMatrixWorld();
  }

  resize(aspect: number) {
    this.view.aspect = aspect;
    this.view.updateProjectionMatrix();
  }

  get heading() { return this.viewHeading; }

  orbit(dx: number, dy: number) {
    this.pitch = MathUtils.clamp(this.pitch + dy * .006, MIN_PITCH, MAX_PITCH);
    this.viewHeading = wrap(this.viewHeading - dx * .008);
    return this.viewHeading;
  }

  zoom(delta: number) {
    this.distance = MathUtils.clamp(this.distance * Math.exp(MathUtils.clamp(delta, -550, 550) * .0017), 7.2, 29);
  }

  preset(wide: boolean) {
    const { pitch, distance } = wide ? OVERVIEW : CHASE;
    this.pitch = pitch;
    this.distance = distance;
  }

  movement(heading: number, strafe: number, forward: number): Point {
    const sin = Math.sin(heading), cos = Math.cos(heading);
    return { x: forward * sin - strafe * cos, z: forward * cos + strafe * sin };
  }

  center(heading: number) { this.viewHeading = wrap(heading); }

  snap(player: Point & { heading: number }) {
    this.center(player.heading);
    this.pivot.set(player.x, this.heightAt(player.x, player.z) + 1.55, player.z);
    this.safeDistance = this.distance;
  }

  update(player: (Point & { heading: number }) | null, dt: number, followHeading = true) {
    const blend = 1 - Math.exp(-dt * 12);
    if (player) {
      const { x, z } = player;
      this.aim.set(x, this.heightAt(x, z) + 1.55, z);
      this.pivot.lerp(this.aim, blend);
      if (followHeading) {
        this.viewHeading = wrap(this.viewHeading + wrap(player.heading - this.viewHeading) * (1 - Math.exp(-dt * 7)));
      }
      const sin = Math.sin(this.viewHeading), cos = Math.cos(this.viewHeading);
      const setBoom = (pitch: number) => this.boom.set(-sin * Math.cos(pitch), Math.sin(pitch), -cos * Math.cos(pitch));
      setBoom(this.pitch);
      let clear = this.clearDistance();
      if (clear < Math.min(5.5, this.distance * .65)) {
        // Raise the view rather than placing the camera inside a tree right behind Lumi.
        setBoom(Math.min(MAX_PITCH, this.pitch + .59));
        const overhead = this.clearDistance();
        if (overhead > clear) clear = overhead;
        else setBoom(this.pitch);
      }
      this.safeDistance = clear < this.safeDistance ? clear : MathUtils.lerp(this.safeDistance, clear, blend);
      this.view.position.copy(this.pivot).addScaledVector(this.boom, this.safeDistance);
      const lead = this.safeDistance * .10;
      this.aim.set(this.pivot.x + sin * lead, this.pivot.y + .18, this.pivot.z + cos * lead);
      this.view.lookAt(this.aim);
    } else {
      this.view.position.lerp(MENU_EYE, blend);
      this.view.lookAt(MENU_AIM);
    }
    this.view.updateMatrixWorld();
  }

  private clearDistance() {
    const { x, y, z } = this.pivot;
    const col = Math.floor(x / 24), row = Math.floor(z / 24);
    if (col !== this.blockerColumn || row !== this.blockerRow) {
      this.blockerColumn = col;
      this.blockerRow = row;
      this.nearbyBlockers = this.blockers.flatMap((b) => {
        const bx = nearestImage(b.x, x, FIELD_X), bz = nearestImage(b.z, z, FIELD_Z);
        return Math.abs(bx - x) <= 59 && Math.abs(bz - z) <= 59 ? [{ ...b, x: bx, z: bz }] : [];
      });
    }
    for (let d = .95; d <= this.distance; d += .45) {
      const px = x + this.boom.x * d, py = y + this.boom.y * d, pz = z + this.boom.z * d;
      if (py < this.heightAt(px, pz) + .42 || this.nearbyBlockers.some((b) =>
        py < b.top + .30 && (px - b.x) ** 2 + (pz - b.z) ** 2 < b.radius ** 2)) {
        return Math.max(1.5, d - .55);
      }
    }
    return this.distance;
  }
}
