import * as T from 'three';
import { batch, crystalGeometry, oval, paint, part, random, ring, surface, tube } from './art';
import { FIELD_X, FIELD_Z, type Obstacle } from '../data';
import { nearestImage, wrapAxis } from '../field';
import { terrainCell, terrainPropSectors, type PropSite, type TerrainProp, type TerrainSector } from './terrain-props';

function noise(x: number, y: number, periodX = 0, periodY = 0) {
  const a = Math.floor(x), b = Math.floor(y);
  const fx = x - a, fy = y - b;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const hash = (i: number, j: number) => {
    if (periodX) i = T.MathUtils.euclideanModulo(i, periodX);
    if (periodY) j = T.MathUtils.euclideanModulo(j, periodY);
    let v = Math.imul(i + 1431, 374761393) + Math.imul(j - 231, 668265263) | 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const lo = T.MathUtils.lerp(hash(a, b), hash(a + 1, b), sx);
  const hi = T.MathUtils.lerp(hash(a, b + 1), hash(a + 1, b + 1), sx);
  return T.MathUtils.lerp(lo, hi, sy);
}

export function heightAt(x: number, z: number) {
  x = wrapAxis(x, FIELD_X);
  z = wrapAxis(z, FIELD_Z);
  const edge = Math.min(1, Math.max(0, (Math.max(Math.abs(x) * .78, Math.abs(z)) - 8) / 20));
  const center = Math.min(1, Math.hypot(x, z) / 5);
  // Match both height and slope where the two sides of the snowfield meet.
  const seamX = .5 * T.MathUtils.smoothstep(Math.abs(x), FIELD_X - 34, FIELD_X);
  const seamZ = .5 * T.MathUtils.smoothstep(Math.abs(z), FIELD_Z - 34, FIELD_Z);
  const otherX = x - Math.sign(x) * FIELD_X * 2;
  const row = (zz: number) => {
    const value = noise(x * .17, zz * .18);
    return seamX ? T.MathUtils.lerp(value, noise(otherX * .17, zz * .18), seamX) : value;
  };
  const here = row(z);
  const height = seamZ ? T.MathUtils.lerp(here, row(z - Math.sign(z) * FIELD_Z * 2), seamZ) : here;
  return (height - .53) * (.20 + edge * 4.7) * center + edge * .65;
}

export function snowTone(u: number, v: number) {
  const drift = noise(u * 8 + v * 16, v * 9, 8, 9) - .5;
  const wind = noise(u * 14 + v * 28 + drift * 2.2, v * 36, 14, 36) - .5;
  const frost = noise(u * 119, v * 107, 119, 107) - .5;
  const ripples = Math.sin(Math.PI * 2 * (u * 2 + v * 23) + drift * 7) * (2.1 + wind);
  return drift * 26 + wind * 11 + frost * 6 + ripples;
}

function snowTexture() {
  return paint(512, (context, size) => {
    const buffer = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const warm = noise(u * 9 + 12, v * 8 + 5, 9, 8) - .5;
        const value = snowTone(u, v);
        const i = (y * size + x) * 4;
        buffer.data[i] = 178 + value + warm * 16;
        buffer.data[i + 1] = 192 + value + warm * 8;
        buffer.data[i + 2] = 220 + value * .78 - warm * 4;
        buffer.data[i + 3] = 255;
      }
    }
    context.putImageData(buffer, 0, 0);
  });
}

