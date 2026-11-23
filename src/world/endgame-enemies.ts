import * as T from 'three';
import type { EnemyKind } from '../data';
import { crystalGeometry, lathe, oval, part, ring, surface, tube } from './art';

const brass = surface('#bf8547');
const copper = surface('#895039');
const bronze = surface('#3e3445');
const lens = surface('#a7ffc6', .5);
const gold = surface('#ffd281', .25);
const deep = surface('#28224d');
const violet = surface('#623685');
const aqua = surface('#64e4ce', .32);
const rose = surface('#ff83be', .30);
const pale = surface('#ffdef1', .33);
const finViolet = new T.MeshStandardMaterial({ color: '#623685', side: T.DoubleSide, roughness: .70 });
const finAqua = new T.MeshStandardMaterial({ color: '#64e4ce', side: T.DoubleSide, roughness: .63, emissive: '#5fbaae', emissiveIntensity: .30 });
const cube = new T.BoxGeometry(1, 1, 1);

function gear(radius: number, teeth: number) {
  const shape = new T.Shape();
  for (let i = 0; i < teeth * 4; i++) {
    const a = i / (teeth * 4) * Math.PI * 2;
    const r = radius * (i % 4 === 1 || i % 4 === 2 ? 1 : .84);
    if (!i) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const center = new T.Path();
  center.absarc(0, 0, radius * .67, 0, Math.PI * 2, true);
  shape.holes.push(center);
  return new T.ExtrudeGeometry(shape, { depth: .09, bevelEnabled: true, bevelSize: .024, bevelThickness: .022, bevelSegments: 1 });
}

function clockwork(g: T.Group, kind: 'scarab' | 'sentinel' | 'archivist') {
  if (kind === 'scarab') {
    oval(g, bronze, 0, .34, -.12, .48, .25, .65);
    oval(g, copper, 0, .33, .46, .31, .20, .31);
    for (const side of [-1, 1]) {
      oval(g, brass, side * .245, .51, -.19, .264, .22, .59).rotation.y = -side * .11;
      tube(g, [[side * .07, .64, .37], [side * .09, .735, -.12], [side * .08, .64, -.57]], .025, bronze);
      for (const z of [-.48, -.10, .27]) {
        tube(g, [[side * .32, .38, z], [side * .56, .32, z + .07], [side * .73, .13, z - .08]], .062, bronze, 8);
        oval(g, brass, side * .53, .31, z + .05, .089, .081, .083, true);
      }
      oval(g, lens, side * .14, .41, .689, .084, .063, .035);
      tube(g, [[side * .14, .48, .54], [side * .21, .60, .71], [side * .34, .56, .82]], .025, brass, 8);
      part(g, crystalGeometry, copper, side * .20, .22, .675).scale.set(.095, .094, .20);
    }
    return;
  }
  const boss = kind === 'archivist';
  const r = boss ? .63 : .39;
  if (boss) {
    part(g, lathe([[0, .12], [.29, .18], [.47, .47], [.54, .82], [.45, 1.22], [.20, 1.42], [0, 1.46]], 12), bronze);
    part(g, gear(.76, 14), copper, 0, .94, -.12).rotation.z = .1;
    part(g, gear(.62, 12), brass, 0, .94, .39);
    ring(g, .51, .032, gold, 0, .94, .52).rotation.x = 0;
    const crown = part(g, gear(.51, 10), brass, 0, 1.80, .04);
    crown.rotation.x = Math.PI * .33;
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      part(g, cube, gold, Math.sin(a) * .48, .94 + Math.cos(a) * .48, .53).scale.set(.033, .082, .034);
    }
  } else {
    part(g, cube, copper, 0, .78, -.03).scale.set(.65, .58, .43);
    oval(g, brass, 0, 1.19, .02, .27, .21, .23);
    part(g, gear(.33, 10), brass, 0, .79, .23);
  }
  oval(g, bronze, 0, boss ? .94 : .79, .36, r * .68, r * .68, .20);
  part(g, crystalGeometry, lens, 0, boss ? .94 : .79, boss ? .60 : .54).scale.set(r * .42, r * .59, .12);
  for (const side of [-1, 1]) {
    const q = boss ? .67 : .39;
    oval(g, brass, side * q, 1.02, 0, .20, .25, .20);
    tube(g, [[side * q, 1.04, 0], [side * (q + .20), .76, .07],
      [side * (q + .12), .55, .31]], boss ? .105 : .088, bronze, 9);
    oval(g, copper, side * (q + .12), .53, .31, .15, .19, .18);
    if (!boss) {
      part(g, cube, bronze, side * .194, .291, .01).scale.set(.23, .43, .23);
      oval(g, brass, side * .194, .13, .13, .18, .125, .25);
      oval(g, lens, side * .093, 1.20, .224, .046, .041, .023);
    } else {
      part(g, gear(.24, 8), copper, side * .83, .59, .27).rotation.z = .2;
      part(g, crystalGeometry, gold, side * .92, 1.23, -.06).scale.set(.13, .36, .11);
    }
  }
}

