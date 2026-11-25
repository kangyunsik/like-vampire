// Short, original PCM cues. Filtering and ringing them once keeps the live mixer
// small and lets each effect have a shaped attack instead of an oscillator beep.
const RATE = 24_000, TAU = Math.PI * 2;
type Band = readonly [low: number, high: number];
type Mode = readonly [frequency: number, gain: number, decay: number];
const ice: readonly Mode[] = [[1060, .29, .047], [1837, .22, .031], [2891, .15, .022], [4183, .072, .015], [5597, .04, .008]];
const bell: readonly Mode[] = [[430, .34, .092], [945, .21, .060], [1714, .12, .044], [2516, .065, .028]];

class Take {
  readonly pcm: Float32Array;
  constructor(seconds: number, private seed: number) { this.pcm = new Float32Array(Math.ceil(seconds * RATE)); }

  air(at: number, duration: number, gain: number, from: Band, to = from, attack = .13, decay = 2.4) {
    const start = Math.round(at * RATE), end = Math.min(this.pcm.length - start, Math.floor(duration * RATE));
    const coefficient = (hz: number) => 1 - Math.exp(-TAU * hz / RATE);
    const a = coefficient(from[0]), b = coefficient(from[1]);
    const da = (coefficient(to[0]) - a) / end, db = (coefficient(to[1]) - b) / end;
    let low = 0, high = 0, low2 = 0, high2 = 0;
    for (let i = 0; i < end; i++) {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      const noise = this.seed / 0x80000000 - 1, t = i / end;
      const al = a + da * i, ah = b + db * i;
      low += (noise - low) * al; low2 += (low - low2) * al;
      high += (noise - high) * ah; high2 += (high - high2) * ah;
      const rise = Math.min(1, t / attack);
      this.pcm[start + i] += (high2 - low2) * gain * rise * (1 - t) ** decay;
    }
  }

  ring(at: number, modes: readonly Mode[], gain: number, pitch = 1) {
    const start = Math.round(at * RATE);
    for (const [hz, weight, decay] of modes) {
      const end = Math.min(this.pcm.length - start, Math.ceil(decay * 5.8 * RATE));
      const phase = TAU * hz * pitch / RATE, fall = Math.exp(-1 / (decay * RATE));
      let level = gain * weight;
      for (let i = 0; i < end; i++, level *= fall) {
        const envelope = Math.min(1, i / 104, (end - i) / 160);
        this.pcm[start + i] += Math.sin(i * phase) * level * envelope;
      }
    }
  }

  thump(at: number, duration: number, gain: number, from: number, to: number) {
    const start = Math.round(at * RATE), end = Math.min(this.pcm.length - start, Math.floor(duration * RATE));
    let phase = 0;
    for (let i = 0; i < end; i++) {
      const t = i / end;
      phase += TAU / RATE * (to + (from - to) * (1 - t) ** 4);
      this.pcm[start + i] += Math.sin(phase) * gain * Math.min(1, i / 150) * (1 - t) ** 3;
    }
  }

  chimes(notes: readonly number[], gap: number, gain: number) {
    notes.forEach((hz, i) => this.ring(i * gap, [[hz, .36, .112], [hz * 2, .14, .060], [hz * 2.996, .08, .039]], gain));
  }
}

type Design = (take: Take) => void;
const cue = (seconds: number, design: Design) => ({ seconds, design });
const snap = (s: Take, at: number, gain: number, pitch = 1) => {
  s.air(at, .066, gain * .71, [970, 5400], [410, 1550], .052);
  s.ring(at, ice, gain * .55, pitch);
};
const flame = (s: Take, at: number, duration: number, gain: number, attack = .18) => {
  s.air(at, duration, gain, [240, 3100], [83, 740], attack);
  s.air(at + .02, duration * .74, gain * .37, [90, 630], [45, 235], .24);
  for (let i = 0; i < 4; i++) s.air(at + duration * [.10, .19, .29, .44][i], .035 + i * .009,
    gain * (.43 - .07 * i), [720, 4600], [250, 1350], .09);
};
const zap = (s: Take, at: number, gain: number) => {
  s.air(at, .072, gain, [480, 3650], [175, 900], .036, 3.4);
  s.air(at + .014, .029, gain * .56, [380, 5800], [310, 1920], .035);
  s.ring(at, [[306, .23, .032], [787, .20, .024], [1751, .074, .014]], gain);
};
const snow = (weight: number, grit: number) => cue(.16, (s) => {
  s.thump(.005, .10, weight * .18, 125, 58);
  s.air(0, .137, weight * .64, [170, grit], [100, 920], .085);
  s.air(.019, .11, weight * .33, [980, grit * 1.55], [410, 1580], .22);
  s.air(.057, .08, weight * .22, [240, 2300], [120, 800], .25);
});

