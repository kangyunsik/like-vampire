import * as T from 'three';
import { paint } from './art';

export const eyeSize = { width: .342, height: .274 };
export const expressionSize = { width: .254, height: .248 };
const eyeMaterials = new Map<string, T.MeshBasicMaterial>();
const faceImages = new Map<string, Promise<HTMLImageElement | null>>();
let expressionMaterial: T.MeshBasicMaterial | undefined;

function faceImage(name: string) {
  let request = faceImages.get(name);
  if (!request) {
    request = typeof document === 'undefined' ? Promise.resolve(null) : new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `${import.meta.env.BASE_URL}art/${name}.png`;
    });
    faceImages.set(name, request);
  }
  return request;
}

const eyeImage = (fire: boolean) => faceImage(`lumi-eye-${fire ? 'fire' : 'ice'}`);
const mouthImage = () => faceImage('lumi-mouth');
export const approvedExpression = (fire: boolean) => Promise.all([eyeImage(fire), mouthImage()]).then(([eye]) => eye);

function pencil(ctx: CanvasRenderingContext2D, size: number, bounds: typeof eyeSize) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.setTransform(size / bounds.width, 0, 0, -size / bounds.height, size / 2, size / 2);
  const fill = (color: string | CanvasGradient, path: () => void) => {
    ctx.beginPath();
    path();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const line = (color: string, width: number, path: () => void) => {
    ctx.beginPath();
    path();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  const oval = (color: string | CanvasGradient, x: number, y: number, rx: number, ry: number, angle = 0) =>
    fill(color, () => { ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); });
  const gradient = (top: number, bottom: number, colors: [number, string][]) => {
    const ink = ctx.createLinearGradient(0, top, 0, bottom);
    for (const [stop, color] of colors) ink.addColorStop(stop, color);
    return ink;
  };
  return { fill, line, oval, gradient };
}

function drawEye(ctx: CanvasRenderingContext2D, size: number, side: number, fire: boolean, closed: boolean, original?: HTMLImageElement) {
  const { fill, line, oval, gradient } = pencil(ctx, size, eyeSize);
  ctx.scale(.84, .79);
  const liner = fire ? '#542e44' : '#423052';
  const brows = gradient(.154, .11, [[0, fire ? '#aa6f81' : '#7e75a4'], [1, '#b2849a']]);
  fill(brows, () => {
    ctx.moveTo(-.106, .115);
    ctx.bezierCurveTo(-.053, .154, .032, .167, .117, .135);
    ctx.bezierCurveTo(.025, .155, -.039, .139, -.092, .114);
    ctx.quadraticCurveTo(-.101, .110, -.106, .115);
  });

  if (closed) {
    fill(liner, () => {
      ctx.moveTo(-.145, -.008);
      ctx.bezierCurveTo(-.088, -.060, .040, -.071, .124, -.020);
      ctx.quadraticCurveTo(.151, -.005, .170, .017);
      ctx.bezierCurveTo(.122, -.073, -.058, -.092, -.145, -.008);
    });
    return;
  }
  if (original) {
    // Preserve the printed iris, tuck at the eye corner and original fine lashes.
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(original, -.189, -.158, .377, .306);
    ctx.restore();
    return;
  }

  const opening = () => {
    ctx.moveTo(-.148, -.017);
    ctx.bezierCurveTo(-.098, .063, -.049, .101, .019, .092);
    ctx.bezierCurveTo(.068, .087, .119, .074, .147, .036);
    ctx.bezierCurveTo(.129, -.020, .082, -.065, .015, -.077);
    ctx.bezierCurveTo(-.051, -.087, -.112, -.062, -.148, -.017);
    ctx.closePath();
  };
  line('#ab68834f', .0027, () => {
    ctx.moveTo(-.095, .078);
    ctx.bezierCurveTo(-.039, .117, .055, .134, .116, .091);
  });
  fill(gradient(.099, -.082, [[0, '#a88caa'], [.37, '#e9d8ec'], [.78, '#fff4f7'], [1, '#ffebef']]), opening);
  ctx.save();
  ctx.beginPath();
  opening();
  ctx.clip();

  const x = -.007, y = .010;
  const ink = gradient(.115, -.095, fire
    ? [[0, '#552943'], [.36, '#99435e'], [.66, '#e38d66'], [.91, '#ffd08a'], [1, '#ffeac5']]
    : [[0, '#322d65'], [.34, '#5552ac'], [.62, '#768ce4'], [.88, '#aecdff'], [1, '#e8ebff']]);
  oval(gradient(.114, -.087, [[0, '#3b274d'], [.66, fire ? '#935367' : '#5d61ad'], [1, '#bb87aa']]),
    x, y, .095, .099, -.045);
  oval(ink, x, y + .001, .090, .095, -.045);
  for (let i = 0; i < 27; i++) {
    const a = Math.PI * (1 + i / 26), dx = Math.cos(a), dy = Math.sin(a);
    const r = .55 + .18 * Math.sin(i * 2.27);
    line(i % 3 === 0 ? (fire ? '#923d5568' : '#46388963') : (fire ? '#fff1bc91' : '#dfecff88'), .0017, () => {
      ctx.moveTo(x + dx * .090 * r, y + dy * .092 * r);
      ctx.quadraticCurveTo(x + dx * .075 + .003, y + dy * .073, x + dx * .087, y + dy * .090);
    });
  }
  oval(fire ? '#6a394e' : '#524682', x - .002, .031, .031, .059, -.055);
  oval(gradient(.077, -.015, [[0, '#2f2348'], [1, fire ? '#813d55' : '#685bae']]), x - .002, .034, .022, .048, -.055);
  const gleam = x - side * .031;
  oval('#fffafe', gleam, .059, .012, .016, side * -.31);
  oval(fire ? '#fff3d4' : '#edf8ff', gleam - side * .019, .034, .0049, .0058);
  oval('#f7faffdc', x + side * .045, -.050, .012, .0059, side * -.49);
  oval('#ffffffb5', x + side * .018, -.067, .0044, .004);
  ctx.restore();

  line('#91516d82', .0030, () => {
    ctx.moveTo(.135, .014);
    ctx.bezierCurveTo(.093, -.051, .047, -.080, -.020, -.077);
  });
  fill(gradient(.112, -.024, [[0, liner], [.62, liner], [1, '#925b72']]), () => {
    ctx.moveTo(-.157, -.023);
    ctx.bezierCurveTo(-.105, .077, -.049, .116, .018, .110);
    ctx.bezierCurveTo(.082, .105, .123, .083, .149, .055);
    ctx.quadraticCurveTo(.163, .047, .182, .060);
    ctx.quadraticCurveTo(.173, .043, .146, .030);
    ctx.bezierCurveTo(.114, .069, .061, .083, .019, .091);
    ctx.bezierCurveTo(-.047, .102, -.101, .059, -.157, -.023);
  });
  for (const [x, y, dx, dy] of [[.106, .083, .023, .029], [.134, .060, .028, .035]]) {
    fill(liner, () => {
      ctx.moveTo(x - .006, y);
      ctx.quadraticCurveTo(x + dx * .61, y + dy * .43, x + dx, y + dy);
      ctx.quadraticCurveTo(x + dx * .72, y + dy * .14, x + .006, y - .003);
    });
  }
  line('#8c517a80', .0032, () => {
    ctx.moveTo(.109, -.039);
    ctx.quadraticCurveTo(.121, -.044, .128, -.041);
  });
}