function fin() {
  const s = new T.Shape();
  s.moveTo(.01, .32);
  s.bezierCurveTo(.24, .28, .56, -.12, .93, -.16);
  s.quadraticCurveTo(.91, -.54, .57, -.46);
  s.quadraticCurveTo(.36, -.46, .22, -.40);
  s.quadraticCurveTo(.11, -.36, .01, -.54);
  s.closePath();
  return new T.ExtrudeGeometry(s, { depth: .028, bevelEnabled: true, bevelSize: .035, bevelThickness: .048, bevelSegments: 2, curveSegments: 12 }).rotateX(Math.PI / 2);
}

function abyssal(g: T.Group, kind: 'manta' | 'bloom' | 'leviathan') {
  if (kind === 'bloom') {
    part(g, lathe([[0, .05], [.39, .09], [.47, .27], [.31, .49], [.28, .73], [.52, .91], [.52, 1.04], [0, 1.06]], 16), violet);
    oval(g, deep, 0, .90, 0, .38, .23, .38);
    oval(g, rose, 0, 1.02, .046, .26, .22, .27);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9, x = Math.sin(a), z = Math.cos(a);
      oval(g, i % 2 ? violet : rose, x * .41, 1.12, z * .41, .19, .36, .12).rotation.set(z * .57, a, -x * .56);
      tube(g, [[x * .24, .29, z * .24], [x * .48, .21, z * .49], [x * .67, .12, z * .59]], .051, violet, 7);
    }
    oval(g, pale, 0, 1.10, .291, .112, .074, .03);
    oval(g, deep, 0, 1.10, .319, .043, .060, .021);
    return;
  }
  const wing = fin();
  const boss = kind === 'leviathan';
  const y = boss ? 1.13 : .56;
  oval(g, deep, 0, y, .07, boss ? .45 : .31, boss ? .39 : .21, .55);
  oval(g, violet, 0, y + .045, .35, boss ? .40 : .27, boss ? .30 : .18, .36);
  if (boss) {
    tube(g, [[0, y, -.1], [.05, .76, -.48], [.44, .46, -.86],
      [.67, .40, -1.30], [.35, .56, -1.68], [-.13, .74, -1.77]], .26, deep, 24);
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const spike = part(g, crystalGeometry, i % 2 ? aqua : rose, Math.sin(t * 3.1) * .54, .85 - .27 * t, -.39 - 1.30 * t);
      spike.scale.set(.11, .34 - .095 * t, .15);
      spike.rotation.x = -.42;
    }
    part(g, wing, rose, -.10, .73, -1.65).rotation.y = 1.80;
  } else tube(g, [[0, .50, -.21], [.13, .41, -.65], [.05, .44, -1], [-.13, .54, -1.27]], .045, aqua, 17);
  for (const side of [-1, 1]) {
    const top = part(g, wing, finViolet, 0, y + .025, -.040);
    top.scale.set(side * (boss ? 1.22 : 1), 1, boss ? .91 : 1.14);
    top.rotation.z = side * .18;
    oval(g, aqua, side * .195, y + .077, .626, .085, .052, .027).rotation.y = side * .35;
    tube(g, [[side * .24, y + .11, .18], [side * .48, y + .115, -.08], [side * .72, y + .16, -.20]], .024, aqua, 9);
    if (boss) {
      const horn = part(g, crystalGeometry, rose, side * .31, y + .29, .35);
      horn.scale.set(.13, .46, .15);
      horn.rotation.set(-.57, 0, -side * .64);
      const ruff = part(g, wing, finAqua, side * .16, y + .15, .16);
      ruff.scale.set(side * .49, .8, .46);
      ruff.rotation.z = side * .59;
    }
  }
  if (boss) oval(g, pale, 0, y - .077, .682, .223, .045, .038);
}

