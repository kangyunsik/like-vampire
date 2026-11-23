import { expect, test } from '@playwright/test';
import * as T from 'three';
import { makeMage } from '../src/world/actors';
import { ALL_SPELLS } from '../src/data';

test('the redesigned mages have wide witch hats, animated loose hair and independently drawn eyes', () => {
  const mage = makeMage();
  expect(mage.root.name).toBe('lumi');
  const head = mage.root.getObjectByName('lumi-head')!;
  expect(head.getObjectByName('lumi-witch-hat')).toBeDefined();
  expect(head.getObjectByName('lumi-hair-ornament')).toBeDefined();
  expect(head.getObjectByName('lumi-brim-lace')).toBeDefined();
  expect(makeMage('fire').root.getObjectByName('lumi-hair-ornament')).toBeDefined();
  expect(mage.root.getObjectByName('lumi-staff-orbit')).toBeDefined();
  for (const side of ['left', 'right']) {
    const lock = head.getObjectByName(`lumi-hair-lock-${side}`)!;
    expect(lock).toBeInstanceOf(T.Group);
    expect(head.getObjectByName(`lumi-eye-${side}`)).toBeDefined();
    expect(head.getObjectByName(`lumi-crystal-earring-${side}`)).toBeDefined();
  }
  const tail = head.getObjectByName('lumi-hair-lock-left')!;
  mage.animate(0, false, 0);
  const idle = tail.rotation.x;
  mage.animate(.25, true, 0);
  expect(tail.rotation.x).not.toBe(idle);
});

test('the new model stays finite throughout movement and every spell animation', () => {
  const mage = makeMage();
  const poses = ALL_SPELLS.map(({ id }) => id);
  for (const pose of poses) {
    for (const time of [0, .08, .25, 1, 4.5]) {
      mage.animate(time, true, .18, pose, true);
      mage.root.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(mage.root);
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(bounds.getSize(new T.Vector3()).y).toBeGreaterThan(2);
      expect(bounds.getSize(new T.Vector3()).y).toBeLessThan(5);
      mage.root.traverse((object) => {
        expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      });
    }
  }
});

test('eyes and blink lids stay on the same curved surface for both mages', () => {
  for (const mageClass of ['frost', 'fire'] as const) {
    const mage = makeMage(mageClass);
    for (const side of ['left', 'right']) {
      const eye = mage.root.getObjectByName(`lumi-eye-${side}`)!;
      const open = eye.getObjectByName('lumi-open-eye') as T.Mesh;
      const lid = eye.getObjectByName('lumi-blink-lid') as T.Mesh;
      expect(open.geometry).toBe(lid.geometry);
      const bounds = new T.Box3().setFromBufferAttribute(open.geometry.attributes.position as T.BufferAttribute);
      expect(bounds.max.z - bounds.min.z).toBeGreaterThan(.05);
      mage.animate(3.55, false, 0);
      expect(open.visible).toBe(false);
      expect(lid.visible).toBe(true);
      mage.animate(3.9, false, 0);
      expect(open.visible).toBe(true);
      expect(lid.visible).toBe(false);
    }
  }
});

test('Lumi’s eye patches are smaller and spaced farther apart', () => {
  const mage = makeMage();
  const patch = (side: string) => {
    const group = mage.root.getObjectByName(`lumi-eye-${side}`)!;
    const open = group.getObjectByName('lumi-open-eye') as T.Mesh;
    return new T.Box3().setFromBufferAttribute(open.geometry.attributes.position as T.BufferAttribute);
  };
  const left = patch('left'), right = patch('right');
  expect(right.max.x - right.min.x).toBeLessThan(.36);
  expect(right.min.x - left.max.x).toBeGreaterThan(.09);
});

test('Lumi has a short, tapered jaw and a sculpted nose in the 3D mesh', () => {
  const mage = makeMage();
  const face = mage.root.getObjectByName('lumi-face') as T.Mesh;
  const vertices = face.geometry.attributes.position;
  const sectionAt = (height: number) => {
    let width = 0, front = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      if (Math.abs(vertices.getY(i) - height) > .012) continue;
      width = Math.max(width, Math.abs(vertices.getX(i)));
      front = Math.max(front, vertices.getZ(i));
    }
    return { width, front };
  };
  const cheeks = sectionAt(.46).width;
  expect(new T.Box3().setFromBufferAttribute(vertices as T.BufferAttribute).min.y).toBeGreaterThan(0);
  expect(sectionAt(.19).width).toBeGreaterThan(cheeks * .61);
  expect(sectionAt(.19).width).toBeLessThan(cheeks * .71);
  expect(sectionAt(.06).width).toBeLessThan(cheeks * .40);
  expect(sectionAt(.35).front).toBeGreaterThan(sectionAt(.62).front + .035);
  expect(mage.root.getObjectByName('lumi-ear-left')).toBeDefined();
  expect(mage.root.getObjectByName('lumi-smile')).toBeDefined();
});
