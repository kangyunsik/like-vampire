import * as T from 'three';

export const effectDisc = new T.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
export const effectFan = new T.CircleGeometry(1, 48, Math.PI, Math.PI).rotateX(-Math.PI / 2);
export const effectPlane = new T.PlaneGeometry(2, 2);

const end = `
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const fog = '#include <fog_pars_fragment>';
const vertex = (deform = '') => `
  #include <common>
  #include <fog_pars_vertex>
  uniform float clock;
  uniform float variant;
  varying vec3 objectPoint;
  varying vec2 texel;
  varying vec3 eye;
  varying vec3 face;
  void main() {
    vec3 p = position, n = normal;
    ${deform}
    objectPoint = position;
    texel = uv;
    vec4 vertexPoint = vec4(p, 1.0);
    #ifdef USE_INSTANCING
      mat3 basis = mat3(instanceMatrix);
      n = basis * (n / max(vec3(.000001), vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2]))));
      vertexPoint = instanceMatrix * vertexPoint;
    #endif
    vec4 mvPosition = modelViewMatrix * vertexPoint;
    eye = -mvPosition.xyz;
    face = normalMatrix * n;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const surfaceVertex = vertex();
const noise = `
  float hash(vec2 p) {
    vec3 q = fract(p.xyx * vec3(.1031, .11369, .13787));
    q += dot(q, q.yzx + 19.19);
    return fract((q.x + q.y) * q.z);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), t = fract(p);
    t = t * t * (3.0 - 2.0 * t);
    return mix(mix(hash(i), hash(i + vec2(1,0)), t.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), t.x), t.y);
  }
`;

export type Etching = 'rime' | 'lattice' | 'portal' | 'seal' | 'slag' | 'fan' | 'spiral' | 'crater' | 'eclipse' | 'brand';
const etchIndex: Record<Etching, number> = {
  rime: 0, lattice: 1, portal: 2, seal: 3, slag: 4, fan: 5, spiral: 6, crater: 7, eclipse: 8, brand: 9,
};

function material(name: string, vertexShader: string, fragmentShader: string, tint: string, core: string,
  variant: number, strength: number, blending: T.Blending = T.NormalBlending, solid = false) {
  return new T.ShaderMaterial({
    name, vertexShader, fragmentShader, transparent: !solid, depthWrite: solid, fog: true,
    side: solid ? T.FrontSide : T.DoubleSide, blending, forceSinglePass: true,
    uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
      tint: { value: new T.Color(tint) }, core: { value: new T.Color(core) },
      clock: { value: 0 }, phase: { value: 0 }, strength: { value: strength }, variant: { value: variant },
    }]),
  });
}