export function eyeArt(side: number, fire: boolean, closed: boolean) {
  const key = `${side}/${fire}/${closed}`;
  let material = eyeMaterials.get(key);
  if (!material) {
    material = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    if (typeof document !== 'undefined') {
      const size = 384;
      const map = paint(size, (ctx) => drawEye(ctx, size, side, fire, closed));
      material.map = map;
      if (!closed) void eyeImage(fire).then((image) => {
        const ctx = (map.image as HTMLCanvasElement).getContext('2d');
        if (!image || !ctx) return;
        drawEye(ctx, size, side, fire, closed, image);
        map.needsUpdate = true;
      });
    } else material.opacity = 0;
    eyeMaterials.set(key, material);
  }
  return material;
}

export function expressionArt() {
  if (!expressionMaterial) {
    expressionMaterial = new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const draw = (ctx: CanvasRenderingContext2D, size: number, original?: HTMLImageElement) => {
      const { fill, oval, gradient, line } = pencil(ctx, size, expressionSize);
      // These wisps of color sit on the sculpted tip rather than replacing it.
      fill(gradient(.083, .053, [[0, '#fff9f0cb'], [.58, '#fff9f0a1'], [1, '#fff9f008']]), () => {
        ctx.moveTo(-.019, .072);
        ctx.bezierCurveTo(-.013, .081, .009, .085, .006, .075);
        ctx.bezierCurveTo(.004, .067, -.006, .055, -.009, .055);
        ctx.quadraticCurveTo(-.016, .062, -.019, .072);
      });
      line('#ab658b38', .0029, () => {
        ctx.moveTo(.018, .050);
        ctx.quadraticCurveTo(.023, .046, .021, .039);
      });
      if (original) {
        ctx.save();
        ctx.scale(1, -1);
        ctx.drawImage(original, -.110, .029, .216, .060);
        ctx.restore();
        return;
      }
      oval('#f4bec352', .001, -.065, .051, .022, .05);
      fill(gradient(-.041, -.073, [[0, '#8c4864'], [.62, '#a54e6a'], [1, '#c77b8c']]), () => {
        ctx.moveTo(-.077, -.042);
        ctx.bezierCurveTo(-.041, -.052, .040, -.052, .082, -.034);
        ctx.bezierCurveTo(.068, -.056, .029, -.073, -.006, -.073);
        ctx.bezierCurveTo(-.038, -.074, -.067, -.060, -.077, -.042);
      });
      fill(gradient(-.048, -.068, [[0, '#f6cbd9'], [.70, '#fff2f1'], [1, '#fadddf']]), () => {
        ctx.moveTo(-.050, -.049);
        ctx.quadraticCurveTo(.007, -.056, .054, -.046);
        ctx.bezierCurveTo(.033, -.062, .015, -.067, -.010, -.067);
        ctx.quadraticCurveTo(-.034, -.064, -.050, -.049);
      });
      line('#ffe2e694', .0031, () => {
        ctx.moveTo(-.021, -.082);
        ctx.quadraticCurveTo(-.003, -.086, .018, -.081);
      });
    };
    if (typeof document !== 'undefined') {
      const map = paint(384, draw);
      expressionMaterial.map = map;
      void mouthImage().then((image) => {
        const ctx = (map.image as HTMLCanvasElement).getContext('2d');
        if (!image || !ctx) return;
        draw(ctx, 384, image);
        map.needsUpdate = true;
      });
    } else expressionMaterial.opacity = 0;
  }
  return expressionMaterial;
}