const laterThemes = {
  storm: { shell: '#367491', dark: '#22364f', edge: '#b4dff4', core: '#86f6ff' },
  rift: { shell: '#724790', dark: '#302244', edge: '#cc91df', core: '#f3adff' },
  dawn: { shell: '#946149', dark: '#472e4d', edge: '#ffc878', core: '#fff19b' },
} as const;
function artillery(g: T.Group, theme: keyof typeof laterThemes, boss: boolean) {
  const tone = laterThemes[theme], shell = surface(tone.shell, 0, true), dark = surface(tone.dark, 0, true);
  const edge = surface(tone.edge, .12, true), core = surface(tone.core, .56, true);
  const stone = new T.IcosahedronGeometry(1, 0), barrel = new T.CylinderGeometry(.15, .21, .65, 8);
  const y = boss ? .92 : .58;
  part(g, stone, dark, 0, y, -.05).scale.set(boss ? .72 : .48, boss ? .66 : .48, .48);
  part(g, stone, shell, 0, y + .28, .16).scale.set(boss ? .54 : .39, .33, .40);
  for (const side of [-1, 1]) {
    const wing = part(g, stone, shell, side * (boss ? .78 : .41), y + .20, .06);
    wing.scale.set(.27, boss ? .64 : .36, .26);
    wing.rotation.z = -side * .48;
    part(g, crystalGeometry, edge, side * (boss ? .87 : .49), y + .45, .12).scale.set(.105, boss ? .65 : .34, .18);
    part(g, stone, dark, side * .24, .25, .12).scale.set(.26, .21, .35);
    oval(g, core, side * .145, y + .38, .435, .07, .055, .034);
    if (boss) {
      const ray = part(g, crystalGeometry, core, side * .48, y + .70, -.12);
      ray.scale.set(.14, .59, .15);
      ray.rotation.z = -side * .36;
    }
  }
  part(g, barrel, edge, 0, y - .04, .46).rotation.x = Math.PI / 2;
  part(g, crystalGeometry, core, 0, y - .04, .79).scale.set(.18, .19, .21);
  const lens = ring(g, boss ? .38 : .285, .034, core, 0, y, .78);
  lens.rotation.x = 0;
  if (boss) ring(g, theme === 'dawn' ? .73 : .56, .033, edge, 0, y + .77, -.17).rotation.x = .21;
}

export function endgameEnemy(kind: EnemyKind) {
  const group = new T.Group();
  if (kind === 'scarab' || kind === 'sentinel' || kind === 'archivist') clockwork(group, kind);
  else if (kind === 'manta' || kind === 'bloom' || kind === 'leviathan') abyssal(group, kind);
  else if (kind === 'stormAdept' || kind === 'stormRegent') artillery(group, 'storm', kind === 'stormRegent');
  else if (kind === 'riftOracle' || kind === 'riftMonarch') artillery(group, 'rift', kind === 'riftMonarch');
  else if (kind === 'dawnArtillerist' || kind === 'dawnColossus') artillery(group, 'dawn', kind === 'dawnColossus');
  else return null;
  group.name = kind;
  return group;
}