export function makeShadowMaterial() {
  const map = paint(64, (context, size) => {
    const r = size * .5;
    const gradient = context.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(37,36,99,0.62)');
    gradient.addColorStop(.32, 'rgba(48,50,117,0.44)');
    gradient.addColorStop(.67, 'rgba(61,68,135,0.22)');
    gradient.addColorStop(1, 'rgba(62,62,125,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
  return new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
}

export const groundSquare = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadowSquare = new T.PlaneGeometry(1, 1, 3, 3).rotateX(-Math.PI / 2);
const shadowAt = (parent: T.Object3D, material: T.Material, x: number, z: number, sx: number, sz: number) => {
  const patch = shadowSquare.clone(), point = patch.attributes.position;
  const y = heightAt(x, z);
  for (let i = 0; i < point.count; i++) {
    const dx = point.getX(i) * sx, dz = point.getZ(i) * sz;
    point.setXYZ(i, dx, heightAt(x + dx, z + dz) - y + .038, dz);
  }
  return part(parent, patch, material, x, y, z);
};

function pineTier(seed: number, radius: number, height: number, snow: boolean) {
  const rng = random(seed);
  const n = 13;
  const bumps = Array.from({ length: n }, () => rng());
  const profile = snow
    ? [[.01, 1.04], [.23, 1.00], [.41, .85], [.63, .69], [.82, .52], [.91, .39], [.84, .29], [.61, .33], [.01, .42]]
    : [[.01, 1], [.19, .97], [.43, .76], [.69, .53], [.93, .29], [1, .14], [.81, .067], [.39, .088], [.01, .14]];
  const colors: number[] = [], positions: number[] = [], indices: number[] = [];
  const lights = snow ? ['#d2e7fc', '#87a5da', '#cec4f1'] : ['#527db0', '#36528e', '#676fac'];
  const hue = rng();
  for (let level = 0; level < profile.length; level++) {
    const [r, y] = profile[level];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      const bump = bumps[i % n];
      const leans = snow ? .07 : .10;
      const rr = radius * r * (.92 + bump * .15);
      const fringe = (snow && level > 3 ? .12 : .075) * (bump - .5) * r;
      positions.push(Math.cos(a) * rr + y * radius * leans, height * (y + fringe), Math.sin(a) * rr + y * radius * -.07);
      const color = new T.Color(lights[0]).lerp(new T.Color(lights[1]), (1 - y) * .50 + bump * .23).lerp(new T.Color(lights[2]), hue * .35 + Math.sin(a) * .14 + .16);
      colors.push(color.r, color.g, color.b);
      if (i && level) {
        const j = level * (n + 1) + i;
        indices.push(j - n - 2, j - 1, j, j - n - 2, j, j - n - 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const bough = new T.MeshStandardMaterial({ vertexColors: true, roughness: .92, side: T.DoubleSide });
const snowcap = new T.MeshStandardMaterial({ vertexColors: true, roughness: .79, side: T.DoubleSide });
const trunk = new T.CylinderGeometry(.12, .21, 1.02, 8);
const bark = surface('#626089', 0, true);
function pine(group: T.Group, x: number, z: number, size: number, seed: number, snowy = true) {
  const art = new T.Group();
  art.position.set(x, heightAt(x, z), z);
  art.scale.setScalar(size);
  art.rotation.y = (seed * .739) % 6.28;
  art.rotation.z = Math.sin(seed) * .058;
  group.add(art);
  part(art, trunk, bark, 0, .52);
  for (const [index, y, radius, height] of [[0, .54, 1.14, 1.64], [1, 1.12, .952, 1.54], [2, 1.77, .745, 1.43], [3, 2.44, .55, 1.27]]) {
    const tier = part(art, pineTier(seed + index, radius, height, false), bough, 0, y, 0);
    tier.rotation.y = index * 1.77;
    if (snowy || index > 1) part(tier, pineTier(seed + index, radius * .99, height * 1.007, true), snowcap, .006, .05, -.004);
  }
}

const quartzFaces = ['#4184ca', '#5aa8ed', '#78cff3', '#a2ebff', '#aadff5', '#97a8ec', '#6f8ed6'];
function quartzGeometry(seed: number, faces = quartzFaces) {
  const rng = random(seed);
  const pos: number[] = [], colors: number[] = [];
  const n = 5;
  const floor: T.Vector3[] = [], rim: T.Vector3[] = [];
  const tip = new T.Vector3(.13, 1.44, -.08);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, r = .27 + rng() * .044;
    floor.push(new T.Vector3(Math.cos(a) * r * .92, -.1, Math.sin(a) * r * .92));
    rim.push(new T.Vector3(Math.cos(a) * r + .07, .92 + rng() * .25, Math.sin(a) * r));
  }
  const tri = (a: T.Vector3, b: T.Vector3, c: T.Vector3, palette: number, alt = 0) => {
    const color = new T.Color(faces[palette % faces.length]);
    color.multiplyScalar(alt ? 1.11 : .88);
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(floor[i], rim[i], floor[j], i + seed);
    tri(rim[i], rim[j], floor[j], i + seed, 1);
    tri(rim[i], tip, rim[j], i + seed + 2, 1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const crystalMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .34, metalness: .07, side: T.DoubleSide, emissive: '#397cce', emissiveIntensity: .20 });
const stone = surface('#778abe', 0, true);
const flurry = surface('#bdcdf0', 0, true);
const snowPillow = surface('#c4d4f3');
const rockShape = new T.IcosahedronGeometry(1, 1);
const clodShape = new T.IcosahedronGeometry(1, 0);
function crystals(group: T.Group, x: number, z: number, size: number, seed: number, faces = quartzFaces, material = crystalMat, base = stone) {
  const rng = random(seed);
  const g = new T.Group();
  g.position.set(x, heightAt(x, z), z);
  g.scale.setScalar(size);
  g.rotation.y = rng() * 6.28;
  group.add(g);
  part(g, rockShape, base, 0, .06, 0).scale.set(.74, .27, .65);
  for (const [index, xx, h, zz, angle] of [[0, -.05, 1.3, .0, -.22], [1, -.35, .82, .04, .33], [2, .36, .82, -.04, -.39], [3, .11, .5, .4, .34], [4, -.25, .44, -.37, -.29]]) {
    const mesh = part(g, quartzGeometry(seed + index, faces), material, xx, .14, zz);
    mesh.scale.set(h * .73, h, h * .75);
    mesh.rotation.set((rng() - .5) * .75, rng() * 6.28, angle);
  }
}

const grassMaterials = [surface('#727db9'), surface('#a3a6dc'), surface('#b5c1e5')];
const bladeGeometry = (() => {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([-.046, 0, 0, .045, 0, 0, .042, .21, -.026, .042, .21, -.026, -.046, 0, 0, .12, .35, -.068], 3));
  g.computeVertexNormals();
  return g;
})();
grassMaterials.forEach((m) => { m.side = T.DoubleSide; });

function runeTexture() {
  return paint(512, (ctx, size) => {
    const c = size / 2;
    const wash = ctx.createRadialGradient(c, c, 14, c, c, size * .50);
    wash.addColorStop(0, 'rgba(154,220,255,.18)');
    wash.addColorStop(.70, 'rgba(90,150,238,.24)');
    wash.addColorStop(.83, 'rgba(77,119,219,.33)');
    wash.addColorStop(.93, 'rgba(100,167,250,.10)');
    wash.addColorStop(1, 'rgba(100,167,250,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, size, size);
    for (const [r, w, color] of [[206, 2.5, '#a6c9f9'], [195, 2, '#709cdb'], [158, 2, '#9abeec']] as const) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.translate(c, c);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, -171);
      ctx.lineTo(-5, -177);
      ctx.lineTo(0, -185);
      ctx.lineTo(5, -177);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? '#92ade7' : '#d6f1ff';
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(220,250,255,.58)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, -21);
      ctx.lineTo(0, -89);
      ctx.moveTo(-17, -66);
      ctx.lineTo(0, -53);
      ctx.lineTo(17, -66);
      ctx.stroke();
    }
  });
}

function groundTiles(scene: T.Group) {
  const map = snowTexture();
  map.anisotropy = 4;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  const material = new T.MeshStandardMaterial({ map, roughness: .92 });
  const tile = 40, radius = 4, segments = Math.ceil(tile / 1.5);
  const tiles = new Map<string, { col: number; row: number; mesh: T.Mesh }>();
  const patch = (col: number, row: number) => {
    const cx = (col + .5) * tile, cz = (row + .5) * tile;
    const ground = new T.PlaneGeometry(tile, tile, segments, segments).rotateX(-Math.PI / 2);
    const vertices = ground.attributes.position, uv = ground.attributes.uv;
    for (let i = 0; i < vertices.count; i++) {
      const px = cx + vertices.getX(i), pz = cz + vertices.getZ(i);
      vertices.setY(i, heightAt(px, pz));
      uv.setXY(i, px / 120 + .5, .5 - pz / 120);
    }
    ground.computeVertexNormals();
    const normals = ground.attributes.normal, n = new T.Vector3(), side = segments + 1, delta = .2;
    for (let i = 0; i < vertices.count; i++) {
      const ix = i % side, iz = Math.floor(i / side);
      if (ix !== 0 && ix !== segments && iz !== 0 && iz !== segments) continue;
      const x = cx + vertices.getX(i), z = cz + vertices.getZ(i);
      n.set(heightAt(x - delta, z) - heightAt(x + delta, z), 2 * delta,
        heightAt(x, z - delta) - heightAt(x, z + delta)).normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
    const mesh = new T.Mesh(ground, material);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { col, row, mesh };
  };
  let col = Infinity, row = Infinity;
  const updateGround = (x: number, z: number) => {
    const cx = Math.floor(x / tile), cz = Math.floor(z / tile);
    if (cx === col && cz === row) return;
    [col, row] = [cx, cz];
    for (const [id, tile] of tiles) {
      if (Math.abs(tile.col - col) <= radius && Math.abs(tile.row - row) <= radius) continue;
      const { mesh } = tile;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      tiles.delete(id);
    }
    for (let rz = row - radius; rz <= row + radius; rz++) {
      for (let rx = col - radius; rx <= col + radius; rx++) {
        const id = `${rx}/${rz}`;
        if (!tiles.has(id)) tiles.set(id, patch(rx, rz));
      }
    }
  };
  updateGround(0, 0);
  return { groundMaterial: material, updateGround };
}

function batchBySector(art: T.Group): TerrainSector[] {
  const sectors = new Map<string, { x: number; z: number; root: T.Group }>();
  for (const item of [...art.children]) {
    const x = terrainCell(item.position.x), z = terrainCell(item.position.z), id = `${x}/${z}`;
    if (!sectors.has(id)) sectors.set(id, { x, z, root: new T.Group() });
    sectors.get(id)!.root.add(item);
  }
  return [...sectors.values()].map(({ x, z, root }) => ({ x, z, root: batch(root) }));
}

export function makeTerrain(scene: T.Group, shadowMaterial: T.Material) {
  const rng = random(17576);
  const ground = groundTiles(scene);

  const obstacles: Obstacle[] = [];
  const props = new T.Group();
  const shadows = new T.Group();
  const firFallback = new T.Group(), boulderFallback = new T.Group();
  const firs: PropSite[] = [], boulders: PropSite[] = [];
  const placeFir = (x: number, z: number, size: number, seed: number, snowy = true) => {
    pine(firFallback, x, z, size, seed, snowy);
    const spread = .90 + .16 * (.5 + .5 * Math.sin(seed * 2.41));
    firs.push({ x, y: heightAt(x, z) - .033 * size, z, width: size * spread, height: size, depth: size * spread,
      yaw: seed * .739 % (2 * Math.PI), lean: Math.sin(seed) * .045, tone: (snowy ? .92 : .83) + .1 * (.5 + .5 * Math.cos(seed)) });
  };
  const trees = [
    [-14, -5.6, 1.3], [-12, 7.5, 1.18], [.3, -13, 1.2], [11, -9, 1.28], [12, 7, 1.22],
    [-16, -22.5, 1.38], [-23, -32, 1.52], [3, -27, 1.35], [19, -27, 1.31], [39, -28, 1.43],
    [-22, 22, 1.39], [11, 32, 1.35], [28, 24, 1.26], [42, 29, 1.45],
  ];
  const wholeCircle = Math.PI * 2;
  for (const [i, [x, z, size]] of trees.entries()) {
    placeFir(x, z, size, Math.floor(rng() * 770), i % 4 !== 3);
    shadowAt(shadows, shadowMaterial, x + size * .28, z - size * .23, size * 3.25, size * 2.45);
    obstacles.push({ x, z, radius: .45 * size, canopy: { radius: .97 * size, height: 3.66 * size } });
  }

  const clusters: number[][] = [[4.15, -3.64, 1.24], [8.3, 3.8, .92], [-6.5, -4.46, .70], [-5.2, 5.79, .75], [1, -7.2, .52]];
  for (let i = 0; i < 22; i++) {
    const x = (rng() - .5) * 70, z = (rng() - .5) * 51;
    if (Math.abs(x) < 15 && Math.hypot(x * .85, z) > 10.8) clusters.push([x, z, .46 + rng() * 1.11]);
  }
  for (const [i, [x, z, size]] of clusters.entries()) {
    crystals(props, x, z, size, 10 + i * 15);
    shadowAt(shadows, shadowMaterial, x + .18, z, size * 2.52, size * 1.98);
    if (i === 0) obstacles.push({ x, z, radius: .48 * size, canopy: { radius: .74 * size, height: 1.9 * size } });
  }

  const rocks = [[3.7, -4.7, .9], [7, 4, .78], [-4.2, -3.8, .55], [-3.9, 3.1, .43], [2.6, 2.9, .32], [7.6, -1.2, .59], [-2.7, -.8, .21]];
  for (let i = 0; i < 765; i++) {
    const x = (rng() - .5) * (i < 160 ? 100 : FIELD_X * 2 + 12), z = (rng() - .5) * (i < 160 ? 75 : FIELD_Z * 2 + 12);
    if (Math.hypot(x, z) > 3.3) rocks.push([x, z, .09 + Math.pow(rng(), 2.6) * .86]);
  }
  for (const [x, z, size] of rocks) {
    const y = heightAt(x, z);
    const nearby = Math.hypot(x, z), weathered = .5 + .5 * Math.sin(x * .47 + z * .81);
    const replaced = size >= .53 || (size >= .34 && (nearby <= 12 || weathered > .72));
    const layer = replaced ? boulderFallback : props;
    const mound = part(layer, rng() > .17 ? clodShape : rockShape, rng() > .49 ? flurry : stone, x, y + size * .06, z);
    mound.scale.set(size * (1.1 + rng() * .48), size * (.32 + rng() * .24), size * (.65 + rng() * .6));
    mound.rotation.set(.08, rng() * wholeCircle, .14);
    if (size > .34 && rng() > .27) {
      const top = part(layer, rockShape, flurry, x - size * .10, y + size * .32, z);
      top.scale.set(size * 1.05, size * .25, size * .70);
      top.rotation.y = mound.rotation.y;
    }
    if (replaced) {
      boulders.push({ x, y: y - (.095 + weathered * .065) * size, z, width: mound.scale.x / 1.34,
        height: mound.scale.y / .46 * (.84 + .33 * weathered), depth: mound.scale.z / .90,
        yaw: mound.rotation.y, lean: .085 * Math.sin(x + z), tone: .94 + .075 * Math.sin(z * .97 + x) });
      if (nearby < 42 && size > .55) for (const [angle, distance, scale] of [[.37, 1.41, .23], [1.52, 1.19, .17]]) {
        const a = mound.rotation.y + angle, px = x + Math.cos(a) * distance * size, pz = z + Math.sin(a) * distance * size;
        const chip = part(props, clodShape, scale > .2 ? stone : flurry, px, heightAt(px, pz) + size * .022, pz);
        chip.scale.set(size * scale, size * scale * .39, size * scale * .71);
        chip.rotation.y = a;
      }
    }
    if (size > .2) shadowAt(shadows, shadowMaterial, x + .08, z + .07, size * 3.4, size * 2.5);
  }
  for (let i = 0; i < 840; i++) {
    const x = (rng() - .5) * (i < 100 ? 25 : FIELD_X * 2), z = (rng() - .5) * (i < 100 ? 19 : FIELD_Z * 2);
    if (Math.hypot(x, z) < 2.4) continue;
    const y = heightAt(x, z);
    const tuft = .14 + rng() * .61;
    for (let j = 0; j < 3; j++) {
      const blade = part(props, bladeGeometry, grassMaterials[(i + j * 2) % 3], x + (rng() - .5) * tuft * .45, y, z + (rng() - .5) * tuft * .49);
      blade.rotation.set(0, rng() * wholeCircle, (rng() - .5) * .73);
      blade.scale.setScalar(tuft * (.70 + rng() * .63));
    }
  }

  for (const [x, z, size] of [[-12.8, -7, 2.7], [10.8, -8, 3.0], [12.2, 2.9, 2.0], [-16.8, 2.2, 3.8], [-9.1, 7.9, 1.9], [4, -12.8, 3.85], [-4.5, -12, 4.0]]) {
    const drift = oval(props, snowPillow, x, heightAt(x, z) - size * .08, z, size * 1.17, size * .24, size * .63);
    drift.rotation.y = .2 + Math.sin(x + z) * .47;
  }

  for (let i = 0; i < 44; i++) {
    const a = i * .49, r = 2.8 + rng() * 6.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const fleck = part(props, crystalGeometry, flurry, x, heightAt(x, z) + .02, z);
    const scale = .026 + rng() * .072;
    fleck.scale.set(scale * 2, scale * .30, scale);
  }

  makeCavern(props, shadows, shadowMaterial, obstacles);
  makeCitadel(props, shadows, shadowMaterial, obstacles);
  makeOutskirts(props, shadows, shadowMaterial, obstacles);
  makeFrontier(props, shadows, shadowMaterial, obstacles, placeFir);
  for (let row = -3; row <= 3; row++) for (let col = -4; col <= 4; col++) {
    if (Math.abs(col) <= 1 && Math.abs(row) <= 1) continue;
    const x = col * 103 + (rng() - .5) * 48, z = row * 98 + (rng() - .5) * 48;
    const size = 1.4 + rng() * 1.25;
    if (rng() > .48) {
      placeFir(x, z, size, Math.floor(rng() * 770));
      obstacles.push({ x, z, radius: .43 * size, canopy: { radius: size, height: 3.7 * size } });
      shadowAt(shadows, shadowMaterial, x, z, size * 3, size * 2.5);
    } else {
      crystals(props, x, z, size, Math.floor(rng() * 770));
      shadowAt(shadows, shadowMaterial, x, z, size * 2.7, size * 2.2);
    }
  }
  makeLandmarks(props, shadows, shadowMaterial, obstacles);
  const shadowSectors = batchBySector(shadows);
  for (const { root } of shadowSectors) root.renderOrder = -4;
  const sectors = [...batchBySector(props), ...shadowSectors];
  const sigil = new T.MeshBasicMaterial({ map: runeTexture(), transparent: true, depthWrite: false, opacity: .79 });
  const clearing = new T.Group();
  const seal = part(clearing, groundSquare, sigil, 0, .13, 0);
  seal.scale.set(7.2, 1, 7.2);
  const thread = new T.MeshBasicMaterial({ color: '#aadcf9', transparent: true, opacity: .32 });
  ring(clearing, 2.09, .015, thread, 0, .134, 0);
  sectors.push({ x: 0, z: 0, root: clearing });
  scene.add(...sectors.map(({ root }) => root));
  let viewX = 0, viewZ = 0;
  const locate = (sector: TerrainSector) => {
    sector.root.position.x = nearestImage(sector.x, viewX, FIELD_X) - sector.x;
    sector.root.position.z = nearestImage(sector.z, viewZ, FIELD_Z) - sector.z;
  };
  const useProp = (kind: TerrainProp, sites: PropSite[], fallback: T.Group) => {
    let active = batchBySector(fallback);
    scene.add(...active.map(({ root }) => root));
    const layer = { get sectors() { return active; } };
    void terrainPropSectors(kind, sites).then((loaded) => {
      if (!loaded.length) return;
      for (const { root } of active) {
        root.removeFromParent();
        for (const mesh of root.children as T.Mesh[]) mesh.geometry.dispose();
      }
      active = loaded;
      for (const sector of active) {
        locate(sector);
        scene.add(sector.root);
      }
    }).catch(() => { /* Keep the local procedural props if the optional GLB cannot load. */ });
    return layer;
  };
  const layers = [useProp('fir', firs, firFallback), useProp('boulder', boulders, boulderFallback)];
  return {
    obstacles, groundMaterial: ground.groundMaterial,
    updateGround(x: number, z: number) {
      viewX = x;
      viewZ = z;
      ground.updateGround(x, z);
      for (const sector of sectors) locate(sector);
      for (const layer of layers) for (const sector of layer.sectors) locate(sector);
    },
  };
}

function makeLandmarks(props: T.Group, shadows: T.Group, shadow: T.Material, obstacles: Obstacle[]) {
  const rng = random(12654);
  const masonry = [surface('#637895', 0, true), surface('#7771a1', 0, true), surface('#846d86', 0, true)];
  const packedSnow = surface('#c7dcf4'), timber = surface('#59446b', 0, true);
  const cloth = [surface('#47758f', 0, true), surface('#7c558a', 0, true), surface('#99636d', 0, true)];
  const glow = [surface('#7ff6ed', .53), surface('#dfafff', .48), surface('#ffce8c', .48)];
  const block = new T.BoxGeometry(1, 1, 1), pillar = new T.CylinderGeometry(.57, .75, 1, 7);
  const arch = new T.TorusGeometry(4.2, .34, 7, 24, Math.PI);
  const trim = new T.TorusGeometry(4.2, .075, 5, 22, Math.PI);
  const wedge = new T.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2);
  const altar = new T.CylinderGeometry(1, 1.1, 1, 8);
  const sites: number[][] = [[-72, -34], [-46, 38], [34, -53], [66, 26], [9, 71], [-3, -86]];
  for (let row = -4; row <= 4; row++) for (let col = -5; col <= 5; col++) {
    if (Math.abs(col) < 2 && Math.abs(row) < 2) continue;
    if ((row * row + col * col) % 7 === 2) continue;
    sites.push([col * 82 + (rng() - .5) * 33, row * 75 + (rng() - .5) * 32]);
  }
  const free = (x: number, z: number) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + 4.4);
  for (const [i, [x, z]] of sites.entries()) {
    const theme = z < -100 ? 0 : x > 120 ? 2 : i % 3;
    const stone = masonry[theme], light = glow[theme], yaw = rng() * Math.PI * 2;
    const transform = (u: number, v: number) => ({ x: x + u * Math.cos(yaw) + v * Math.sin(yaw), z: z - u * Math.sin(yaw) + v * Math.cos(yaw) });
    const place = (geo: T.BufferGeometry, mat: T.Material, u: number, v: number, h: number, rotation = yaw) => {
      const point = transform(u, v);
      const mesh = part(props, geo, mat, point.x, heightAt(point.x, point.z) + h, point.z);
      mesh.rotation.y = rotation;
      return mesh;
    };
    const solid = (u: number, v: number, radius: number, height: number) => {
      const p = transform(u, v);
      if (free(p.x, p.z)) obstacles.push({ ...p, radius, canopy: { radius: radius + .18, height } });
    };
    if (!free(x, z)) continue;
    if (i % 4 === 0) {
      // Isolated spans leave several boss diameters between the supports.
      for (const u of [-4.2, 4.2]) {
        place(altar, stone, u, 0, .17).scale.set(1.22, .42, 1.06);
        place(pillar, stone, u, 0, 2.4).scale.y = 4.7;
        place(block, packedSnow, u, 0, 4.76).scale.set(1.44, .35, 1.25);
        place(crystalGeometry, light, u, .65, 3.52).scale.set(.16, .35, .14);
        solid(u, 0, .86, 5);
      }
      place(arch, stone, 0, 0, 4.74);
      place(trim, light, 0, .32, 4.74);
      place(crystalGeometry, light, 0, 0, 9.10).scale.set(.30, .63, .31);
    } else if (i % 4 === 1) {
      place(altar, stone, 0, 0, .12).scale.set(4.5, .28, 4.5);
      place(altar, packedSnow, 0, 0, .23).scale.set(3.28, .20, 3.28);
      const beacon = place(crystalGeometry, light, 0, 0, 2.63);
      beacon.scale.set(.71, 2.48, .66);
      for (const u of [-3.3, 3.3]) place(crystalGeometry, light, u, 0, .83).scale.set(.29, .73, .30);
      solid(0, 0, .83, 5.1);
    } else if (i % 4 === 2) {
      for (const u of [-4.3, 4.3]) {
        place(wedge, cloth[theme], u, 1.0, .82).scale.set(2.22, 1.65, 3.70);
        place(wedge, packedSnow, u, 1.14, 1.09).scale.set(2.02, 1.46, 2.90);
        place(block, timber, u, -.89, .51).scale.set(.84, 1.14, .16);
        place(pillar, timber, u + .90, -.99, .9).scale.set(.18, 1.8, .18);
        solid(u, 1.0, 1.05, 2.7);
      }
      place(altar, stone, 0, -.7, .18).scale.set(.76, .38, .76);
      place(crystalGeometry, light, 0, -.7, .63).scale.set(.24, .55, .24);
    } else {
      for (const [j, [u, v]] of [[-5, -2], [4.8, -3.3], [-6, 3.5], [6, 4.7]].entries()) {
        const h = 2.15 + (j % 2) * 1.35;
        place(altar, stone, u, v, .16).scale.set(.96, .39, .96);
        place(pillar, stone, u, v, h / 2).scale.set(.75, h, .75);
        place(block, packedSnow, u, v, h + .10).scale.set(1.04, .29, 1.04);
        place(crystalGeometry, light, u, v, h + .58).scale.set(.20, .40, .20);
        if (j % 2) solid(u, v, .67, h + .9);
      }
    }
    shadowAt(shadows, shadow, x, z, 8, 6.5);
    for (let j = 0; j < 11; j++) {
      const v = 4.0 + j * 1.81;
      place(block, j % 3 === 0 ? stone : packedSnow, (rng() - .5) * 1.5, v, .055, yaw + (rng() - .5) * .32)
        .scale.set(1.10 + rng() * .60, .11, .74 + rng() * .48);
    }
  }
}

function makeFrontier(props: T.Group, shadows: T.Group, shadow: T.Material, obstacles: Obstacle[],
  placeFir: (x: number, z: number, size: number, seed: number) => void) {
  const rng = random(866509);
  const twilight = surface('#746c9d', 0, true), frost = surface('#b2d3ec', .09, true);
  const water = surface('#679fc6', .13, true);
  const column = new T.CylinderGeometry(.44, .67, 1, 7);
  const forests = [[-63, 19], [-43, -51], [4, -66], [48, -55], [56, 53], [-59, 62], [93, 54], [-89, -58]];
  for (const [i, [cx, cz]] of forests.entries()) {
    for (let j = 0; j < 2; j++) {
      const angle = i * .78 + j * 2.399, radius = 7 + j * 5;
      const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
      const scale = .95 + rng() * 1.05;
      placeFir(x, z, scale, 77 + (i * 21 + j) * 3);
      shadowAt(shadows, shadow, x, z, scale * 2.95, scale * 2.5);
      obstacles.push({ x, z, radius: .58 * scale, canopy: { radius: scale, height: 3.65 * scale } });
    }
  }
  const iceVeins = ['#537aa9', '#5db1c2', '#afbeff', '#a2e7ea', '#b398e7', '#6f96cb', '#c0f5ff'];
  for (const [i, [x, z, scale]] of [[-68, -6, 3.1], [-79, -19, 4.3], [-93, -15, 5.45], [-101, -5, 4.2], [-93, 14, 3.7], [-77, 9, 2.7], [-58, -32, 2.85]].entries()) {
    crystals(props, x, z, scale, 33 + i * 11, iceVeins);
    shadowAt(shadows, shadow, x, z, scale * 2.75, scale * 2.42);
    obstacles.push({ x, z, radius: scale * .57, canopy: { radius: scale * .8, height: scale * 1.98 } });
  }
  const pool = new T.PlaneGeometry(2, 2, 42, 32).rotateX(-Math.PI / 2);
  const vertices = pool.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const u = vertices.getX(i), v = vertices.getZ(i);
    const x = -6 + u * Math.sqrt(1 - v * v / 2) * 23;
    const z = 62 + v * Math.sqrt(1 - u * u / 2) * 13;
    vertices.setXYZ(i, x, heightAt(x, z) + .115, z);
  }
  pool.computeVertexNormals();
  part(props, pool, water);
  for (const [x, z] of [[-26, 59], [-14, 72], [8, 53], [14, 66], [-1, 74]]) {
    const s = 1.55 + rng() * 1.5;
    crystals(props, x, z, s, Math.floor(38 + rng() * 400));
    obstacles.push({ x, z, radius: s * .55, canopy: { radius: s * .7, height: s * 1.9 } });
  }
  for (const path of [[[-25, 65], [-12, 62], [-7, 64], [5, 60], [13, 63]], [[-12, 62], [-7, 57], [-8, 53]], [[5, 60], [8, 55]]]) {
    tube(props, path.map(([x, z]) => [x, heightAt(x, z) + .14, z]), .045, frost, 28);
  }

  const gateX = 77, gateZ = -9, gateHeight = heightAt(gateX, gateZ) + 5.75;
  for (const [dx, z, h] of [[-4.5, gateZ, 5.3], [4.5, gateZ, 5.3], [-9.5, -4, 3.5], [9.5, -4, 3.4], [-9.5, 13, 2.0], [9.5, 13, 2.4], [23, -17, 3.5]]) {
    const x = gateX + dx, y = heightAt(x, z);
    part(props, column, twilight, x, y + h / 2, z).scale.set(1.7, h, 1.7);
    part(props, rockShape, frost, x, y + h + .19, z).scale.set(.9, .30, .9);
    part(props, crystalGeometry, frost, x, y + h + .76, z).scale.set(.27, .54, .27);
    shadowAt(shadows, shadow, x, z, 4.1, 3.4);
    obstacles.push({ x, z, radius: .94, canopy: { radius: 1.2, height: h + 1.3 } });
  }
  part(props, new T.TorusGeometry(4.5, .48, 8, 32, Math.PI), twilight, gateX, gateHeight, gateZ);
  part(props, new T.TorusGeometry(4.5, .082, 6, 32, Math.PI), frost, gateX, gateHeight, gateZ + .48);
  for (let i = 0; i < 12; i++) {
    const z = gateZ + 3 + i * 2.65;
    for (const side of [-1, 1]) {
      const x = gateX + side * 3.4;
      part(props, rockShape, twilight, x, heightAt(x, z) + .018, z).scale.set(1.5, .087, 1.25);
    }
  }
}

function makeOutskirts(props: T.Group, shadows: T.Group, shadow: T.Material, obstacles: Obstacle[]) {
  const rng = random(10248);
  const ridge = new T.ConeGeometry(1, 1, 6), peak = surface('#c7d7fa', 0, true);
  const mountains = [surface('#727eae', 0, true), surface('#7e8abb', 0, true), surface('#6b7da7', 0, true)];
  for (let i = 0; i < 29; i++) {
    const angle = i / 29 * Math.PI * 2 + (rng() - .5) * .09;
    const cx = Math.cos(angle), cz = Math.sin(angle), edge = Math.max(Math.abs(cx), Math.abs(cz));
    const x = cx / edge * (FIELD_X - 52), z = cz / edge * (FIELD_Z - 48);
    const h = 3.5 + rng() * 5.5, w = 5 + rng() * 8;
    const y = heightAt(x, z) - 1.8, turn = rng() * Math.PI;
    const foot = part(props, ridge, mountains[i % mountains.length], x, y + h * .5, z);
    foot.scale.set(w, h, w * .91);
    foot.rotation.y = turn;
    const cap = part(props, ridge, peak, x, y + h * .826, z);
    cap.scale.set(w * .354, h * .352, w * .322);
    cap.rotation.y = turn;
  }

  const ice = surface('#719fc8', .08, true), bank = surface('#c0d6ee');
  const pool = new T.PlaneGeometry(2, 2, 32, 24).rotateX(-Math.PI / 2);
  const vertices = pool.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const u = vertices.getX(i), v = vertices.getZ(i);
    const x = -2 + u * Math.sqrt(1 - v * v / 2) * 8.4;
    const z = 24 + v * Math.sqrt(1 - u * u / 2) * 5.5;
    vertices.setXYZ(i, x, heightAt(x, z) + .065, z);
  }
  pool.computeVertexNormals();
  part(props, pool, ice);
  for (const line of [
    [[-8, 24], [-5.8, 23.6], [-3.1, 24.5], [-.9, 23.5], [3.8, 24.4]],
    [[-3.1, 24.5], [-4, 26.5], [-2.7, 28]],
    [[-.9, 23.5], [.35, 22], [1, 20]],
  ]) {
    tube(props, line.map(([x, z]) => [x, heightAt(x, z) + .10, z]), .032, bank, 18);
  }
  for (const [x, z, size] of [[-10.8, -27.8, 1.95], [2.8, -22.5, 1.54], [7.4, -28.5, 1.55], [-9.6, 27, .88], [6.6, 25.4, 1.02]]) {
    crystals(props, x, z, size, Math.floor(12 + rng() * 66));
    shadowAt(shadows, shadow, x, z, size * 2.6, size * 2.02);
    obstacles.push({ x, z, radius: .54 * size, canopy: { radius: .78 * size, height: 1.93 * size } });
  }
}

function makeCavern(props: T.Group, shadows: T.Group, shadow: T.Material, obstacles: Obstacle[]) {
  const rng = random(2118);
  const deep = surface('#315b70', 0, true), bright = surface('#76fae0', .42, true);
  const mica = surface('#7a80c4', .13, true);
  const faces = ['#4261a4', '#4be4c1', '#70dcd8', '#8ef7ed', '#54abc7', '#bc9ef5', '#6d7fe3'];
  const mineral = new T.MeshStandardMaterial({ vertexColors: true, roughness: .32, side: T.DoubleSide, emissive: '#55d9cb', emissiveIntensity: .20 });
  const columns = [
    [-18.1, -6.3, 1.45], [-22.7, 2.4, 1.7], [-16.7, 6.3, 1.34],
    [-27.4, 9.2, 2.06], [-28.1, -5.3, 1.58], [-23.4, -12.8, 1.67],
    [-19.2, 14.4, 1.67], [-30.0, -14.8, 2.1],
    [-35.8, -8.3, 2.38], [-43.2, -.2, 2.75], [-38, 11.7, 1.82],
    [-39, -24.5, 2.02], [-31.6, 20.2, 1.9], [-44.2, 25.1, 2.55],
  ];
  for (const [i, [x, z, size]] of columns.entries()) {
    crystals(props, x, z, size, 11 + i * 7, faces, mineral, deep);
    shadowAt(shadows, shadow, x, z, size * 3.1, size * 2.5);
    obstacles.push({ x, z, radius: .61 * size, canopy: { radius: .81 * size, height: 1.96 * size } });
  }
  for (let i = 0; i < 23; i++) {
    const x = -FIELD_X + 25 + rng() * 23, z = (rng() - .5) * (FIELD_Z * 2 - 12);
    const y = heightAt(x, z);
    const rock = part(props, clodShape, deep, x, y + 1.5, z);
    rock.scale.set(2.5 + rng() * 3, 2.6 + rng() * 5, 1.8 + rng() * 2);
    rock.rotation.set(rng() * .57, rng() * 6.28, rng() * .48);
    if (i % 2 === 0) crystals(props, x + 2.6, z, 1.65 + rng() * 1.9, i + 5, faces, mineral, deep);
  }
  for (let i = 0; i < 125; i++) {
    const x = -FIELD_X + rng() * (FIELD_X - 15), z = (rng() - .5) * (FIELD_Z * 2 - 4);
    const scale = .07 + rng() * .19;
    const splinter = part(props, crystalGeometry, i % 3 ? bright : mica, x, heightAt(x, z) + scale * .36, z);
    splinter.scale.set(scale, .85 * scale, scale * .6);
    splinter.rotation.set(.2, rng() * 6.28, -.38);
  }
  for (const path of [
    [[-25.5, -3.1], [-22.4, -2.2], [-20.2, -3.6], [-18.2, -1.7], [-16.6, -2.4]],
    [[-18.2, 7.2], [-19.4, 9.7], [-21.3, 10.8], [-21.9, 13.1], [-24.3, 15.7]],
    [[-29.2, -8.2], [-27.4, -7.7], [-26.3, -9.8], [-24.9, -10.7], [-22.3, -10.1]],
    [[-43, 1], [-39, 2.8], [-36, 6.5], [-36.8, 9.8], [-38, 11.7]],
    [[-42, -22.1], [-39, -23.2], [-33.8, -19], [-32, -18.5]],
  ]) {
    tube(props, path.map(([x, z]) => [x, heightAt(x, z) + .07, z]), .033, bright, 24);
  }
}

function makeCitadel(props: T.Group, shadows: T.Group, shadow: T.Material, obstacles: Obstacle[]) {
  const rng = random(7291);
  const base = surface('#65547d', 0, true), marble = surface('#9690b9', 0, true);
  const trim = surface('#eab9a7', .12, true), moon = surface('#fce0ce', .46, true);
  const pillar = new T.CylinderGeometry(.41, .51, 1, 8);
  const slab = new T.BoxGeometry(1, 1, 1);
  const gateX = 22, gateZ = -7.4, gateRadius = 2.35;
  const columns = [
    [gateX - gateRadius, gateZ, 2.32], [gateX + gateRadius, gateZ, 2.32],
    [17.4, -3.0, 2.5], [17.4, 4.4, 1.35], [26.8, -3.0, 2.1],
    [26.8, 4.4, 2.4], [21.2, 10.4, 1.6], [29.1, -12.4, 2.9],
    [34.4, -5.8, 2.5], [34.4, 2.6, 1.28], [40.8, -5.6, 3.15],
    [42.8, 2.6, 2.18], [36.9, 11.1, 2.03], [42.1, 18.2, 2.69],
  ];
  for (const [x, z, h] of columns) {
    const y = heightAt(x, z);
    part(props, slab, base, x, y + .14, z).scale.set(1.55, .28, 1.55);
    part(props, slab, marble, x, y + .36, z).scale.set(1.15, .21, 1.15);
    part(props, pillar, marble, x, y + .46 + h / 2, z).scale.y = h;
    part(props, slab, base, x, y + h + .51, z).scale.set(1.02, .20, 1.02);
    ring(props, .52, .065, trim, x, y + h + .67, z);
    part(props, crystalGeometry, moon, x, y + h + .91, z).scale.set(.22, .33, .22);
    shadowAt(shadows, shadow, x, z, 3.2, 2.8);
    obstacles.push({ x, z, radius: .74, canopy: { radius: .85, height: h + 1.18 } });
  }
  const archHeight = heightAt(gateX, gateZ) + 2.95;
  part(props, new T.TorusGeometry(gateRadius, .27, 7, 30, Math.PI), marble, gateX, archHeight, gateZ);
  part(props, new T.TorusGeometry(gateRadius, .042, 5, 30, Math.PI), trim, gateX, archHeight, gateZ + .29);
  const crescent = new T.Shape();
  crescent.moveTo(.30, .84);
  crescent.bezierCurveTo(-1.12, .63, -.88, -1.02, .40, -.74);
  crescent.bezierCurveTo(-.42, -.40, -.51, .42, .30, .84);
  part(props, new T.ExtrudeGeometry(crescent, { depth: .18, bevelSize: .05, bevelThickness: .06, bevelSegments: 2 }), moon, gateX, archHeight + .93, gateZ);
  part(props, crystalGeometry, moon, gateX + .51, archHeight + 1.15, gateZ + .12).scale.set(.17, .26, .11);
  for (const side of [-1, 1]) {
    const x = gateX + side * 1.52;
    const seam = Array.from({ length: 5 }, (_, i) => {
      const z = gateZ + .8 + i * .8;
      return [x, heightAt(x, z) + .062, z];
    });
    tube(props, seam, .027, trim, 16);
  }
  for (let i = -8; i <= 8; i++) {
    const z = i * 7.5, x = FIELD_X - 26 - rng() * 8;
    const y = heightAt(x, z);
    const h = 1.35 + rng() * 3;
    const wall = part(props, slab, i % 2 ? base : marble, x, y + h / 2, z);
    wall.scale.set(1.5, h, 2.25 + rng() * 1.7);
    wall.rotation.y = .27 * (rng() - .5);
  }
  for (let i = 0; i < 105; i++) {
    const x = 15 + rng() * (FIELD_X - 13), z = (rng() - .5) * (FIELD_Z * 2 - 3);
    const tile = part(props, rng() > .25 ? slab : clodShape, i % 4 ? base : trim, x, heightAt(x, z) + .04, z);
    const size = .16 + rng() * .73;
    tile.scale.set(size * 1.2, size * .17, size);
    tile.rotation.set(.08, rng() * 6.28, .06);
  }
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, r = 4.45;
    const x = 22 + Math.cos(a) * r, z = 3.4 + Math.sin(a) * r;
    const mark = part(props, slab, trim, x, heightAt(x, z) + .072, z);
    mark.rotation.y = -a + Math.PI * .25;
    mark.scale.set(.19, .035, .19);
  }
}