// A partial surface: draw only the etched filaments, pools, or filigree that belong to the spell.
export function etchedSurface(pattern: Etching, tint: string, core: string, strength: number, vertical = false) {
  const shader = material(`etched-${pattern}`, surfaceVertex, `
    #include <common>
    ${fog}
    ${noise}
    varying vec3 objectPoint;
    uniform vec3 tint, core;
    uniform float clock, phase, strength, variant;
    float line(float x, float width) { return exp(-abs(x) / width); }
    void main() {
      vec2 p = ${vertical ? 'objectPoint.xy' : 'objectPoint.xz'};
      float r = length(p), a = atan(p.x, p.y + .0001);
      float coarse = noise2(p * 4.6), fine = noise2(p * 25.0 + coarse * 3.5);
      float glow = 0.0, bed = 0.0, detail = 0.0;
      if (variant < .5) {
        // Frost: six feathered crystal axes with irregular side veins.
        float arm = pow(.5 + .5 * cos(a * 6.0), 18.0);
        detail = pow(.5 + .5 * cos(a * 12.0 + r * 27.0 + fine), 14.0) * arm;
        float sweep = mix(.24, 1.0, min(1.0, phase * 2.6));
        glow = line(r - sweep + .030 * (fine - .5), .020) * .60 + arm * .34 + detail * .55;
        bed = .37 * (arm + detail) * smoothstep(.04, .40, r);
      } else if (variant < 1.5) {
        float mesh = max(abs(p.x), dot(abs(p), vec2(.50, .866)));
        glow = line(mesh - .72, .016) * .76 + line(mesh - .52, .014) * .39;
        detail = pow(.5 + .5 * cos(a * 24.0), 6.0) * line(r - .87, .026);
        bed = .18 * (1.0 - mesh) * (.45 + fine);
      } else if (variant < 2.5) {
        float saddle = sin(a * 8.0 + clock * 6.7) * .034;
        glow = line(r - .79 + saddle, .019) * (.52 + coarse * .48);
        detail = line(r - .68 - saddle, .031) * pow(.5 + .5 * cos(a * 5.0 - clock * 2.0), 2.0);
        bed = .24 * smoothstep(.15, .67, r) * (1.0 - r);
      } else if (variant < 3.5) {
        float triangles = cos(floor(.5 + a * 3.0 / PI) * PI / 3.0 - a) * r;
        glow = line(triangles - .61, .014) * .85 + line(r - .8, .011) * .69;
        detail = pow(.5 + .5 * cos(a * 12.0 - clock * 2.0), 8.0) * (line(r - .91, .025) + .4 * line(r - .35, .017));
        bed = .14 * (1.0 - r) * coarse;
      } else if (variant < 4.5) {
        // Hot vents and lava seams. Dark slag behind the heat keeps the surface readable on snow.
        float plates = noise2(p * 7.0 + noise2(p * 13.0) * .46);
        float cracks = line(plates - .52, .028) * (.54 + .46 * fine);
        float glowBand = .73 + .27 * sin(r * 16.0 - clock * 6.4 + coarse * 4.7);
        glow = cracks * glowBand * (.35 + coarse * .45);
        detail = line(r - .91 + (coarse - .5) * .067, .016) * .37;
        bed = .34 * (.70 + coarse * .4);
      } else if (variant < 5.5) {
        float stream = pow(.5 + .5 * cos(a * 9.0 + r * 9.0 + 1.5 * sin(r * 7.0)), 12.0);
        float lead = mix(.15, 1.12, pow(phase, .54));
        glow = stream * line(r - lead, .14) * .95;
        detail = stream * line(r - lead + .20, .11) * .57;
        bed = .22 * stream * smoothstep(.21, .7, p.y);
      } else if (variant < 6.5) {
        float ribbon = pow(.5 + .5 * cos(a * 3.0 - r * 15.0 + clock * 7.0 + fine * .44), 8.0);
        glow = ribbon * (line(r - .66, .30) + .42 * line(r - .88, .028));
        detail = line(r - .41, .022) * pow(.5 + .5 * sin(a * 5.0), 8.0);
        bed = .22 * ribbon * (1.0 - .5 * coarse);
      } else if (variant < 7.5) {
        // Meteor: concentric broken terraces and molten radial fractures.
        float fracture = pow(.5 + .5 * cos(a * 11.0 + coarse * 5.8 + r * 7.2), 21.0);
        glow = line(r - .57 + coarse * .18, .018) * (.38 + fine * .51);
        detail = fracture * line(r - .42, .36) * smoothstep(.23, .35, r);
        bed = (.46 + coarse * .17) * (1.0 - smoothstep(.19, 1.0, r));
      } else if (variant < 8.5) {
        float flare = max(0.0, sin(a * 7.0 + r * 7.0 + clock * 4.0)) * .19 + coarse * .07;
        float wave = mix(.16, 1.04, 1.0 - (1.0 - phase) * (1.0 - phase));
        glow = line(r - wave + flare, .047) + .47 * line(r - wave + flare + .17, .018);
        detail = pow(.5 + .5 * cos(a * 23.0 + coarse * 3.3), 9.0) * line(r - wave, .18);
        bed = .22 * (1.0 - r * r) * coarse;
      } else {
        // Stamped runes: a split diamond with small serrations burns down to a soft edge.
        float s = (abs(p.x) + abs(p.y)) * .79;
        glow = line(s - .54, .016) * .86 + line(s - .74, .029) * .47;
        detail = pow(.5 + .5 * cos(a * 16.0 - clock * 2.0), 10.0) * line(r - .81, .067);
        bed = .13 * (1.0 - r) * coarse;
      }
      float edge = 1.0 - smoothstep(.936, 1.0, r);
      float bright = min(1.0, glow * .88 + detail * .80);
      vec3 dark = variant < 4.0 ? vec3(.016, .047, .095) : vec3(.097, .024, .016);
      vec3 rgb = mix(dark, mix(tint, core, clamp(detail * .65 + glow * .35, 0.0, .85)), bright);
      gl_FragColor = vec4(rgb, clamp(bed + bright * .90, 0.0, 1.0) * edge * strength);
      ${end}
    }
  `, tint, core, etchIndex[pattern], strength);
  return shader;
}

