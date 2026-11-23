import * as T from 'three';
import { batch, bentHat, crystalGeometry, lathe, oval, part, ring, surface, tube } from './art';
import { endgameEnemy } from './endgame-enemies';
import { approvedExpression, expressionArt, expressionSize, eyeArt, eyeSize } from './lumi-expression';
import { CAST_TIMES, type EnemyKind, type MageClass, type Spell } from '../data';

const gold = surface('#f3ce83', 0.05);
const brightGold = surface('#ffe6ab', 0.1);
const skin = surface('#ffe4df');
const faceSkin = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
faceSkin.onBeforeCompile = (shader) => {
  // Keep the painted highlights and blush legible under each stage's lighting.
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
    'outgoingLight = mix(diffuseColor.rgb, outgoingLight, 0.29);\n#include <opaque_fragment>');
};
const faceOutline = new T.MeshBasicMaterial({ color: '#ae788a', side: T.BackSide });
const lace = surface('#fffbff');
const shine = surface('#fff7ff', 0.25);
const eye = surface('#2b204e');
const ice = surface('#79e9ff', 0.66, true);
const lightIce = surface('#d4faff', 0.65, true);

function star(size: number, depth: number, short = 0.38) {
  const shape = new T.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 4;
    const r = size * (i % 2 ? short : 1);
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: size * .075, bevelThickness: .009, bevelSegments: 1, steps: 1 });
}

