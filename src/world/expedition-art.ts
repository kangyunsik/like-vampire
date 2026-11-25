import * as T from 'three';
import type { Combat } from '../combat';
import { QUESTS, SUPPLIES, SUPPLY_KINDS, type SupplyKind } from '../expedition';
import { crystalGeometry, oval, paint, part, ring, surface } from './art';
import { heightAt } from './terrain';

const accent = '#ffd786';
const glow = (color: string, opacity = 1) => new T.MeshBasicMaterial({
  color, opacity, transparent: opacity < 1, depthWrite: opacity === 1, toneMapped: false, side: T.DoubleSide,
});
const coat = surface('#405a91'), trim = surface('#e2b079'), face = surface('#f0c5ae'), leather = surface('#352a4c');
const cloak = new T.CylinderGeometry(.32, .64, 1.05, 8), staff = new T.CylinderGeometry(.047, .065, 1.92, 6);
const mark = glow(accent), floor = glow(accent, .78);
const lantern = surface('#ffcf74', .64);
const markerBar = new T.BoxGeometry(.12, .41, .115);
const markerDot = new T.BoxGeometry(.12, .12, .115);
let progressMark: T.SpriteMaterial | undefined;

function makeProgressMark() {
  return new T.SpriteMaterial({
    color: '#b7b7b7', transparent: true, depthWrite: false, toneMapped: false,
    map: paint(96, (ctx) => {
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(31, 27);
      ctx.bezierCurveTo(31, 9, 66, 8, 66, 27);
      ctx.bezierCurveTo(66, 43, 48, 43, 48, 56);
      ctx.lineTo(48, 59);
      ctx.moveTo(48, 77);
      ctx.lineTo(48, 79);
      ctx.lineWidth = 19;
      ctx.strokeStyle = '#292a32';
      ctx.stroke();
      ctx.lineWidth = 11;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }),
  });
}

function makeGuide(scene: T.Scene) {
  const root = new T.Group(), model = new T.Group(), beacon = new T.Group();
  root.name = 'quest-npc';
  root.add(model, beacon);
  scene.add(root);
  const level = ring(root, .88, .034, floor, 0, .18, 0);
  part(model, cloak, coat, 0, 1.22);
  oval(model, trim, 0, 1.57, 0, .38, .19, .35);
  oval(model, coat, 0, 1.94, -.03, .39, .43, .35);
  oval(model, face, 0, 1.92, .19, .25, .28, .16);
  for (const side of [-1, 1]) {
    oval(model, leather, side * .22, .36, .075, .17, .33, .23);
    oval(model, coat, side * .40, 1.21, .12, .16, .40, .17).rotation.z = side * .17;
    oval(model, face, side * .46, .99, .21, .115, .115, .12);
    oval(model, leather, side * .09, 1.95, .336, .029, .036, .015);
  }
  part(model, staff, leather, .68, 1.16, .26);
  part(model, crystalGeometry, lantern, .68, 2.15, .26).scale.set(.16, .32, .16);
  const available = new T.Group(), active = new T.Sprite(progressMark ??= makeProgressMark());
  available.name = 'quest-available';
  active.name = 'quest-in-progress';
  active.scale.set(.74, .74, 1);
  part(available, markerBar, mark, 0, .14);
  part(available, markerDot, mark, 0, -.16);
  beacon.add(available, active);
  return { root, model, beacon, level, available, active };
}

const heart = new T.Shape();
heart.moveTo(0, -.5);
heart.bezierCurveTo(-.15, -.36, -.62, -.06, -.60, .24);
heart.bezierCurveTo(-.58, .59, -.20, .64, 0, .32);
heart.bezierCurveTo(.20, .64, .58, .59, .60, .24);
heart.bezierCurveTo(.62, -.06, .15, -.36, 0, -.5);
const heartShape = new T.ExtrudeGeometry(heart, { depth: .14, bevelSegments: 2, bevelSize: .043, bevelThickness: .045 });
heartShape.center();
const magnet = new T.TorusGeometry(.34, .115, 7, 24, Math.PI).rotateZ(Math.PI);