export type RibbonStroke = { points: readonly T.Vector3[]; width: number; start?: number; end?: number };
export function crossedStrips(strokes: readonly RibbonStroke[], origin: T.Vector3) {
  const coordinates: number[] = [], uv: number[] = [], indices: number[] = [];
  const tangent = new T.Vector3(), side = new T.Vector3(), across = new T.Vector3(), q = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  for (const stroke of strokes) {
    const { points, width, start = 0, end = 1 } = stroke;
    if (points.length < 2) continue;
    for (let plane = 0; plane < 2; plane++) {
      const offset = coordinates.length / 3;
      for (let i = 0; i < points.length; i++) {
        tangent.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]).normalize();
        side.crossVectors(tangent, up);
        if (side.lengthSq() < .01) side.set(1, 0, 0);
        else side.normalize();
        across.copy(side);
        if (plane) across.crossVectors(tangent, side).normalize();
        const along = i / (points.length - 1), taper = .27 + Math.sin(Math.PI * along) * .73;
        for (const sign of [-1, 1]) {
          q.copy(points[i]).sub(origin).addScaledVector(across, sign * width * taper);
          coordinates.push(q.x, q.y, q.z);
          uv.push((sign + 1) * .5, start + (end - start) * along);
        }
        if (!i) continue;
        const a = offset + (i - 1) * 2, b = a + 2;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return new T.BufferGeometry()
    .setAttribute('position', new T.Float32BufferAttribute(coordinates, 3))
    .setAttribute('uv', new T.Float32BufferAttribute(uv, 2)).setIndex(indices);
}

export function streamingRibbon(tint: string, core: string, strength = .8, electric = false, traveling = false) {
  return material('element-stream', surfaceVertex, `
    #include <common>
    ${fog}
    varying vec2 texel;
    uniform vec3 tint, core;
    uniform float strength, phase, clock, variant;
    void main() {
      float along = texel.y, offset = texel.x - .5;
      float thread = exp(-abs(offset + .055 * sin(along * 18.0 - clock * 10.0)) * (variant > .5 ? 25.0 : 13.0));
      float edge = max(0.0, 1.0 - abs(offset) * 2.0);
      float filaments = pow(.5 + .5 * sin(offset * 34.0 - along * 29.0 + clock * 13.0), 5.0) * edge;
      float pulse = .64 + .36 * sin(along * (variant > .5 ? 68.0 : 25.0) - clock * 35.0);
      float lead = mix(.07, 1.19, clamp(phase * 4.0, 0.0, 1.0));
      float mask = ${traveling ? 'smoothstep(0.0, .18, along) * (1.0 - smoothstep(.88, 1.0, along))' : '1.0 - smoothstep(lead, lead + .12, along)'};
      float light = (edge * edge * .37 + thread * .53 + filaments * .31) * mask;
      gl_FragColor = vec4(mix(tint, core, clamp(thread * .78 + filaments * .51, 0.0, 1.0)), light * (.72 + pulse * .28) * strength);
      ${end}
    }
  `, tint, core, electric ? 1 : 0, strength, T.AdditiveBlending);
}

export const torchTrail = crossedStrips([{ points: [new T.Vector3(0, 0, -1), new T.Vector3(0, 0, -.38), new T.Vector3()], width: .66 }], new T.Vector3());

export function moltenCore(large = false) {
  return material(large ? 'molten-meteor' : 'molten-fireball', surfaceVertex, `
    #include <common>
    ${fog}
    ${noise}
    varying vec3 objectPoint, eye, face;
    uniform vec3 tint, core;
    uniform float clock, variant;
    void main() {
      vec3 n = normalize(face), v = normalize(eye);
      vec2 a = objectPoint.xy + objectPoint.z * vec2(.45, -.62);
      float vein = noise2(a * 4.6 + vec2(noise2(a * 12.1 + clock * .29)) * .78);
      float ash = noise2(a * 24.0 + vec2(0.0, clock * .52));
      float lava = 1.0 - smoothstep(.020, .15, abs(vein - .50 + sin(clock * 3.4 + ash * 4.0) * .031));
      float rim = pow(1.0 - max(0.0, dot(v, n)), 2.0);
      float lit = max(0.0, dot(n, normalize(vec3(-.48, .80, .21))));
      vec3 crust = mix(vec3(.065, .016, .025), vec3(.24, .064, .029), lit * .7 + ash * .3);
      vec3 heat = mix(tint, core, clamp(.19 + ash * .47 + lava * .19, 0.0, 1.0));
      vec3 color = mix(crust, heat, clamp(lava * .91 + rim * .57 + (1.0 - variant) * .29, 0.0, 1.0));
      gl_FragColor = vec4(color, 1.0);
      ${end}
    }
  `, large ? '#ff713c' : '#ffad5d', large ? '#ffe4a4' : '#fff0bd', large ? 1 : 0, 1, T.NormalBlending, true);
}

export function livingWings() {
  return material('phoenix-feather-fire', vertex(`
    p.y += pow(abs(p.x), 1.34) * sin(clock * 22.0 - abs(p.x) * 1.2) * .42;
    p.z -= abs(p.x) * sin(clock * 21.3) * .14;
  `), `
    #include <common>
    ${fog}
    ${noise}
    varying vec3 objectPoint;
    uniform vec3 tint, core;
    uniform float clock;
    void main() {
      vec2 p = objectPoint.xz;
      float feature = abs(p.x) * 14.3 + p.y * 18.0 + noise2(p * 7.6) * .74;
      float feather = pow(.5 + .5 * cos(feature + clock * 6.0), 7.0);
      float tail = smoothstep(-.74, .52, p.y);
      float heat = clamp((1.0 - abs(p.x)) * .36 + feather * .55 + tail * .12, 0.0, 1.0);
      vec3 rgb = mix(mix(vec3(.34, .04, .058), tint, tail * .74 + feather * .20), core, heat);
      gl_FragColor = vec4(rgb, .60 + heat * .35);
      ${end}
    }
  `, '#ff6935', '#ffeeb0', 0, 1);
}

export function elementalWard(fire: boolean) {
  return material(fire ? 'blazing-ward-scales' : 'ice-ward-plates', surfaceVertex, `
    #include <common>
    ${fog}
    ${noise}
    varying vec3 objectPoint, eye, face;
    uniform vec3 tint, core;
    uniform float clock, strength, variant;
    void main() {
      vec3 n = normalize(face), v = normalize(eye);
      vec3 p = normalize(objectPoint);
      float fresnel = pow(1.0 - max(0.0, dot(v, n)), 2.7);
      float a = atan(p.x, p.z);
      float row = (p.y + 1.0) * (variant > .5 ? 6.0 : 4.0);
      vec2 hex = vec2(a / (PI * 2.0) * 12.0 + mod(floor(row), 2.0) * .5, row);
      vec2 tile = abs(fract(hex) - .5);
      float outline = max(tile.x, dot(tile, vec2(.58, .89)));
      float seam = smoothstep(.46, .52, outline);
      float grain = noise2(hex * (variant > .5 ? 6.5 : 3.8));
      float pulse = pow(.5 + .5 * sin(p.y * 7.6 - clock * 5.9 + grain * 1.7), 7.0);
      float glint = seam * (.37 + pulse * .48);
      float plume = variant * pow(.5 + .5 * sin(a * 7.0 + p.y * 12.0 - clock * 6.0), 5.0) * (1.0 - abs(p.y));
      float alpha = (.044 + fresnel * .52 + glint * .38 + plume * .13) * strength;
      gl_FragColor = vec4(mix(tint, core, min(1.0, glint * .82 + fresnel * .64 + plume * .52)), alpha);
      ${end}
    }
  `, fire ? '#ff703a' : '#4595c8', fire ? '#ffce72' : '#d5ffff', fire ? 1 : 0, .85);
}

export function heatBillow(ash: boolean) {
  return material(ash ? 'impact-rolling-ash' : 'impact-living-flames', surfaceVertex, `
    #include <common>
    ${fog}
    ${noise}
    varying vec2 texel;
    uniform vec3 tint, core;
    uniform float clock, strength, variant;
    void main() {
      vec2 p = vec2((texel.x - .5) * 2.0, texel.y);
      float drift = noise2(vec2(p.y * 4.0, clock * 2.0)) - .5;
      p.x += drift * p.y * (variant > .5 ? .63 : 1.08);
      vec2 q = p * vec2(3.6, 4.6) + vec2(0.0, -clock * (variant > .5 ? 2.0 : 4.7));
      float broad = noise2(q), edge = noise2(q * 2.4 + broad * .56);
      float bulb = max(0.0, 1.0 - pow(abs(p.x) * (1.02 + p.y * .49), 1.7));
      float shell = bulb * sqrt(max(0.0, 1.0 - p.y)) * smoothstep(0.0, .16, p.y);
      float turbulence = broad * .64 + edge * .36;
      float mask = smoothstep(.23, .79, shell + (turbulence - .62) * .72) * strength;
      float heat = clamp(1.31 - p.y * 1.39 + (edge - .5) * .4, 0.0, 1.0);
      vec3 color = mix(tint, core, heat * (variant > .5 ? .68 : 1.0));
      gl_FragColor = vec4(color, mask);
      ${end}
    }
  `, ash ? '#491e32' : '#ff572a', ash ? '#a96b62' : '#ffecae', ash ? 1 : 0, .75);
}
