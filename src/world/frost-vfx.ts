import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let shard: Promise<T.BufferGeometry> | undefined;
let burst: Promise<T.BufferGeometry> | undefined;

function load(name: string, width: number, height: number, depth: number, grounded = false) {
  return new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}art/${name}.glb`).then(({ scene }) => {
    scene.updateMatrixWorld(true);
    const point = new T.Vector3(), vertices: number[] = [];
    scene.traverse((child) => {
      const mesh = child as T.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
      if (!position) return;
      for (let i = 0; i < (index?.count ?? position.count); i++) {
        point.fromBufferAttribute(position, index?.getX(i) ?? i).applyMatrix4(mesh.matrixWorld);
        vertices.push(point.x, point.y, point.z);
      }
    });
    if (!vertices.length || vertices.some((value) => !Number.isFinite(value))) throw new Error(`Invalid geometry: ${name}`);
    const geometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!, center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    if (Math.min(size.x, size.y, size.z) < 1e-6) throw new Error(`Empty bounds: ${name}`);
    geometry.translate(-center.x, grounded ? -box.min.y : -center.y, -center.z);
    geometry.scale(width / size.x, height / size.y, depth / size.z);
    geometry.computeVertexNormals();
    const normal = geometry.getAttribute('normal'), colors = new Float32Array(normal.count * 3);
    const shaded = new T.Color('#4692cc'), rim = new T.Color('#e5fbff'), tint = new T.Color();
    for (let i = 0; i < normal.count; i++) {
      const facet = .50 + .45 * Math.abs(normal.getX(i) * .38 + normal.getY(i) * .71 + normal.getZ(i) * .46);
      tint.copy(shaded).lerp(rim, facet).toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    geometry.name = `meshy-${name}`;
    return geometry;
  });
}

export function loadFrostShard() { return shard ??= load('frost-shard', 1.14, 2.10, 1.04); }
export function loadFrostBurst() { return burst ??= load('frost-burst', 2.03, 1.67, 1.76, true); }

const passThrough = `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    vLocal = position;
    vUv = uv;
    vec4 point = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      point = instanceMatrix * point;
    #endif
    vec4 mvPosition = modelViewMatrix * point;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const iceVertex = `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vLocal;
  varying vec3 vEye;
  varying vec3 vNormal;
  varying vec3 vFacet;
  void main() {
    vec3 n = normal;
    vec4 point = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mat3 basis = mat3(instanceMatrix);
      n = basis * (n / vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2])));
      point = instanceMatrix * point;
    #endif
    vec4 mvPosition = modelViewMatrix * point;
    vNormal = normalize(normalMatrix * n);
    vEye = -mvPosition.xyz;
    vLocal = position;
    vFacet = color;
    #ifdef USE_INSTANCING_COLOR
      vFacet *= instanceColor;
    #endif
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const finish = `
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
function frostMaterial(name: string, vertexShader: string, fragmentShader: string, tint: string, opacity: number,
  mode: { additive?: boolean; crystal?: boolean; depthWrite?: boolean } = {}) {
  return new T.ShaderMaterial({
    name, vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: Boolean(mode.depthWrite),
    side: mode.crystal ? T.FrontSide : T.DoubleSide, blending: mode.additive ? T.AdditiveBlending : T.NormalBlending,
    vertexColors: Boolean(mode.crystal),
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
      tint: { value: new T.Color(tint) }, strength: { value: opacity }, phase: { value: 0 }, clock: { value: 0 },
    }]),
  });
}