function makeSupply(scene: T.Scene, kind: SupplyKind) {
  const root = new T.Group(), model = new T.Group(), color = SUPPLIES[kind].color;
  root.visible = false;
  root.name = `world-${kind}`;
  root.add(model);
  scene.add(root);
  ring(root, 1.04, .042, glow(color, .88), 0, .16, 0);
  part(root, new T.CylinderGeometry(.075, .36, 2.8, 12, 1, true), glow(color, .24), 0, 1.47, 0);
  if (kind === 'heart') part(model, heartShape, surface(color, .58));
  else {
    part(model, magnet, surface('#50c6d1', .42), 0, .035);
    for (const side of [-1, 1]) {
      part(model, new T.BoxGeometry(.23, .37, .23), surface(color, .38), side * .34, .19);
      part(model, new T.BoxGeometry(.24, .12, .24), glow('#efffff'), side * .34, .38);
    }
  }
  return { root, model };
}

const signalColor = '#91e8ff', signalCore = glow(signalColor), signalGlow = glow(signalColor, .36);
const signalColumn = new T.CylinderGeometry(.045, .18, 2.3, 9, 1, true);
function makeSignal(scene: T.Scene) {
  const root = new T.Group();
  root.name = 'quest-signal';
  scene.add(root);
  ring(root, 1.11, .044, signalCore, 0, .19, 0);
  ring(root, .65, .034, signalGlow, 0, .20, 0);
  part(root, signalColumn, signalGlow, 0, 1.26);
  const tip = part(root, crystalGeometry, signalCore, 0, 1.84);
  tip.scale.set(.26, .49, .26);
  return { root, tip };
}

type Visible = (x: number, y: number, z: number, radius: number) => boolean;
export class ExpeditionArt {
  private guides: ReturnType<typeof makeGuide>[] = [];
  private items: Record<SupplyKind, ReturnType<typeof makeSupply>>;
  private signals: ReturnType<typeof makeSignal>[];

  constructor(private scene: T.Scene) {
    this.items = { heart: makeSupply(scene, 'heart'), magnet: makeSupply(scene, 'magnet') };
    this.signals = Array.from({ length: QUESTS.signals.target }, () => makeSignal(scene));
  }

  update(game: Combat | null, time: number, view: Visible) {
    const npcs = game?.questNpcs ?? [];
    const activeNpc = game?.quest?.npc.id;
    for (const [i, npc] of npcs.entries()) {
      const art = this.guides[i] ??= makeGuide(this.scene);
      art.available.visible = art.level.visible = !npc.done && activeNpc === undefined;
      art.active.visible = !npc.done && activeNpc === npc.id;
      art.beacon.visible = art.available.visible || art.active.visible;
      const y = heightAt(npc.x, npc.z);
      art.root.visible = view(npc.x, y + 1.65, npc.z, 2);
      if (!art.root.visible) continue;
      art.root.position.set(npc.x, y, npc.z);
      const p = game!.player;
      art.model.rotation.y = Math.atan2(p.x - npc.x, p.z - npc.z);
      art.beacon.position.y = 2.97 + Math.sin(time * 3 + npc.id) * .12;
      art.available.rotation.y = time * .9;
    }
    for (let i = npcs.length; i < this.guides.length; i++) this.guides[i].root.visible = false;
    for (const [i, art] of this.signals.entries()) {
      const point = game?.quest?.signals[i];
      const y = point ? heightAt(point.x, point.z) : 0;
      art.root.visible = Boolean(point && view(point.x, y + 1.1, point.z, 2.2));
      if (!point || !art.root.visible) continue;
      art.root.position.set(point.x, y, point.z);
      art.tip.position.y = 1.74 + Math.sin(time * 3.4 + i) * .14;
      art.tip.rotation.y = time * 1.33 + i;
    }
    for (const kind of SUPPLY_KINDS) {
      const supply = game?.supplies.find((item) => item.kind === kind);
      const art = this.items[kind];
      const y = supply ? heightAt(supply.x, supply.z) : 0;
      art.root.visible = Boolean(supply && view(supply.x, y + 1.5, supply.z, 2.1));
      if (!supply || !art.root.visible) continue;
      art.root.position.set(supply.x, y, supply.z);
      art.model.position.y = 1.22 + Math.sin(time * 3.2) * .17;
      art.model.rotation.y = time * 1.6;
    }
  }
}