function hairLock(parent: T.Group, material: T.Material, points: number[][], width: number, depth = .46) {
  const curve = new T.CatmullRomCurve3(points.map(([x, y, z]) => new T.Vector3(x, y, z)));
  const segments = 30, sides = 12;
  const positions: number[] = [], color: number[] = [], indices: number[] = [];
  const wide = new T.Vector3(), low = new T.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, center = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    wide.set(-tangent.y, tangent.x, 0);
    if (wide.lengthSq() < .001) wide.set(1, 0, 0);
    wide.normalize();
    low.crossVectors(tangent, wide).normalize();
    const root = .24 + .76 * T.MathUtils.smoothstep(t, 0, .105);
    const radius = width * root * (.58 + .42 * Math.sin(Math.PI * t)) * (1 - t) ** .53 + .0015;
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * depth;
      positions.push(center.x + wide.x * x + low.x * y, center.y + wide.y * x + low.y * y, center.z + wide.z * x + low.z * y);
      const flash = Math.exp(-(((t - .40 - .12 * Math.cos(angle)) / .17) ** 2));
      const sheen = Math.sin(angle) * .12 + .061 * Math.cos(t * 10 + angle * 3) + flash * .14;
      color.push(.78 + sheen, .84 + sheen * .94, .97 + sheen * .74);
      if (i && j) {
        const k = i * (sides + 1) + j;
        indices.push(k - sides - 2, k, k - 1, k - sides - 2, k - sides - 1, k);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(color, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return part(parent, geometry, material);
}

function makeDress(fire: boolean) {
  const geometry = lathe([[0, .49], [.51, .49], [.548, .515], [.56, .55], [.547, .579], [.48, .693], [.391, .80], [.30, .94],
    [.31, 1.11], [.337, 1.24], [.35, 1.32], [.24, 1.43], [0, 1.47]], 80);
  const vertices = geometry.attributes.position;
  const colors: number[] = [];
  const hem = new T.Color(fire ? '#533047' : '#29294d');
  const waist = new T.Color(fire ? '#39203c' : '#1e203e');
  const collar = new T.Color(fire ? '#69405a' : '#424570');
  const trim = new T.Color(fire ? '#ebbeb0' : '#dad5ef');
  const piping = new T.Color(fire ? '#bf7b82' : '#8476c7');
  const blouse = new T.Color(fire ? '#ffe6d9' : '#edf0fb');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const fold = Math.cos(Math.atan2(x, z) * 9);
    const flare = Math.max(0, (.94 - y) / .45);
    const spread = 1 + .061 * fold * flare;
    vertices.setXYZ(i, x * spread, y + .015 * fold * flare, z * spread);
    const color = y <= .533 ? trim.clone() : y < .555 ? piping.clone() : y < .9
      ? hem.clone().lerp(waist, T.MathUtils.clamp((y - .55) / .39, 0, 1))
      : waist.clone().lerp(collar, T.MathUtils.clamp((y - .9) / .49, 0, 1));
    if (z > 0 && y >= 1.02) {
      const opening = .067 + Math.max(0, y - 1.04) * .37;
      const inset = 1 - T.MathUtils.smoothstep(Math.abs(x), opening - .015, opening + .009);
      color.lerp(blouse, inset * T.MathUtils.smoothstep(y, 1.02, 1.14));
    }
    color.multiplyScalar(1 + fold * .065);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Height, cheek/jaw half-width, side profile, front profile, and back profile.
// Separate stations for the chin and jaw angle keep the face from reading as an oval.
const headStations = [
  [.013, .001, .279, .280, .278], [.024, .054, .250, .331, .208],
  [.049, .116, .215, .379, .122], [.081, .170, .181, .412, .031],
  [.122, .229, .148, .428, -.051], [.168, .288, .109, .439, -.143],
  [.221, .348, .075, .450, -.228], [.280, .397, .053, .466, -.304],
  [.336, .435, .050, .477, -.356], [.390, .464, .053, .479, -.387],
  [.447, .480, .058, .478, -.404], [.505, .481, .061, .480, -.415],
  [.574, .475, .053, .482, -.419], [.651, .463, .037, .468, -.420],
  [.745, .431, .005, .432, -.395], [.834, .366, -.029, .374, -.344],
  [.919, .276, -.063, .280, -.276], [.985, .149, -.095, .137, -.207],
  [1.025, .001, -.102, -.101, -.103],
] as const;

function faceContour(y: number) {
  const last = headStations.length - 1;
  let i = 0;
  while (i + 1 < last && y > headStations[i + 1][0]) i++;
  const a = headStations[i], b = headStations[i + 1];
  const p = headStations[Math.max(0, i - 1)], n = headStations[Math.min(last, i + 2)];
  const d = b[0] - a[0], t = T.MathUtils.clamp((y - a[0]) / d, 0, 1);
  const t2 = t * t, t3 = t * t2;
  const sample = (axis: 1 | 2 | 3 | 4) => {
    const slopeA = (b[axis] - p[axis]) * d / (b[0] - p[0]);
    const slopeB = (n[axis] - a[axis]) * d / (n[0] - a[0]);
    return a[axis] * (2 * t3 - 3 * t2 + 1) + slopeA * (t3 - 2 * t2 + t)
      + b[axis] * (3 * t2 - 2 * t3) + slopeB * (t3 - t2);
  };
  return { width: sample(1), side: sample(2), front: sample(3), back: sample(4) };
}

function faceRelief(x: number, y: number) {
  const bulge = (cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  return .037 * bulge(0, .352, .051, .050)
    + .014 * bulge(0, .429, .052, .100)
    + .006 * (bulge(.039, .334, .027, .026) + bulge(-.039, .334, .027, .026))
    + .008 * bulge(0, .245, .108, .032)
    - .006 * bulge(0, .184, .081, .031)
    + .015 * (bulge(.303, .394, .097, .064) + bulge(-.303, .394, .097, .064))
    - .008 * (bulge(.185, .502, .108, .065) + bulge(-.185, .502, .108, .065));
}

function anterior(cosine: number, y: number) {
  const plane = .14 + .39 * T.MathUtils.smoothstep(y, .05, .42) * (1 - .6 * T.MathUtils.smoothstep(y, .59, .82));
  return cosine * (1 + plane * (1 - cosine));
}

function faceDepth(contour: ReturnType<typeof faceContour>, x: number, y: number, cosine: number) {
  return contour.side + (cosine >= 0
    ? (contour.front - contour.side) * anterior(cosine, y) + faceRelief(x, y) * cosine
    : (contour.side - contour.back) * cosine);
}

function faceFront(x: number, y: number) {
  const contour = faceContour(y);
  const cosine = Math.sqrt(Math.max(0, 1 - (x / Math.max(contour.width, .001)) ** 2));
  return faceDepth(contour, x, y, cosine);
}

function sculptFace() {
  const rings = 84, sides = 80;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const base = new T.Color('#fbebee'), rose = new T.Color('#efa0ae');
  const shadow = new T.Color('#cda4c0'), reflection = new T.Color('#f6dcff'), color = new T.Color();
  for (let j = 0; j <= rings; j++) {
    const y = T.MathUtils.lerp(headStations[0][0], headStations[headStations.length - 1][0], j / rings);
    const contour = faceContour(y);
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2, cosine = Math.cos(angle);
      const x = Math.sin(angle) * contour.width;
      const front = Math.max(0, cosine);
      positions.push(x, y, faceDepth(contour, x, y, cosine));
      const blush = Math.exp(-(((Math.abs(x) - .288) / .139) ** 2) - (((y - .388) / .074) ** 2));
      const nose = Math.exp(-((x / .051) ** 2) - (((y - .337) / .030) ** 2));
      const chin = 1 - T.MathUtils.smoothstep(y, .01, .16);
      const hairShadow = T.MathUtils.smoothstep(y, .66, .87);
      const edge = 1 - front;
      color.copy(base).lerp(reflection, front * (x + .48) * .20)
        .lerp(rose, Math.sqrt(front) * (.45 * blush + .12 * nose))
        .lerp(shadow, edge * .30 + chin * .12 + hairShadow * .24);
      colors.push(color.r, color.g, color.b);
      if (i && j) {
        const k = j * (sides + 1) + i;
        const a = k - sides - 2, b = k - sides - 1, c = k - 1;
        indices.push(a, b, c, b, k, c);
      }
    }
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  mesh.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  // Match the split front-seam normals to avoid a hard line through the nose.
  const normals = mesh.attributes.normal;
  const normal = new T.Vector3();
  for (let i = 0; i <= rings; i++) {
    const first = i * (sides + 1), last = first + sides;
    normal.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return mesh;
}

function faceRim(mesh: T.BufferGeometry) {
  const rim = mesh.clone();
  const p = rim.attributes.position, n = rim.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const thickness = .001 + .0013 * (1 - T.MathUtils.smoothstep(p.getY(i), .24, .55));
    p.setXYZ(i, p.getX(i) + n.getX(i) * thickness, p.getY(i) + n.getY(i) * thickness, p.getZ(i) + n.getZ(i) * thickness);
  }
  return rim;
}

const scalp = { y: .523, height: .559, width: .550, depth: .500, z: -.022 };

function fringe(material: T.Material) {
  const positions: number[] = [], colors: number[] = [], faces: number[] = [];
  const rows = 30, sides = 64;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2;
      const front = Math.cos(a);
      const angle = i > sides * .5 ? a - Math.PI * 2 : a;
      const parting = .24 * Math.exp(-(((angle - .35) / .43) ** 2));
      const edge = 1.15 + 1.37 * (1 - front) * .5 + .046 * Math.sin(a * 3 + .5) - parting;
      const p = j / rows * edge;
      const r = Math.sin(p);
      positions.push(Math.sin(a) * r * scalp.width, scalp.y + Math.cos(p) * scalp.height, Math.cos(a) * r * scalp.depth + scalp.z);
      const value = .69 + Math.max(0, Math.cos(p)) * .23 + .07 * Math.cos(a + .6) + .017 * Math.cos(a * 18 + p * 3);
      colors.push(value * .96, value, value + .13);
      const k = j * (sides + 1) + i;
      if (i && j) faces.push(k - sides - 2, k - 1, k, k - sides - 2, k, k - sides - 1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return new T.Mesh(geometry, material);
}

function fringeLock(parent: T.Group, material: T.Material, points: number[][], span: number, lift: number, shade: number) {
  const curve = new T.CatmullRomCurve3(points.map(([x, y, z = 0]) => new T.Vector3(x, y, z)));
  const rows = 36, across = 22;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const center = new T.Vector3(), direction = new T.Vector3();
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    curve.getPoint(t, center);
    curve.getTangent(t, direction);
    const crossLength = Math.max(.0001, Math.hypot(direction.x, direction.y));
    const width = span * (.36 + .64 * T.MathUtils.smoothstep(t, 0, .22)) * (1 - t) ** .61 + .0007;
    for (let j = 0; j <= across; j++) {
      const s = j / across * 2 - 1;
      const x = center.x - direction.y / crossLength * width * s;
      const y = center.y + direction.x / crossLength * width * s;
      const dome = scalp.z + scalp.depth * Math.sqrt(Math.max(0, 1 - ((y - scalp.y) / scalp.height) ** 2 - (x / scalp.width) ** 2));
      // Follow the volume of the crown down to the visible forehead without cutting through either mesh.
      const forehead = Math.max(dome, faceFront(x, y) + .005);
      const arch = (1 - s * s) * Math.sin(Math.PI * t) ** .47;
      positions.push(x, y, forehead + center.z + lift * arch);
      const band = Math.exp(-(((t - .41 - s * .115 - Math.sin(s * 12) * .027) / .17) ** 2));
      const grain = Math.cos(s * 23 + t * 3 + Math.sin(t * 9 + s * 6) * .74);
      const streak = Math.max(0, grain) ** 5 * .063 - Math.max(0, -grain) ** 7 * .035;
      const value = shade + .23 * (1 - Math.abs(s) ** 1.5) + band * (.25 + streak) + streak;
      colors.push(value * .96 + band * .05, value + band * .09, value * .86 + .17 + band * .095);
      if (i && j) {
        const k = i * (across + 1) + j;
        indices.push(k - across - 2, k - 1, k, k - across - 2, k, k - across - 1);
      }
    }
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  mesh.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return part(parent, mesh, material);
}

function facePatch(width: number, height: number, x: number, y: number, side = 1) {
  const geometry = new T.PlaneGeometry(width, height, 36, 28);
  const v = geometry.attributes.position;
  for (let i = 0; i < v.count; i++) {
    const px = x + v.getX(i) * side, py = y + v.getY(i);
    v.setXYZ(i, px, py, faceFront(px, py) + .0027);
  }
  if (side < 0 && geometry.index) {
    for (let i = 0; i < geometry.index.count; i += 3) {
      const second = geometry.index.getX(i + 1);
      geometry.index.setX(i + 1, geometry.index.getX(i + 2));
      geometry.index.setX(i + 2, second);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function animeEye(parent: T.Group, side: number, fire: boolean) {
  const group = new T.Group();
  const x = side * .221, y = .494 + side * .002;
  group.name = `lumi-eye-${side < 0 ? 'left' : 'right'}`;
  const geometry = facePatch(eyeSize.width, eyeSize.height, x, y, side);
  const eyes = part(group, geometry, eyeArt(side, fire, false));
  eyes.name = 'lumi-open-eye';
  const lids = part(group, geometry, eyeArt(side, fire, true));
  lids.name = 'lumi-blink-lid';
  lids.visible = false;
  parent.add(group);
  return { eyes, lids };
}

function makeEar(parent: T.Group, side: number) {
  const ear = new T.Group();
  ear.name = `lumi-ear-${side < 0 ? 'left' : 'right'}`;
  ear.position.set(side * .439, .396, .082);
  ear.rotation.set(-.10, side * .65, -side * .19);
  ear.scale.set(.94, .91, .93);
  parent.add(ear);
  const outer = new T.Shape();
  outer.moveTo(-side * .052, -.081);
  outer.bezierCurveTo(side * .115, -.053, side * .114, .115, side * .066, .123);
  outer.bezierCurveTo(side * .033, .132, -side * .034, .048, -side * .057, -.020);
  outer.quadraticCurveTo(-side * .092, -.086, -side * .052, -.081);
  const inset = new T.Shape();
  inset.moveTo(-side * .038, -.061);
  inset.bezierCurveTo(side * .062, -.040, side * .082, .094, side * .057, .093);
  inset.bezierCurveTo(side * .042, .092, -side * .008, .040, -side * .028, -.021);
  inset.quadraticCurveTo(-side * .017, -.041, -side * .038, -.061);
  const pink = surface('#d996a6', .10);
  part(ear, new T.ExtrudeGeometry(outer, {
    depth: .035, bevelEnabled: true, bevelSize: .013, bevelThickness: .017, bevelSegments: 3, curveSegments: 18,
  }), skin);
  part(ear, new T.ShapeGeometry(inset, 18), pink, 0, 0, .051);
  tube(ear, [[side * .060, .083, .055], [side * .051, .054, .060], [side * .009, .013, .060],
    [side * .034, -.009, .066], [-side * .014, -.045, .061]], .007, skin, 12);
}

function prismDrop(fire: boolean) {
  const edge = [[0, .103], [.024, .045], [.057, .025], [.019, -.001], [-.008, -.135], [-.023, -.003], [-.057, .026], [-.026, .045]];
  const palette = (fire
    ? ['#af5477', '#ffad87', '#ffeac2', '#e98d64', '#ba4e72', '#efa078', '#983a65', '#ffe6af']
    : ['#8da1f6', '#438bcf', '#b6f6ff', '#408dd5', '#375fac', '#70cfea', '#4f63c1', '#c7f4ff'])
    .map((hex) => new T.Color(hex));
  const highlight = new T.Color(fire ? '#fff3d9' : '#defaff');
  const vertices: number[] = [], color: number[] = [];
  for (let i = 0; i < edge.length; i++) {
    const j = (i + 1) % edge.length;
    const tint = palette[i], gleam = tint.clone().lerp(highlight, i % 3 === 0 ? .83 : .34);
    vertices.push(.002, .025, .030, ...edge[j], 0, ...edge[i], 0, .002, .025, -.023, ...edge[i], 0, ...edge[j], 0);
    color.push(gleam.r, gleam.g, gleam.b, tint.r, tint.g, tint.b, tint.r, tint.g, tint.b,
      gleam.r, gleam.g, gleam.b, tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(color, 3));
  return geometry;
}

function snowEmblem(parent: T.Group, accent: T.Material) {
  const spokes = new T.BoxGeometry(.023, .134, .026);
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI * i / 3;
    const x = Math.sin(angle), y = Math.cos(angle);
    part(parent, spokes, accent, x * .093, y * .093, 0).rotation.z = -angle;
    const tip = part(parent, crystalGeometry, lace, x * .149, y * .149, .013);
    tip.scale.set(.027, .043, .018);
    tip.rotation.z = -angle;
  }
  part(parent, crystalGeometry, accent, 0, 0, .019).scale.set(.055, .067, .04);
}

function brimPoint(t: number, a: number, lower = false) {
  const r = .10 + t * 1.16;
  const ripple = t * t * (.017 + .12 * Math.cos(a) - .135 * Math.sin(a) + .073 * Math.cos(a * 2.0 + .42));
  return [Math.sin(a) * r, ripple - (lower ? .033 : 0), Math.cos(a) * r * .845];
}

function silkBrim(lower: boolean, fire: boolean) {
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const steps = 12, sides = 72;
  const shade = new T.Color(lower ? (fire ? '#412841' : '#232957') : (fire ? '#d5a9ae' : '#b5afdc'));
  const light = new T.Color(lower ? (fire ? '#b16e88' : '#6575bb') : (fire ? '#fff1dd' : '#fff8f8'));
  const edge = new T.Color(fire ? '#45293f' : '#202347');
  const tint = new T.Color(fire ? '#dc9eb3' : '#7facf2');
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= sides; i++) {
      const t = j / steps, angle = i / sides * Math.PI * 2;
      vertices.push(...brimPoint(t, angle, lower));
      const color = shade.clone().lerp(light, .14 + .62 * Math.sin(t * Math.PI * .77) + .09 * Math.cos(angle + .7));
      if (lower) {
        const glint = Math.exp(-(((t - .54) / .19) ** 2)) * (.20 + .16 * Math.cos(angle + .87));
        color.lerp(tint, glint).lerp(edge, .69 * T.MathUtils.smoothstep(t, .67, 1));
      }
      colors.push(color.r, color.g, color.b);
      const k = j * (sides + 1) + i;
      if (i && j) indices.push(k - sides - 2, k - sides - 1, k, k - sides - 2, k, k - 1);
    }
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  mesh.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}

function laceBrim(parent: T.Group, edge: T.Material, thread: T.Material) {
  const point = (t: number, a: number, offset = 0) => {
    const [x, y, z] = brimPoint(t, a, true);
    return [x, y + offset, z];
  };
  // Open scallops show through around the silk instead of printing holes onto the hat.
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2, w = .157;
    tube(parent, [point(.991, a - w * .53), point(1.063, a - w * .28), point(1.101, a),
      point(1.072, a + w * .29), point(.991, a + w * .53)], .011, edge, 9);
    tube(parent, [point(1.059, a - w * .28), point(1.018, a), point(1.067, a + w * .31)], .007, edge, 6);
    tube(parent, [point(.81, a, -.004), point(.882, a - w * .31, -.007),
      point(.955, a, -.008), point(.886, a + w * .26, -.005), point(.81, a, -.004)], .006, thread, 9);
  }
}

function brimEmbroidery(parent: T.Group, fire: boolean) {
  const stitch = new T.MeshBasicMaterial({ color: fire ? '#e6a4b4' : '#8faaf0', toneMapped: false });
  const shape = new T.Shape();
  shape.moveTo(0, 1);
  shape.quadraticCurveTo(.10, .09, .80, 0);
  shape.quadraticCurveTo(.10, -.09, 0, -1);
  shape.quadraticCurveTo(-.10, -.09, -.80, 0);
  shape.quadraticCurveTo(-.10, .09, 0, 1);
  const spark = new T.ShapeGeometry(shape, 6);
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI / 9 + .13 * Math.sin(i * 5);
    const radius = .61 + .185 * Math.sin(i * 4.35);
    const [x, y, z] = brimPoint(radius, angle, true);
    const size = i % 5 === 0 ? .033 : i % 3 === 0 ? .015 : .010;
    const ornament = part(parent, spark, stitch, x, y - .005, z);
    ornament.rotation.set(Math.PI / 2, 0, angle * .75);
    ornament.scale.set(size, size, 1);
  }
}

function velvetPetal() {
  const points: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, width = .067 * Math.sin(Math.PI * t) ** .81 + .0008;
    for (let j = 0; j <= 6; j++) {
      const s = j / 3 - 1;
      points.push(width * s + .041 * t * t, .214 * t, .049 * Math.sin(Math.PI * t) + .068 * t * t - .022 * s * s);
      const smooth = .61 + .29 * Math.sin(t * Math.PI) + .08 * (1 - Math.abs(s));
      colors.push(smooth, smooth * .89, Math.min(smooth * 1.11, 1));
      if (i && j) {
        const k = i * 7 + j;
        indices.push(k - 8, k - 7, k, k - 8, k, k - 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function petals(parent: T.Group, fire: boolean, crystal: T.Material) {
  const geometry = velvetPetal();
  const velvet = new T.MeshStandardMaterial({ color: fire ? '#b25a87' : '#695acc', roughness: .65, vertexColors: true, side: T.DoubleSide });
  const understory = new T.MeshStandardMaterial({ color: fire ? '#57334e' : '#303373', roughness: .78, vertexColors: true, side: T.DoubleSide });
  const inner = new T.MeshStandardMaterial({ color: fire ? '#d99ab2' : '#9187e8', roughness: .73, vertexColors: true, side: T.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const flower = new T.Group();
    const [x, y, z, scale] = [[0, 0, 0, .92], [.206, -.043, -.027, .72], [-.14, .111, -.031, .60], [.33, .06, -.049, .49], [-.235, .223, -.066, .41]][i];
    flower.position.set(x, y, z);
    flower.scale.setScalar(scale);
    flower.rotation.set(.15 + i * .13, -.19 + i * .19, i * .56);
    parent.add(flower);
    for (let petal = 0; petal < 6; petal++) {
      const angle = petal * Math.PI / 3;
      part(flower, geometry, i === 4 ? understory : velvet).rotation.set(-.22 + (petal % 2) * .26, .19, angle);
      const middle = part(flower, geometry, inner, 0, 0, .036);
      middle.scale.set(.70, .65, .88);
      middle.rotation.set(.30, -.12, angle + .41);
    }
    part(flower, crystalGeometry, crystal, .007, 0, .077).scale.set(.035, .049, .025);
  }
  for (let i = 0; i < 5; i++) {
    const leaf = part(parent, geometry, understory, -.14 + i * .098, .074 + i * .052, -.042 - i * .013);
    leaf.rotation.set(.23, .25, -.26 - i * .23);
    leaf.scale.set(.82, 1.19 - i * .065, .50);
  }
}

function moonPin(parent: T.Group, metal: T.Material) {
  const crescent = new T.Shape();
  crescent.moveTo(.067, .128);
  crescent.bezierCurveTo(-.113, .114, -.161, -.121, .07, -.135);
  crescent.bezierCurveTo(-.031, -.08, -.039, .048, .067, .128);
  part(parent, new T.ExtrudeGeometry(crescent, { depth: .018, bevelEnabled: true, bevelThickness: .005, bevelSize: .004, bevelSegments: 2 }), metal);
  part(parent, star(.039, .014), metal, .049, .016, .021);
}

export function makeMageStaff(fire: boolean) {
  const root = new T.Group(), shaftArt = new T.Group();
  root.name = 'lumi-staff';
  const shaft = surface(fire ? '#6f3c50' : '#485274');
  const metal = fire ? brightGold : surface('#e4d8f1', .12);
  const band = surface(fire ? '#af7b8c' : '#a7a6d3');
  const accent = fire ? surface('#ffb66c', .64, true) : ice;
  const flash = fire ? surface('#fff1a9', .64, true) : lightIce;
  part(shaftArt, new T.CylinderGeometry(.037, .026, 2.29, 12), shaft, 0, .105, 0);
  for (const y of [-.99, -.13, .105, .92, 1.06]) {
    part(shaftArt, new T.CylinderGeometry(.066, .062, .047, 12), y === -.13 || y === .105 ? band : metal, 0, y, 0);
  }
  for (const side of [-1, 1]) {
    tube(shaftArt, [[0, .97, 0], [side * .138, 1.12, .01], [side * .167, 1.33, .01], [side * .082, 1.49, .006]], .025, metal);
  }
  oval(shaftArt, metal, 0, -1.045, 0, .050, .060, .050);
  root.add(batch(shaftArt));
  const gem = part(root, crystalGeometry, accent, 0, 1.307, 0);
  gem.name = 'lumi-staff-tip';
  const orbit = ring(root, .218, .010, metal, 0, 1.307, 0);
  orbit.name = 'lumi-staff-orbit';
  orbit.rotation.set(-.8, 0, .4);
  part(orbit, star(.040, .009), flash, .225, 0, 0);
  part(root, star(.070, .012), flash, 0, 1.577, .035);
  part(root, crystalGeometry, flash, .18, 1.47, 0).scale.set(.036, .071, .031);
  const animate = (time: number, pulse = 0) => {
    gem.rotation.y = time * 1.65;
    orbit.rotation.y = time * .85;
    gem.scale.set(.15 + pulse * .035, .265 + pulse * .06, .128 + pulse * .025);
  };
  animate(0);
  return { root, animate };
}

export function makeMage(mageClass: MageClass = 'frost') {
  const fire = mageClass === 'fire';
  const midnight = surface(fire ? '#342439' : '#22213d');
  const cape = surface(fire ? '#653c53' : '#36375a');
  const periwinkle = surface(fire ? '#af7b8c' : '#a7a6d3');
  const seam = surface(fire ? '#e2b6a9' : '#cbbde1');
  const band = surface(fire ? '#80516b' : '#544777');
  const silver = surface(fire ? '#ffe0be' : '#e4d8f1', .12);
  const hair = new T.MeshStandardMaterial({ color: fire ? '#efd7db' : '#dce1f5', roughness: .66,
    vertexColors: true, side: T.DoubleSide, emissive: fire ? '#c4a1ad' : '#adbce6', emissiveIntensity: .15 });
  const lightHair = surface(fire ? '#ead0d7' : '#dee5fa', .13);
  const darkHair = surface(fire ? '#bb9aaa' : '#909cc5');
  const ribbon = surface(fire ? '#aa5782' : '#7162c7');
  const ribbonShade = surface(fire ? '#734266' : '#443b7a');
  const accent = fire ? surface('#ffb66c', .64, true) : ice;
  const flash = fire ? surface('#fff1a9', .64, true) : lightIce;
  const root = new T.Group();
  const body = new T.Group(), head = new T.Group(), costume = new T.Group(), mask = new T.Group();
  root.name = 'lumi';
  body.name = 'lumi-body';
  head.name = 'lumi-head';
  root.add(body);
  body.add(head, costume);
  head.position.y = 2.61;
  head.scale.setScalar(.82);
  costume.position.y = .29;
  costume.scale.set(.94, 1.52, .94);

  const legs = [-1, 1].map((side) => {
    const leg = new T.Group(), art = new T.Group();
    leg.position.set(side * .175, 1.24, .035);
    part(art, lathe([[0, -1.06], [.082, -1.06], [.082, -.93], [.093, -.71], [.094, -.54], [.108, -.30],
      [.12, -.11], [.117, .08], [0, .09]], 36), surface(fire ? '#594258' : '#413951'));
    const boot = part(art, lathe([[0, -1.18], [.101, -1.18], [.122, -1.11], [.115, -.89], [.106, -.73], [.107, -.635]], 36), midnight, 0, 0, .017);
    boot.scale.z = 1.02;
    oval(art, midnight, 0, -1.116, .109, .128, .106, .196);
    oval(art, cape, 0, -1.197, .110, .125, .028, .193);
    part(art, lathe([[.105, -.661], [.113, -.637], [.108, -.615]], 32), seam, 0, 0, .016);
    for (const [y, z] of [[-.825, .119], [-.897, .128]]) tube(art, [[-.049, y, z], [0, y -.021, z + .014], [.049, y, z]], .008, seam, 7);
    part(art, star(.036, .009), brightGold, 0, -.738, .127);
    leg.add(batch(art));
    body.add(leg);
    return leg;
  });

  part(costume, makeDress(fire), new T.MeshStandardMaterial({ vertexColors: true, roughness: .76 }));
  for (const x of [-.288, 0, .288]) {
    const z = Math.sqrt(.537 ** 2 - x * x);
    part(costume, star(.040, .008), lace, x, .625, z).rotation.y = Math.atan2(x, z);
  }
  part(costume, lathe([[.329, .86], [.355, .895], [.343, .965], [.309, 1.01]]), band);
  part(costume, star(.053, .011), silver, 0, .932, .362);
  oval(costume, skin, 0, 1.49, .025, .137, .207, .155);
  oval(costume, cape, 0, 1.344, -.015, .368, .055, .302);
  const collar = new T.Group();
  const scallop = (a: number) => .012 * Math.abs(Math.cos(a * 7));
  const collarCloth = lathe([[.208, 1.340], [.203, 1.390], [.172, 1.432], [.168, 1.47], [.165, 1.498]], 112);
  const cloth = collarCloth.attributes.position;
  for (let i = 0; i < cloth.count; i++) {
    const x = cloth.getX(i), y = cloth.getY(i), z = cloth.getZ(i);
    cloth.setY(i, y + scallop(Math.atan2(x, z)) * T.MathUtils.smoothstep(y, 1.468, 1.498));
  }
  collarCloth.computeVertexNormals();
  part(collar, collarCloth, midnight, 0, 0, .027);
  const collarPoint = (a: number, y: number, r: number) => [Math.sin(a) * r, y, Math.cos(a) * r + .027];
  const collarEdge = Array.from({ length: 113 }, (_, i) => {
    const a = i / 112 * Math.PI * 2;
    return collarPoint(a, 1.497 + scallop(a), .166);
  });
  tube(collar, collarEdge, .0032, periwinkle, 112);
  for (let i = -3; i <= 3; i++) {
    const a = i / 7 * Math.PI, w = .10;
    tube(collar, [collarPoint(a - w, 1.471, .170), collarPoint(a, 1.493, .168), collarPoint(a + w, 1.471, .170),
      collarPoint(a, 1.456, .172), collarPoint(a - w, 1.471, .170)], .0024, band, 12);
  }
  costume.add(collar);
  for (const side of [-1, 1]) {
    oval(costume, ribbon, side * .091, 1.309, .349, .112, .055, .032).rotation.z = side * .39;
    oval(costume, ribbonShade, side * .054, 1.216, .359, .033, .087, .020).rotation.z = side * .31;
  }
  for (const [x, y, r] of [[0, .614, .041], [-.17, .727, .023], [.17, .725, .023], [-.355, .595, .027], [.355, .595, .027]]) {
    const z = Math.sqrt((y < .655 ? .534 : .463) ** 2 - x * x);
    part(costume, star(r, .006), periwinkle, x, y, z + .015).rotation.y = Math.atan2(x, z);
  }
  part(costume, star(.059, .014), silver, 0, 1.301, .389);
  part(costume, crystalGeometry, accent, 0, 1.301, .412).scale.set(.039, .054, .023);
  for (const side of [-1, 1]) {
    tube(costume, [[side * .25, 1.343, .209], [side * .178, 1.262, .307], [side * .075, 1.283, .354]], .007, silver);
  }

  const capePivot = new T.Group(), capeArt = new T.Group();
  capePivot.position.set(0, 2.31, -.20);
  capePivot.scale.set(1.05, 1.55, 1.0);
  body.add(capePivot);
  const capeMaterial = new T.MeshStandardMaterial({ color: fire ? '#492839' : '#282848', roughness: .82, side: T.DoubleSide });
  const capeGeometry = new T.PlaneGeometry(1, 1, 18, 14);
  const v = capeGeometry.attributes.position;
  for (let i = 0; i < v.count; i++) {
    const s = v.getX(i) * 2, t = .5 - v.getY(i);
    v.setXYZ(i, s * (.37 + .29 * t) + .13 * t * t, -t * (.96 - .19 * s * s), -.16 - .32 * t * t + .10 * s * s + .045 * Math.cos(s * 9) * t);
  }
  capeGeometry.computeVertexNormals();
  part(capeArt, capeGeometry, capeMaterial);
  tube(capeArt, [[-.53, -.77, -.39], [-.22, -.91, -.48], [.13, -.96, -.435], [.49, -.89, -.48], [.78, -.77, -.39]], .027, seam);
  const backEmblem = new T.Group();
  backEmblem.position.set(.035, -.52, -.308);
  backEmblem.rotation.set(-.18, Math.PI, 0);
  if (fire) part(backEmblem, star(.141, .019), flash);
  else snowEmblem(backEmblem, seam);
  capeArt.add(backEmblem);
  capePivot.add(batch(capeArt));

  const arms = [-1, 1].map((side) => {
    const arm = new T.Group(), art = new T.Group();
    arm.position.set(side * .34, 2.227, .05);
    part(art, lathe([[0, -.683], [.111, -.679], [.136, -.632], [.144, -.58], [.125, -.48], [.112, -.352],
      [.108, -.238], [.157, -.102], [.126, .046], [.052, .072], [0, .074]], 36), cape, side * .027, 0, .020).rotation.z = side * .19;
    part(art, lathe([[.114, -.674], [.133, -.653], [.131, -.627], [.123, -.616]], 32), seam, side * .025, 0, .020).rotation.z = side * .19;
    oval(art, skin, side * .153, -.731, .038, .080, .111, .084).rotation.z = side * .15;
    oval(art, midnight, side * .153, -.695, .027, .075, .08, .078).rotation.z = side * .16;
    arm.add(batch(art));
    body.add(arm);
    return arm;
  });

  const staff = makeMageStaff(fire), wand = staff.root;
  wand.position.set(.151, -.735, .084);
  wand.rotation.z = -.215;
  wand.scale.setScalar(.93);
  arms[1].add(wand);

  const face = sculptFace();
  part(head, face, faceSkin).name = 'lumi-face';
  part(head, faceRim(face), faceOutline).name = 'lumi-jaw-rim';
  mask.add(fringe(hair));
  part(head, facePatch(expressionSize.width, expressionSize.height, 0, .294), expressionArt()).name = 'lumi-smile';
  const pendants: T.Group[] = [];
  const jewel = prismDrop(fire);
  const jewelMaterial = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const reflection = new T.MeshBasicMaterial({ color: fire ? '#fff6dc' : '#dffbff', toneMapped: false });
  for (const side of [-1, 1]) {
    makeEar(head, side);
    const fall = side < 0 ? -.047 : 0;
    hairLock(mask, hair, [[side * .293, .884, .209], [side * .425, .749, .279], [side * .465, .542, .333],
      [side * .438, .383 + fall, .368], [side * .380, .314 + fall, .403], [side * .312, .333 + fall, .439]], .088, .49);
    hairLock(mask, hair, [[side * .358, .813, .223], [side * .459, .700, .262], [side * .502, .508, .265],
      [side * .472, .347 + fall, .327], [side * .431, .278 + fall, .368], [side * .375, .283 + fall, .395]], .052, .61);
    hairLock(mask, lightHair, [[side * .405, .740, .321], [side * .440, .602, .364], [side * .441, .468, .386],
      [side * .411, .375 + fall * .5, .404], [side * .373, .342 + fall, .423]], .010, .57);
    hairLock(mask, hair, [[side * .459, .563, .307], [side * .465, .440, .356], [side * .443, .340 + fall, .406],
      [side * .369, .272 + fall, .437], [side * .312, .290 + fall, .435]], .016, .45);
    const pendant = new T.Group();
    pendant.name = `lumi-crystal-earring-${side < 0 ? 'left' : 'right'}`;
    pendant.position.set(side * .478, .331, .153);
    pendant.rotation.y = side * .28;
    part(pendant, new T.TorusGeometry(.023, .005, 7, 18), silver, 0, -.026, 0);
    tube(pendant, [[0, -.048, 0], [side * .011, -.080, .023], [.002, -.105, .032]], .0048, silver, 8);
    part(pendant, jewel, jewelMaterial, .002, -.207, .043);
    tube(pendant, [[-.012, -.189, .068], [-.010, -.21, .068], [-.008, -.235, .063]], .0021, reflection, 8);
    pendants.push(pendant);
    head.add(pendant);
  }
  fringeLock(mask, hair, [[.186, 1.039, -.031], [.021, .970, -.005], [-.163, .837, .007],
    [-.286, .690, .008], [-.398, .555, .014]], .154, .042, .68);
  fringeLock(mask, hair, [[.209, 1.052, -.037], [.080, .963, .009], [-.065, .821, .033],
    [-.199, .680, .021], [-.291, .604, .018]], .164, .049, .72);
  fringeLock(mask, hair, [[.231, 1.047, -.026], [.164, .921, .009], [.068, .780, .061],
    [-.034, .668, .045], [-.115, .593, .027], [-.171, .600, .009]], .116, .036, .73);
  fringeLock(mask, hair, [[.247, 1.029, -.014], [.275, .886, .017], [.302, .762, .025],
    [.329, .663, .022], [.368, .552, .011]], .085, .038, .69);
  fringeLock(mask, hair, [[.272, 1.016, -.016], [.329, .875, .005], [.363, .751, .013],
    [.404, .658, .011], [.426, .570, .006]], .059, .025, .63);
  fringeLock(mask, hair, [[.168, 1.008], [.048, .931, .037], [-.092, .818, .067],
    [-.216, .682, .039], [-.334, .598, .015]], .012, .007, .78);
  fringeLock(mask, hair, [[.225, .993], [.136, .850, .053], [.036, .716, .074],
    [-.052, .623, .053], [-.117, .600, .015]], .009, .006, .74);
  head.add(batch(mask));

  const locks = [-1, 1].map((side) => {
    const pivot = new T.Group(), art = new T.Group();
    pivot.name = `lumi-hair-lock-${side < 0 ? 'left' : 'right'}`;
    pivot.position.set(side * .293, .68, -.25);
    const sweep = side > 0 ? 1 : 0;
    hairLock(art, darkHair, [[-side * .155, .13, -.16], [side * .058, -.31, -.32], [side * .17, -.78, -.39],
      [side * .329, -1.24, -.46], [side * .197, -1.61, -.46], [side * .487, -1.74, -.51]], .292, .49);
    hairLock(art, hair, [[-side * .14, .172, -.114], [side * .119, -.295, -.283], [side * .203, -.716, -.271],
      [side * .285, -1.175, -.38], [side * .455, -1.396, -.46], [side * .654, -1.498, -.42]], .242);
    hairLock(art, hair, [[side * .041, .118, .082], [side * .161, -.285, .070], [side * .242, -.620, .139 + sweep * .13],
      [side * (.22 - sweep * .080), -.915, .269 + sweep * .22], [side * (.42 - sweep * .14), -1.169, .320 + sweep * .23],
      [side * (.585 - sweep * .11), -1.22, .33 + sweep * .184]], .158, .52);
    hairLock(art, hair, [[side * .10, .086, -.003], [side * .204, -.330, -.06], [side * .302, -.638, -.075],
      [side * .373, -.914, -.11], [side * .495, -1.187, -.206], [side * .584, -1.378, -.308]], .115);
    hairLock(art, hair, [[side * .128, -.196, .144], [side * .220, -.565, .182 + sweep * .13],
      [side * (.219 - sweep * .032), -.842, .289 + sweep * .24], [side * .347, -1.125, .385 + sweep * .18],
      [side * (.528 + sweep * .060), -1.23, .415 + sweep * .15]], .064, .45);
    for (let i = 0; i < 3; i++) {
      const x = i * .040;
      hairLock(art, i === 1 ? hair : lightHair, [[side * (.142 + x), -.264, .126 + i * .019],
        [side * (.196 + x), -.568, .205 + sweep * .158 + i * .011], [side * (.226 + x), -.859, .330 + sweep * .18 + i * .02],
        [side * (.356 + x), -1.131, .403 + sweep * .198 + i * .004], [side * (.566 + x), -1.167 - i * .032, .405 + sweep * .176]],
      .008 + i * .003, .45);
    }
    pivot.add(batch(art));
    head.add(pivot);
    return pivot;
  });

  const eyes = [-1, 1].map((side) => animeEye(head, side, fire));

  const hat = new T.Group(), hatArt = new T.Group();
  hat.name = 'lumi-witch-hat';
  hat.position.set(.043, .951, -.13);
  hat.rotation.set(-.14, -.14, -.169);
  head.add(hat);
  const silk = new T.MeshStandardMaterial({ vertexColors: true, roughness: .83, side: T.DoubleSide });
  const lining = new T.MeshStandardMaterial({ vertexColors: true, roughness: .88, side: T.DoubleSide });
  lining.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight = mix(diffuseColor.rgb, outgoingLight, 0.46);\n#include <opaque_fragment>');
  };
  part(hatArt, silkBrim(false, fire), silk);
  part(hatArt, silkBrim(true, fire), lining);
  brimEmbroidery(hatArt, fire);
  const laceArt = new T.Group();
  laceBrim(laceArt, midnight, band);
  const openLace = batch(laceArt);
  openLace.name = 'lumi-brim-lace';
  hat.add(openLace);
  const edge = Array.from({ length: 49 }, (_, i) => brimPoint(1, i / 48 * Math.PI * 2));
  tube(hatArt, edge, .015, midnight, 58);
  const trimming = Array.from({ length: 49 }, (_, i) => {
    const [x, y, z] = brimPoint(.924, i / 48 * Math.PI * 2, true);
    return [x, y - .007, z];
  });
  tube(hatArt, trimming, .008, seam, 58);
  part(hatArt, bentHat(fire ? '#a67f93' : '#9794c2', fire ? '#fff0e7' : '#f5f0fc'),
    new T.MeshStandardMaterial({ vertexColors: true, roughness: .84, side: T.DoubleSide }), 0, .026, -.009).scale.set(1.08, .79, 1.02);
  part(hatArt, lathe([[.70, .08], [.675, .143], [.635, .234], [.62, .246]]), ribbonShade, -.014, .002, -.005).scale.z = .868;
  ring(hatArt, .686, .010, seam, -.015, .109, -.005).scale.set(1, .868, 1);
  ring(hatArt, .631, .009, ribbon, -.019, .226, -.005).scale.set(1, .869, 1);
  for (const [x, y, z, r] of [[-.254, .36, .419, .033], [.269, .32, .407, .022], [-.449, .585, .271, .025]]) part(hatArt, star(r, .010), silver, x, y, z);
  hat.add(batch(hatArt));
  const flowers = new T.Group();
  petals(flowers, fire, accent);
  const ornament = batch(flowers);
  ornament.name = 'lumi-hair-ornament';
  ornament.position.set(.498, .213, .390);
  ornament.rotation.set(-.22, .51, -.255);
  const pin = new T.Group();
  pin.position.set(.00, -.148, .032);
  pin.scale.setScalar(.43);
  moonPin(pin, silver);
  ornament.add(pin);
  hat.add(ornament);
  const charm = new T.Group();
  charm.position.set(-.946, .826, .198);
  tube(charm, [[0, 0, 0], [.004, -.116, 0], [-.021, -.188, 0]], .008, gold);
  part(charm, star(.062, .012), brightGold, -.021, -.230, 0);
  hat.add(charm);
  body.add(batch(costume));
  root.traverse((object) => {
    const mesh = object as T.Mesh<T.BufferGeometry, T.Material>;
    if (mesh.isMesh) mesh.castShadow = !mesh.material.transparent;
  });

  return {
    root,
    ready: approvedExpression(fire),
    animate(time: number, moving: boolean, casting: number, pose: Spell = 'bolt', damage = false) {
      const step = moving ? Math.sin(time * 16) : 0;
      const duration = CAST_TIMES[pose];
      const pulse = casting > 0 ? Math.sin(Math.min(1, casting / duration) * Math.PI * .77) : 0;
      const nova = pose === 'nova' || pose === 'combustion' || pose === 'absoluteZero' || pose === 'supernova'
        || pose === 'glacialCollapse' || pose === 'cinderVortex' || pose === 'infernoHeart' || pose === 'frostGale'
        ? pulse : pose === 'barrier' || pose === 'fireBarrier' ? pulse * .44 : 0;
      const storm = pose === 'blizzard' || pose === 'comet' || pose === 'flamestrike' || pose === 'iceBloom' || pose === 'whiteout' || pose === 'winterMoon'
        || pose === 'glacierWall' || pose === 'meteor' || pose === 'auroraStrike' || pose === 'chainLightning' ? pulse : 0;
      const lance = pose === 'lance' || pose === 'orb' || pose === 'pyro' || pose === 'phoenix' || pose === 'rimeVolley' ? pulse : 0;
      const blink = pose === 'blink' ? pulse : 0;
      const bolt = pose === 'bolt' || pose === 'fireball' || pose === 'fireBlast' || pose === 'livingBomb'
        || pose === 'frostChain' || pose === 'emberFan' || pose === 'flashpoint' || pose === 'frostBind' || pose === 'cinderMarks' || pose === 'emberBrand' ? pulse : 0;
      body.position.y = (moving ? Math.abs(step) * .10 : Math.sin(time * 3) * .025) + pulse * .055 + nova * .11 + blink * .24;
      body.rotation.set((moving ? .14 : -.022) - storm * .17 + lance * .15 + blink * .26,
        lance * .25 - storm * .20 + (moving ? 0 : -.031),
        step * .043 + pulse * .066 + (moving ? 0 : -.022));
      legs[0].rotation.x = step * .48;
      legs[1].rotation.x = -step * .48;
      arms[0].rotation.x = -step * .43 - bolt * .35 - nova * .70 - storm * 1.46 + lance * .32;
      arms[0].rotation.z = -nova * 1.13 - storm * .23;
      arms[1].rotation.x = step * .26 - bolt * 1.34 - nova * .47 - storm * 2.4 - lance * 1.61 + blink * .52 - (moving ? .01 : .105);
      arms[1].rotation.z = .075 + bolt * .30 + nova * 1.12 + storm * .52 - lance * .12;
      head.rotation.x = (moving ? -.05 : Math.sin(time * 2) * .028) + pulse * .09 - storm * .19;
      head.rotation.z = moving ? -step * .055 : .049 + Math.sin(time * 1.75) * .043;
      locks.forEach((tail, index) => {
        const side = index === 0 ? -1 : 1;
        tail.rotation.x = Math.sin(time * (moving ? 12 : 2.2) + index) * (moving ? .12 : .035) + pulse * .13 + blink * .16;
        tail.rotation.z = side * (.045 + Math.sin(time * (moving ? 8 : 2.1) + index) * .035) + step * .055;
      });
      charm.rotation.z = Math.sin(time * (moving ? 10 : 3)) * (moving ? .33 : .14);
      pendants.forEach((pendant, i) => { pendant.rotation.z = Math.sin(time * (moving ? 7.3 : 2.3) + i * .7) * (moving ? .19 : .048) - step * .067; });
      capePivot.rotation.x = -(moving ? .36 : .06) + Math.cos(time * (moving ? 12 : 4)) * .065 - nova * .33 - blink * .26;
      const cycle = (time + 1) % 4.5;
      const blinkEyes = cycle < .14;
      eyes.forEach(({ eyes, lids }) => { eyes.visible = !blinkEyes; lids.visible = blinkEyes; });
      staff.animate(time, pulse);
      const silhouette = .81;
      body.scale.set(silhouette * (1 - blink * .19 + (damage ? .035 : 0)), silhouette * (1 + blink * .12 + (damage ? .035 : 0)), silhouette * (1 - blink * .19));
    },
  };
}

const enemies = new Map<EnemyKind, T.Group>();

function regionalEnemy(kind: 'shard' | 'prism' | 'wisp' | 'queen' | 'glacier' | 'eclipse') {
  const group = new T.Group();
  if (kind === 'shard' || kind === 'prism' || kind === 'glacier') {
    const giant = kind === 'glacier', boss = kind !== 'shard';
    const base = surface(giant ? '#4a69a0' : boss ? '#286b83' : '#347e7a', 0, true);
    const plate = surface(giant ? '#bcdbfa' : boss ? '#58b7ad' : '#71b8ad', 0, true);
    const gem = surface(giant ? '#9dd3ff' : boss ? '#9ffff1' : '#8debbb', .35, true);
    const rim = boss ? gold : surface('#46729b', 0, true);
    const rock = new T.IcosahedronGeometry(1, 0);
    part(group, rock, base, 0, .52, -.10).scale.set(.71, .46, .6);
    part(group, rock, plate, 0, .46, .37).scale.set(.42, .27, .31);
    for (const side of [-1, 1]) {
      for (const z of [-.42, 0, .34]) {
        const leg = part(group, rock, base, side * .50, .19, z);
        leg.scale.set(.28, .16, .17);
        leg.rotation.y = side * z;
      }
      const claw = part(group, rock, plate, side * .64, .32, .46);
      claw.scale.set(.30, .21, .255);
      claw.rotation.y = side * .40;
      part(group, crystalGeometry, rim, side * .78, .34, .59).scale.set(.085, .108, .12);
      const spike = part(group, crystalGeometry, gem, side * .42, boss ? .90 : .77, -.25);
      spike.scale.set(.22, boss ? .48 : .27, .20);
      spike.rotation.z = -side * .39;
      oval(group, eye, side * .172, .51, .63, .078, .074, .024);
      oval(group, gem, side * .17, .52, .652, .039, .037, .014);
    }
    const crown = part(group, crystalGeometry, gem, 0, boss ? 1.12 : .81, -.18);
    crown.scale.set(.28, boss ? .66 : .38, .28);
    if (boss) {
      ring(group, .34, .028, brightGold, 0, .94, -.18).rotation.z = .14;
      part(group, star(.15, .025), gold, 0, .62, .659);
    }
    if (giant) {
      for (const side of [-1, 1]) part(group, crystalGeometry, gem, side * .72, .82, -.09).scale.set(.24, .44, .24);
      part(group, star(.21, .032), brightGold, 0, 1.32, .12);
    }
  } else {
    const eclipse = kind === 'eclipse', boss = kind !== 'wisp';
    const dark = surface(eclipse ? '#201d42' : boss ? '#422854' : '#523f87');
    const cloth = surface(eclipse ? '#4f406f' : boss ? '#a65591' : '#9287d2');
    const glow = surface(eclipse ? '#ffb577' : boss ? '#ffd5f4' : '#b5ecff', .38, true);
    const hood = surface(eclipse ? '#745891' : boss ? '#d6a8df' : '#aea4e5');
    part(group, lathe([[0, .10], [.13, .18], [.28, .22], [.47, .38], [.43, .58], [.32, .79], [0, .87]], 20), cloth);
    oval(group, hood, 0, .82, 0, .44, .42, .385);
    oval(group, dark, 0, .77, .243, .331, .285, .185);
    const tail = part(group, crystalGeometry, cloth, .12, .27, -.35);
    tail.scale.set(.27, .30, .51);
    tail.rotation.y = .41;
    for (const side of [-1, 1]) {
      const sleeve = oval(group, cloth, side * .43, .56, .13, .19, .26, .18);
      sleeve.rotation.z = side * .48;
      oval(group, glow, side * .134, .80, .418, .064, .084, .022);
      const fin = part(group, crystalGeometry, hood, side * .40, .91, -.105);
      fin.scale.set(.18, boss ? .60 : .33, .19);
      fin.rotation.z = -side * (boss ? .91 : .60);
      if (boss) {
        const plume = part(group, crystalGeometry, glow, side * .53, .79, -.22);
        plume.scale.set(.11, .47, .13);
        plume.rotation.z = -side * 1.12;
        const tine = part(group, crystalGeometry, gold, side * .24, 1.19, .085);
        tine.scale.set(.10, .23, .10);
        tine.rotation.z = -side * .38;
      }
    }
    if (boss) {
      ring(group, .31, .031, brightGold, 0, 1.15, .035);
      part(group, crystalGeometry, glow, 0, 1.38, .10).scale.set(.14, .29, .12);
      part(group, star(.155, .018), brightGold, 0, .51, .40);
      part(group, star(.080, .014), glow, 0, .51, .427);
      if (eclipse) {
        const halo = ring(group, .57, .028, glow, 0, 1.06, -.28);
        halo.rotation.set(.11, .12, -.21);
      }
    } else {
      part(group, star(.098, .015), glow, 0, 1.087, .286);
    }
  }
  group.name = kind;
  return group;
}

function riftKeeper() {
  const group = new T.Group();
  group.name = 'riftKeeper';
  const stone = surface('#342645', 0, true);
  const plates = surface('#87549d', 0, true);
  const core = surface('#ddb5ff', .64, true);
  const tips = surface('#82f8ff', .44, true);
  const rock = new T.IcosahedronGeometry(1, 0);
  part(group, rock, stone, 0, .85).scale.set(.49, .59, .38);
  part(group, rock, plates, 0, 1.34, .04).scale.set(.37, .29, .32);
  part(group, crystalGeometry, core, 0, .88, .34).scale.set(.20, .36, .17);
  ring(group, .43, .025, core, 0, .62, -.02).rotation.z = .31;
  for (const side of [-1, 1]) {
    part(group, rock, plates, side * .55, 1.08, -.015).scale.set(.25, .27, .29);
    part(group, rock, stone, side * .63, .56, .15).scale.set(.20, .31, .24);
    part(group, crystalGeometry, tips, side * .59, 1.42, .04).scale.set(.105, .39, .12);
    part(group, rock, plates, side * .21, .27, .06).scale.set(.17, .26, .24);
    oval(group, tips, side * .124, 1.35, .30, .065, .055, .045);
  }
  return group;
}

export function makeEnemy(kind: EnemyKind) {
  if (!enemies.has(kind)) {
    if (kind === 'riftKeeper') {
      enemies.set(kind, batch(riftKeeper()));
      return enemies.get(kind)!.clone();
    }
    const late = endgameEnemy(kind);
    if (late) {
      enemies.set(kind, batch(late));
      return enemies.get(kind)!.clone();
    }
    if (kind === 'shard' || kind === 'wisp' || kind === 'prism' || kind === 'queen' || kind === 'glacier' || kind === 'eclipse') {
      enemies.set(kind, batch(regionalEnemy(kind)));
      return enemies.get(kind)!.clone();
    }
    const group = new T.Group();
    const puff = kind === 'puff', hare = kind === 'hare', boss = kind === 'warden';
    const shell = surface(puff ? '#b684df' : hare ? '#6989cf' : boss ? '#58429b' : '#8273bb');
    const soft = surface(puff ? '#d5aceb' : hare ? '#a5c7ef' : boss ? '#9670d1' : '#bca5ed');
    const dark = surface(puff ? '#8859ca' : hare ? '#5763b5' : '#4d3d8a');
    const hoof = surface(puff ? '#ca92e1' : hare ? '#809fe0' : '#6554a5');
    const ear = surface(puff ? '#e4aff7' : hare ? '#b7e5f6' : '#f1a3ce', boss ? .13 : 0);
    const e = new T.IcosahedronGeometry(1, 0);

    oval(group, shell, 0, puff ? .44 : .48, 0, .60, puff ? .42 : .47, .467);
    oval(group, soft, 0, .33, .294, .40, .292, .198);
    oval(group, dark, -.08, .38, -.433, .192, .187, .172);
    for (const side of [-1, 1]) {
      oval(group, hoof, side * .307, .139, .217, .174, .144, .24);
      oval(group, hoof, side * .516, .36, .062, .17, .179, .188).rotation.z = -side * .31;
      if (puff) {
        oval(group, shell, side * .369, .729, -.035, .152, .198, .129).rotation.z = -side * .39;
        oval(group, ear, side * .397, .771, .060, .082, .125, .047).rotation.z = -side * .43;
      } else if (hare) {
        oval(group, dark, side * .275, .981, -.044, .145, .309, .132).rotation.z = -side * .245;
        oval(group, ear, side * .311, 1.018, .055, .079, .214, .041).rotation.z = -side * .245;
      } else {
        const horn = part(group, crystalGeometry, ear, side * .443, .85, -.036);
        horn.scale.set(.16, boss ? .49 : .342, .17);
        horn.rotation.z = -side * .487;
        const plates = part(group, e, dark, side * .53, .465, -.05);
        plates.scale.set(.24, .29, .38);
      }
      oval(group, eye, side * .203, .501, .43, .076, .096, .035).rotation.y = side * .24;
      oval(group, boss ? ear : shine, side * .203 - .018, .53, .461, .022, .027, .013, true);
      oval(group, ear, side * .317, .387, .406, .057, .023, .013, true).rotation.y = side * .35;
    }
    tube(group, [[-.048, .379, .478], [0, .361, .487], [.048, .379, .478]], .013, eye, 5);
    if (hare) oval(group, lightIce, 0, .86, .17, .19, .128, .15);
    if (!puff && !hare) {
      const crown = part(group, crystalGeometry, boss ? lightIce : soft, 0, .87, .15);
      crown.scale.set(.112, boss ? .28 : .17, .113);
    }
    enemies.set(kind, batch(group));
  }
  return enemies.get(kind)!.clone();
}