export function prismaticIce(tint: string, strength: number, depthWrite = false) {
  return frostMaterial('prismatic-frost-ice', iceVertex, `
    #include <common>
    #include <fog_pars_fragment>
    uniform vec3 tint;
    uniform float strength;
    uniform float clock;
    varying vec3 vLocal;
    varying vec3 vEye;
    varying vec3 vNormal;
    varying vec3 vFacet;
    float grainHash(vec3 cell) {
      vec3 p = fract(cell * .1031);
      p += dot(p, p.zxy + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    void main() {
      vec3 eye = normalize(vEye), n = normalize(vNormal);
      float rim = pow(1.0 - clamp(dot(n, eye), 0.0, 1.0), 2.2);
      vec3 sky = normalize(vec3(-.46, .70, .53));
      float key = .5 + .5 * dot(n, sky);
      float sharp = pow(max(0.0, dot(n, normalize(sky + eye))), 39.0);
      float blueSky = smoothstep(-.55, .66, reflect(-eye, n).y);
      float band = vLocal.x * 18.0 + vLocal.y * 9.0 - vLocal.z * 11.0 + sin(vLocal.z * 12.0 + vLocal.x * 6.0) * 1.4;
      float grain = sin(vLocal.y * 13.0 + vLocal.z * 8.0);
      float vein = pow(.5 + .5 * cos(band), 28.0) * (.34 + .66 * grain * grain);
      vec3 pores = vLocal * vec3(23.0, 35.0, 23.0);
      float fleck = smoothstep(.76, .97, grainHash(floor(pores))) *
        (1.0 - smoothstep(.17, .37, length(fract(pores) - .5)));
      float stratum = .07 * sin(vLocal.y * 86.0 + vLocal.z * 16.0 + vein * .6)
        + .14 * sin(vLocal.y * 18.0 - vLocal.x * 9.0);
      float glint = exp(-abs(fract(vLocal.z * .72 + vLocal.y * .51 - clock * .42) - .57) * 37.0);
      vec3 core = mix(vec3(.010, .042, .13), tint * (.25 + .48 * blueSky + stratum) * vFacet, .38 + .62 * key);
      vec3 spark = mix(tint, vec3(.92, .98, 1.0), .45);
      vec3 light = core + spark * (.82 * rim + .94 * sharp + .30 * vein + .43 * fleck + glint * (.12 + rim * .35));
      gl_FragColor = vec4(light, strength * (.91 + .09 * rim));
      ${finish}
    }
  `, tint, strength, { crystal: true, depthWrite });
}

export const frostRibbonGeometry = (() => {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute([
    -.5, 0, -1, .5, 0, -1, -.5, 0, 0, .5, 0, 0,
    0, -.5, -1, 0, .5, -1, 0, -.5, 0, 0, .5, 0,
  ], 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1, 4, 5, 6, 5, 7, 6]);
  return geometry;
})();

export function frostRibbon() {
  return frostMaterial('frost-ribbon', passThrough, `
    #include <common>
    #include <fog_pars_fragment>
    varying vec2 vUv;
    uniform vec3 tint;
    uniform float clock;
    void main() {
      float along = vUv.y, across = vUv.x - .5;
      float width = mix(.065, .47, smoothstep(0.0, 1.0, along));
      float sine = sin(along * 18.0 + clock * 14.0);
      float center = sine * width * .22;
      float outer = max(0.0, 1.0 - abs(across - center) / width);
      float filament = exp(-abs(across - center) * 27.0);
      float echo = exp(-abs(across + center * 1.35 + width * .12) * 46.0);
      float glints = pow(.5 + .5 * sin(along * 127.0 + clock * 27.0 + across * 71.0), 9.0) * outer * outer;
      float opacity = (outer * outer * .23 + filament * .40 + echo * .23 + glints * .27) * along * along;
      opacity *= 1.0 - smoothstep(.88, 1.0, along);
      vec3 light = mix(mix(tint, vec3(.27, .23, .82), echo * .38), vec3(.87, .98, 1.0), clamp(filament * .69 + glints * .37, 0.0, 1.0));
      gl_FragColor = vec4(light, opacity);
      ${finish}
    }
  `, '#48bbff', 1, { additive: true });
}

export function frostSigil(tint: string, strength: number) {
  return frostMaterial('frost-sigil', passThrough, `
    #include <common>
    #include <fog_pars_fragment>
    varying vec3 vLocal;
    uniform vec3 tint;
    uniform float phase;
    uniform float strength;
    void main() {
      float radius = length(vLocal.xz);
      float angle = atan(vLocal.x, vLocal.z);
      float pulse = mix(.18, 1.01, 1.0 - pow(1.0 - phase, 2.0));
      float teeth = .016 * sin(angle * 24.0) + .008 * sin(angle * 71.0);
      float edge = exp(-abs(radius - pulse + teeth) * 58.0);
      float lattice = exp(-abs(radius - .82 + teeth) * 64.0) * pow(.5 + .5 * cos(angle * 36.0), 2.0);
      float fracture = pow(.5 + .5 * cos(angle * 9.0 + radius * 15.0 + cos(angle * 21.0) * .31), 20.0);
      fracture *= smoothstep(.17, .34, radius) * (1.0 - smoothstep(pulse, pulse + .10, radius));
      float frost = (edge * .96 + fracture * .62 + lattice * .63) * (1.0 - smoothstep(.97, 1.04, radius));
      gl_FragColor = vec4(mix(tint, vec3(.88, .99, 1.0), clamp(edge, 0.0, 1.0)), min(1.0, frost) * strength);
      ${finish}
    }
  `, tint, strength, { additive: true });
}