const BANK = {
  'ice-bolt': cue(.23, (s) => { s.air(0, .18, .71, [560, 2200], [240, 4900], .36); snap(s, .036, .61); }),
  'ice-lance': cue(.28, (s) => { s.air(0, .24, .93, [810, 2950], [370, 3830], .24); snap(s, .042, .84, .78); }),
  'ice-sweep': cue(.49, (s) => {
    s.air(0, .47, 1.05, [180, 2340], [215, 1380], .27, 1.6);
    s.air(.043, .34, .60, [540, 4170], [160, 1500], .41);
    snap(s, .154, .51, .91); snap(s, .203, .29, 1.24);
  }),
  'ice-ward': cue(.33, (s) => { s.ring(.017, bell, .76, 1.38); s.air(0, .24, .62, [380, 2240], [230, 1710], .28); }),
  'ice-heavy': cue(.56, (s) => {
    s.thump(.096, .33, .38, 139, 59);
    s.air(0, .55, 1.32, [95, 1920], [67, 650], .31);
    snap(s, .095, .78, .69); snap(s, .171, .42, 1.12);
  }),
  'ice-hit': cue(.13, (s) => { s.thump(0, .069, .21, 178, 87); snap(s, 0, .47, 1.18); }),
  'ice-impact': cue(.43, (s) => {
    s.thump(0, .27, .62, 142, 50);
    s.air(0, .31, 1.18, [110, 3930], [55, 930], .055);
    snap(s, .012, 1, .84); snap(s, .076, .54, 1.17); snap(s, .121, .27, 1.46);
  }),
  'fire-bolt': cue(.23, (s) => { s.thump(.028, .15, .23, 160, 69); flame(s, 0, .22, .88, .23); }),
  'fire-ward': cue(.36, (s) => { flame(s, .01, .35, .95, .26); s.ring(.084, bell, .62, .76); }),
  'fire-sweep': cue(.51, (s) => { flame(s, 0, .47, 1.36, .32); s.thump(.065, .28, .31, 132, 61); }),
  'fire-heavy': cue(.61, (s) => { flame(s, 0, .59, 1.49, .26); s.thump(.048, .41, .54, 121, 43); }),
  'fire-blast': cue(.38, (s) => {
    s.thump(0, .255, .59, 174, 55); flame(s, 0, .34, 1.61, .066);
    s.air(.003, .052, .80, [540, 5300], [150, 1830], .037);
  }),
  'ember-hit': cue(.15, (s) => { s.thump(0, .10, .32, 144, 72); flame(s, 0, .126, .58, .088); }),
  'flame-impact': cue(.45, (s) => { flame(s, 0, .42, 1.28, .09); s.thump(0, .32, .58, 121, 46); }),
  'meteor-impact': cue(.74, (s) => {
    s.thump(0, .58, .72, 99, 37); s.thump(.12, .45, .26, 74, 42);
    flame(s, .007, .62, 1.42, .058);
    s.air(.044, .67, 1.2, [52, 771], [31, 263], .11, 1.8);
  }),
  'arc-first': cue(.19, (s) => { zap(s, 0, 1.23); zap(s, .035, .45); s.thump(0, .16, .39, 174, 56); }),
  'arc-hop': cue(.085, (s) => zap(s, 0, .93)),
  'charge-ready': cue(.31, (s) => { zap(s, .02, .32); s.chimes([462, 693], .069, .69); }),
  'warning-elite': cue(.37, (s) => { s.ring(0, bell, 1.31, 1.72); s.ring(.129, bell, 1, 1.26); }),
  'warning-boss': cue(.49, (s) => {
    s.ring(.01, bell, 1.36, .63); s.ring(.16, bell, 1.22, .89);
    s.air(.04, .37, .85, [104, 460], [155, 1420], .47); s.thump(.14, .26, .39, 110, 65);
  }),
  'warning-charge': cue(.63, (s) => {
    s.air(0, .60, 1.40, [92, 680], [310, 2320], .53, 1.1);
    s.ring(.05, bell, 1.02, .51); s.ring(.235, bell, 1.32, .79); s.ring(.392, bell, .65, 1.05);
  }),
  'blast-elite': cue(.24, (s) => { s.thump(0, .19, .58, 149, 58); s.air(0, .24, 1.3, [176, 2880], [64, 660], .07); }),
  'blast-boss': cue(.46, (s) => { s.thump(0, .42, .68, 119, 41); s.air(0, .45, 1.41, [90, 2540], [57, 814], .08); }),
  'blast-charge': cue(.51, (s) => { s.thump(.027, .38, .70, 106, 43); s.air(0, .51, 1.42, [164, 3270], [65, 665], .18); }),
  'snow-left': snow(.84, 3320), 'snow-right': snow(.78, 2830),
  block: cue(.26, (s) => { s.thump(0, .12, .34, 216, 95); s.ring(0, bell, .87, 1.16); }),
  hurt: cue(.24, (s) => { s.thump(0, .23, .69, 121, 53); s.air(0, .169, .83, [105, 1210], [72, 524], .071); }),
  collect: cue(.19, (s) => s.ring(0, [[784, .40, .049], [1568, .17, .034], [2840, .075, .027]], .61)),
  wave: cue(.45, (s) => { s.thump(0, .30, .55, 93, 51); s.chimes([262, 349, 440], .083, .82); }),
  level: cue(.63, (s) => s.chimes([392, 494, 587, 784], .076, 1.15)),
  start: cue(.53, (s) => s.chimes([294, 440, 587], .097, .88)),
  win: cue(.91, (s) => s.chimes([330, 440, 587, 740, 880], .102, 1.16)),
  lose: cue(.67, (s) => s.chimes([392, 311, 196], .116, .93)),
};

export type AudioCue = keyof typeof BANK;

export function makeAudioCue(context: AudioContext, cue: AudioCue) {
  const { seconds, design } = BANK[cue];
  const take = new Take(seconds, [...cue].reduce((seed, letter) => Math.imul(seed, 31) + letter.charCodeAt(0), 5279));
  design(take);
  const buffer = context.createBuffer(1, take.pcm.length, RATE);
  // Soft-limit short transients; do not normalize quiet steps to the level of an impact.
  for (let i = 0; i < take.pcm.length; i++) {
    const value = take.pcm[i], fade = Math.min(1, (take.pcm.length - i - 1) / 128);
    take.pcm[i] = value / (1 + .68 * Math.abs(value)) * fade;
  }
  buffer.getChannelData(0).set(take.pcm);
  return buffer;
}
