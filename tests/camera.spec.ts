import { expect, test } from '@playwright/test';
import { FIELD_X, FIELD_Z } from '../src/data';
import { heightAt, snowTone } from '../src/world/terrain';
import { Vector3 } from 'three';
import { OrbitCamera } from '../src/world/camera';

const flat = () => 0;

test('the camera has perspective and keeps behind the character as the character turns and moves', () => {
  const rig = new OrbitCamera(flat, []);
  const player = { x: 4, z: -3, heading: Math.PI };
  rig.resize(2.5);
  rig.snap(player);
  rig.update(player, .1);
  const camera = rig.view;
  expect(camera.isPerspectiveCamera).toBe(true);
  expect(camera.aspect).toBe(2.5);
  expect(camera.position.z).toBeGreaterThan(player.z + 8);
  const projection = (depth: number) => new Vector3(0, 1, -depth).applyMatrix4(camera.matrixWorld).project(camera).y;
  expect(projection(4)).toBeCloseTo(projection(8) * 2);

  player.heading = rig.orbit(Math.PI / .016, 0);
  expect(player.heading).toBeCloseTo(Math.PI / 2);
  player.x += 3;
  player.z += 2;
  rig.update(player, .8);
  expect(camera.position.x).toBeLessThan(player.x - 8);
  expect(camera.position.z).toBeCloseTo(player.z, 2);
  const forward = rig.movement(player.heading, 0, 1);
  const right = rig.movement(player.heading, 1, 0);
  expect(forward.x).toBeCloseTo(1);
  expect(forward.z).toBeCloseTo(0);
  expect(right.x).toBeCloseTo(0);
  expect(right.z).toBeCloseTo(1);
});

test('free look orbits in front of the character without turning them and can blend back behind', () => {
  const rig = new OrbitCamera(flat, []);
  const player = { x: 0, z: 0, heading: Math.PI };
  rig.snap(player);
  rig.orbit(Math.PI / .008, 0);
  rig.update(player, .1, false);
  expect(rig.view.position.z).toBeLessThan(-8);
  expect(player.heading).toBe(Math.PI);
  const frontHeading = rig.heading;
  rig.update(player, .3, false);
  expect(rig.heading).toBe(frontHeading);
  rig.update(player, .04, true);
  expect(Math.abs(rig.heading)).toBeGreaterThan(.05);
  expect(Math.abs(rig.heading)).toBeLessThan(2);
  rig.update(player, 1, true);
  expect(rig.view.position.z).toBeGreaterThan(8);
});

test('zoom, the tactical view and nearby obstacles adjust the camera without repositioning the character', () => {
  const rig = new OrbitCamera(flat, [{ x: 0, z: 3, radius: .7, canopy: { radius: 1, height: 10 } }]);
  const player = { x: 0, z: 0, heading: Math.PI };
  rig.snap(player);
  rig.update(player, .1);
  expect(rig.view.position.z).toBeLessThan(2);
  player.x = 6;
  rig.update(player, 1);
  const initialDepth = rig.view.position.z;
  expect(initialDepth).toBeGreaterThan(9);
  rig.zoom(-400);
  rig.update(player, .1);
  expect(rig.view.position.z).toBeLessThan(initialDepth - 2);
  rig.preset(true);
  rig.update(player, 1);
  expect(rig.view.position.y).toBeGreaterThan(20);
  expect(player).toEqual({ x: 6, z: 0, heading: Math.PI });
});
test('the terrain and camera remain continuous where alternate sides of the snowfield meet', () => {
  for (const [half, terrain] of [[FIELD_X, (distance: number) => heightAt(distance, 19)],
    [FIELD_Z, (distance: number) => heightAt(-32, distance)]] as const) {
    expect(terrain(half)).toBeCloseTo(terrain(-half), 8);
    expect(terrain(half + .08)).toBeCloseTo(terrain(-half + .08), 8);
    const before = (terrain(half) - terrain(half - .001)) / .001;
    const after = (terrain(half + .001) - terrain(half)) / .001;
    expect(Math.abs(before - after)).toBeLessThan(.01);
  }
  const camera = new OrbitCamera(heightAt, []);
  const edge = { x: FIELD_X - .1, z: 19, heading: Math.PI / 2 };
  camera.snap(edge);
  camera.update(edge, .1);
  const initial = camera.view.position.clone();
  camera.update({ ...edge, x: edge.x + .22 }, .04);
  expect(camera.view.position.distanceTo(initial)).toBeLessThan(.25);
});

test('wind-carved snow shading repeats cleanly in both texture axes', () => {
  for (const [u, v] of [[0, .286], [.714, 0], [-.123, .121], [.63, .94]]) {
    expect(snowTone(u + 1, v)).toBeCloseTo(snowTone(u, v), 9);
    expect(snowTone(u, v - 1)).toBeCloseTo(snowTone(u, v), 9);
  }
});