export function fracturedIce() {
  return frostMaterial('absolute-zero-glacial-surface', passThrough, `
    #include <common>
    #include <fog_pars_fragment>
    varying vec3 vLocal;
    uniform vec3 tint;
    uniform float strength;
    uniform float phase;
    uniform float clock;

    vec2 crystalSeed(vec2 cell) {
      vec3 p = fract(cell.xyx * vec3(.1031, .11369, .13787));
      p += dot(p, p.yzx + 19.19);
      return fract((p.xx + p.yz) * p.zy);
    }
    vec3 fracture(vec2 point) {
      vec2 cell = floor(point), local = fract(point);
      float first = 4.0, second = 4.0, color = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 id = crystalSeed(cell + offset);
        vec2 direction = offset + mix(vec2(.15), vec2(.85), id) - local;
        float distance = dot(direction, direction);
        if (distance < first) { second = first; first = distance; color = id.x; }
        else if (distance < second) second = distance;
      }
      return vec3(sqrt(second) - sqrt(first), color, sqrt(first));
    }
    void main() {
      vec2 point = vLocal.xz;
      float radius = length(point);
      float angle = atan(point.x, point.y + .0001);
      vec2 warped = point * 6.6 + vec2(sin(point.y * 27.0), sin(point.x * 23.0)) * .15;
      vec3 cells = fracture(warped);
      float aa = clamp(fwidth(cells.x) * 1.14, .008, .067);
      float rim = 1.0 - smoothstep(.04, .094 + aa, cells.x);
      float seams = 1.0 - smoothstep(.011, .022 + aa, cells.x);
      float traction = sin(point.x * 91.0 - point.y * 107.0 + sin(point.y * 64.0) * 3.4);
      float lamina = .5 + .5 * sin(point.x * 40.0 + point.y * 69.0 + cells.y * 4.0);
      float grain = pow(max(0.0, traction), 28.0) * (.16 + .37 * lamina);
      float branch = pow(.5 + .5 * cos(angle * 7.0 + radius * 5.0 + sin(radius * 29.0) * .25), 24.0);
      branch *= smoothstep(.08, .4, radius);
      float edge = mix(.16, 1.04, smoothstep(0.0, .34, phase));
      float wave = exp(-abs(radius - edge) * 30.0) * (1.0 - smoothstep(.27, .44, phase));
      vec3 base = mix(vec3(.014, .056, .13), vec3(.043, .20, .29), cells.y * .62 + lamina * .38);
      vec3 light = base * (.82 + cells.z * .33) + tint * (rim * .20 + grain * .25 + wave * .59);
      light = mix(light, vec3(.35, .86, .92), clamp(seams * .59 + branch * lamina * rim * .47, 0.0, .75));
      light += vec3(.02, .057, .096) * (1.0 + sin(clock * 2.9 + point.x * 9.0)) * rim;
      float field = (1.0 - smoothstep(.965, 1.0, radius)) * smoothstep(-.025, .065, point.y);
      float arrival = 1.0 - smoothstep(edge - .055, edge + .04, radius);
      gl_FragColor = vec4(light, field * arrival * strength * (.54 + cells.y * .16 + seams * .16));
      ${finish}
    }
  `, '#6be9f5', 1);
}

export function frostVapor() {
  return frostMaterial('absolute-zero-frost-vapor', passThrough, `
    #include <common>
    #include <fog_pars_fragment>
    varying vec2 vUv;
    uniform vec3 tint;
    uniform float strength;
    uniform float clock;
    void main() {
      vec2 p = (vUv - .5) * 2.0;
      float plume = max(0.0, 1.0 - dot(p, p));
      float sheet = .5 + .5 * sin(p.x * 4.4 + p.y * 6.5 - clock * 3.3 + .72 * sin(p.x * 6.1 + clock));
      float ripple = .5 + .5 * sin(p.x * 13.0 + p.y * 17.0 + clock * 2.2 + sin(p.y * 7.0) * 2.4);
      float wisp = .38 + .44 * sheet * sheet + .18 * sheet * ripple;
      float amount = pow(plume, 1.7) * wisp * strength;
      gl_FragColor = vec4(mix(tint, vec3(.64, .81, .94), sheet * .6), amount);
      ${finish}
    }
  `, '#62b5ef', .30);
}
