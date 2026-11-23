import type { Spell } from './data';
import type { CombatEvent } from './combat';

type Sound = Spell | 'block' | 'collect' | 'hurt' | 'wave' | 'level' | 'start' | 'win' | 'lose' | 'hot-streak' | 'frost-crit-freeze'
  | 'ice-hit' | 'ember-hit' | 'ice-impact' | 'flame-impact' | 'meteor-impact' | 'warning-boss' | 'warning-elite' | 'warning-charge'
  | 'blast-boss' | 'blast-elite' | 'blast-charge';
type Note = readonly [from: number, to: number, duration: number, gain: number, wave?: OscillatorType];

const NOTES: Record<Sound, readonly Note[]> = {
      bolt: [[710, 330, .16, .07, 'triangle'], [1180, 680, .12, .024]],
      nova: [[220, 110, .4, .15, 'triangle'], [551, 920, .35, .07]],
      lance: [[760, 118, .24, .13, 'triangle'], [1240, 860, .17, .056]],
      blizzard: [[182, 255, .65, .073], [315, 220, .4, .045, 'triangle']],
      blink: [[340, 1100, .24, .11], [522, 1050, .24, .056, 'triangle']],
      barrier: [[280, 580, .32, .085, 'triangle'], [880, 1120, .22, .050]],
      orb: [[440, 225, .40, .095, 'triangle'], [660, 480, .30, .038]],
      comet: [[980, 280, .34, .10, 'triangle'], [1510, 760, .24, .045]],
      fireball: [[570, 180, .21, .09, 'triangle'], [910, 495, .16, .036]],
      fireBlast: [[180, 80, .20, .13, 'triangle'], [1220, 560, .13, .048]],
      pyro: [[330, 90, .39, .15, 'triangle'], [720, 195, .29, .065]],
      flamestrike: [[135, 72, .52, .15, 'triangle'], [530, 205, .34, .067]],
      livingBomb: [[470, 760, .30, .080], [775, 1130, .20, .034]],
      combustion: [[260, 410, .38, .11, 'triangle'], [520, 820, .40, .066]],
      fireBarrier: [[300, 550, .28, .091, 'triangle'], [725, 1050, .22, .049]],
      frostChain: [[880, 520, .22, .072, 'triangle'], [1240, 1000, .21, .052], [1680, 1280, .19, .04]],
      frostGale: [[632, 296, .32, .098, 'triangle'], [1150, 710, .23, .032]],
      auroraStrike: [[1810, 560, .19, .076, 'triangle'], [202, 75, .36, .11], [920, 735, .26, .043]],
      chainLightning: [[2140, 620, .22, .12, 'triangle'], [1460, 1020, .31, .066], [224, 69, .37, .126, 'triangle']],
      iceBloom: [[370, 720, .35, .07], [1030, 614, .22, .05, 'triangle']],
      whiteout: [[190, 128, .68, .076, 'triangle'], [398, 550, .49, .047]],
      winterMoon: [[293, 349, .5, .073], [587, 698, .35, .05], [880, 1048, .24, .036]],
      absoluteZero: [[116, 68, .75, .14, 'triangle'], [530, 262, .62, .07], [1620, 940, .38, .045]],
      emberFan: [[500, 206, .32, .1, 'triangle'], [745, 270, .26, .055]],
      flashpoint: [[240, 89, .25, .12, 'triangle'], [1410, 560, .18, .055]],
      phoenix: [[285, 400, .51, .088, 'triangle'], [649, 980, .35, .047]],
      supernova: [[142, 46, .80, .16, 'triangle'], [590, 122, .60, .077], [920, 370, .35, .05]],
      rimeVolley: [[810, 430, .19, .085, 'triangle'], [1190, 590, .19, .05], [1560, 850, .16, .035]],
      frostBind: [[670, 810, .23, .073], [1130, 940, .27, .044, 'triangle']],
      glacierWall: [[267, 142, .40, .09, 'triangle'], [692, 835, .36, .058], [1350, 770, .23, .035]],
      glacialCollapse: [[212, 83, .56, .14, 'triangle'], [1030, 430, .41, .086], [1460, 610, .29, .04]],
      cinderMarks: [[430, 710, .19, .068, 'triangle'], [720, 940, .22, .046]],
      emberBrand: [[425, 217, .29, .088, 'triangle'], [1100, 680, .20, .037]],
      meteor: [[240, 79, .59, .134, 'triangle'], [630, 146, .54, .067]],
      cinderVortex: [[360, 268, .47, .089, 'triangle'], [418, 784, .34, .055]],
      infernoHeart: [[169, 97, .64, .125, 'triangle'], [303, 675, .45, .073], [590, 1040, .38, .048]],
      'hot-streak': [[440, 550, .18, .075], [880, 1020, .24, .057, 'triangle']],
      'frost-crit-freeze': [[1140, 560, .17, .072, 'triangle'], [2310, 1370, .19, .055]],
      block: [[460, 210, .16, .07, 'triangle'], [1320, 990, .14, .035]],
      collect: [[980, 1650, .145, .07], [1320, 1770, .14, .044]],
      hurt: [[108, 56, .21, .18, 'triangle']],
      wave: [[440, 447, .17, .11], [548, 555, .18, .086], [654, 662, .28, .075]],
      level: [[524, 527, .21, .14], [660, 662, .23, .13], [785, 792, .31, .12], [1047, 1053, .39, .084]],
      start: [[440, 494, .19, .10], [660, 672, .25, .09], [880, 894, .36, .068]],
      win: [[523, 526, .30, .11], [659, 661, .30, .12], [784, 789, .30, .12], [1046, 1048, .55, .12]],
      lose: [[510, 390, .34, .09], [337, 330, .39, .075], [261, 230, .50, .08]],
      'ice-hit': [[1565, 1240, .10, .046], [2560, 1830, .075, .034, 'triangle']],
      'ember-hit': [[296, 145, .10, .064, 'triangle'], [790, 380, .10, .030]],
      'ice-impact': [[222, 107, .20, .096, 'triangle'], [2030, 1170, .32, .081], [2890, 1920, .17, .039]],
      'flame-impact': [[149, 59, .31, .134, 'triangle'], [488, 128, .27, .073]],
      'meteor-impact': [[88, 39, .63, .176, 'triangle'], [225, 72, .46, .105], [572, 109, .34, .054]],
      'warning-boss': [[230, 255, .23, .19, 'triangle'], [463, 613, .28, .118]],
      'warning-elite': [[1278, 1145, .15, .099, 'triangle'], [648, 520, .19, .087]],
      'warning-charge': [[193, 355, .46, .16, 'triangle'], [520, 730, .34, .12]],
      'blast-boss': [[103, 47, .38, .146, 'triangle'], [404, 194, .22, .084]],
      'blast-elite': [[209, 91, .21, .087, 'triangle'], [610, 319, .15, .048]],
      'blast-charge': [[179, 42, .45, .16, 'triangle'], [682, 180, .33, .063]],
};

type Noise = readonly [type: BiquadFilterType, start: number, end: number, length: number, gain: number];
const TEXTURE = {
  crystal: ['bandpass', 3550, 1550, .14, .16],
  frost: ['highpass', 3100, 1240, .32, .128],
  wind: ['bandpass', 950, 680, .44, .132],
  spark: ['bandpass', 2800, 930, .18, .097],
  ember: ['bandpass', 1380, 520, .18, .146],
  flare: ['bandpass', 2200, 390, .34, .18],
  stone: ['lowpass', 970, 125, .44, .24],
  distant: ['lowpass', 540, 210, .22, .16],
} as const satisfies Record<string, Noise>;
const TIMBRE: Partial<Record<Sound, keyof typeof TEXTURE>> = {
  bolt: 'crystal', lance: 'crystal', frostChain: 'crystal', frostBind: 'crystal', rimeVolley: 'crystal',
  frostGale: 'wind', auroraStrike: 'spark', chainLightning: 'spark',
  nova: 'frost', iceBloom: 'frost', comet: 'crystal', glacialCollapse: 'frost', glacierWall: 'frost', absoluteZero: 'frost',
  blizzard: 'wind', whiteout: 'wind', winterMoon: 'spark', orb: 'wind', blink: 'wind', barrier: 'spark',
  fireball: 'ember', fireBlast: 'ember', pyro: 'flare', flamestrike: 'flare', livingBomb: 'spark', combustion: 'flare',
  fireBarrier: 'ember', emberFan: 'ember', flashpoint: 'flare', phoenix: 'flare', supernova: 'stone',
  cinderMarks: 'ember', emberBrand: 'spark', meteor: 'wind', cinderVortex: 'flare', infernoHeart: 'flare',
  'ice-hit': 'spark', 'frost-crit-freeze': 'crystal', 'ember-hit': 'ember', 'ice-impact': 'frost', 'flame-impact': 'flare', 'meteor-impact': 'stone',
  'warning-charge': 'wind', 'blast-boss': 'stone', 'blast-elite': 'distant', 'blast-charge': 'flare', block: 'crystal',
};
const THROTTLE: Partial<Record<Sound, [channel: string, interval: number]>> = {
  collect: ['pickup', .085], 'ice-hit': ['hit', .10], 'ember-hit': ['hit', .10], 'ice-impact': ['impact', .115], 'frost-crit-freeze': ['frost-freeze', .19],
  'flame-impact': ['impact', .115], 'meteor-impact': ['impact', .115], 'warning-boss': ['boss-warn', .32],
  'warning-elite': ['elite-warn', .36], 'blast-boss': ['boss-blast', .23], 'blast-elite': ['elite-blast', .24],
  livingBomb: ['bomb-fuse', .09],
};
const CUES = new Set<Sound>(['wave', 'level', 'start', 'win', 'lose', 'warning-boss', 'warning-elite', 'warning-charge']);
const MASTER = .32;

export class GameAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private noise?: AudioBuffer;
  private lastSound = new Map<string, number>();

  constructor(public enabled: boolean) {}

  unlock() {
    if (!this.enabled || !window.AudioContext) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = MASTER;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -17;
      limiter.knee.value = 14;
      limiter.ratio.value = 8;
      limiter.attack.value = .005;
      limiter.release.value = .18;
      this.output.connect(limiter).connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  toggle(value = !this.enabled) {
    this.enabled = value;
    if (value) this.unlock();
    if (this.output && this.context) this.output.gain.setTargetAtTime(value ? MASTER : 0, this.context.currentTime, .02);
  }

  combat(event: CombatEvent) {
    if ('bombPower' in event && (event.bombPower ?? 1) < .06) return;
    switch (event.kind) {
      case 'cast': this.play(event.spell); break;
      case 'hurt': case 'collect': case 'level': case 'block': case 'hot-streak': this.play(event.kind); break;
      case 'frost-crit-freeze': this.play(event.kind); break;
      case 'enemy-warning': this.play(event.to ? 'warning-charge' : event.elite ? 'warning-elite' : 'warning-boss'); break;
      case 'enemy-blast': this.play(event.to ? 'blast-charge' : event.elite ? 'blast-elite' : 'blast-boss'); break;
      case 'comet-impact': this.play('ice-impact'); break;
      case 'fireburst': this.play('flame-impact'); break;
      case 'ignite-burst':
        if (event.spell !== 'livingBomb') this.play('flame-impact');
        break;
      case 'spell-impact':
        if (event.spell === 'meteor') this.play('meteor-impact');
        else if (event.spell === 'iceBloom' || event.spell === 'glacierWall') this.play('ice-impact');
        break;
      case 'strike':
        if (event.spell === 'bolt' || event.spell === 'lance') this.play('ice-hit');
        else if (event.spell === 'fireball' || event.spell === 'phoenix') this.play('ember-hit');
        break;
    }
  }

  play(sound: Sound) {
    const ctx = this.context, output = this.output;
    if (!this.enabled || !ctx || !output || ctx.state !== 'running') return;
    const time = ctx.currentTime, limit = THROTTLE[sound];
    if (limit) {
      const [channel, interval] = limit;
      if (time - (this.lastSound.get(channel) ?? -Infinity) < interval) return;
      this.lastSound.set(channel, time);
    }
    const delay = CUES.has(sound) ? .085 : .019;
    NOTES[sound].forEach(([from, to, duration, volume, type = 'sine'], i) => {
      const start = time + i * delay, end = start + duration;
      const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(to, end);
      this.envelope(envelope, volume, start, duration);
      oscillator.connect(envelope).connect(output);
      oscillator.start(start);
      oscillator.stop(end);
    });
    const texture = TIMBRE[sound];
    if (texture) this.sweepNoise(ctx, output, TEXTURE[texture], time);
  }

  private envelope(node: GainNode, volume: number, start: number, duration: number) {
    node.gain.setValueAtTime(.0001, start);
    node.gain.exponentialRampToValueAtTime(volume, start + Math.min(.015, duration * .24));
    node.gain.exponentialRampToValueAtTime(.0001, start + duration);
  }

  private sweepNoise(ctx: AudioContext, output: GainNode, [type, from, to, duration, volume]: Noise, time: number) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      let seed = 57837;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 0x80000000 - 1;
      }
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.Q.value = type === 'bandpass' ? .82 : .38;
    filter.frequency.setValueAtTime(from, time);
    filter.frequency.exponentialRampToValueAtTime(to, time + duration);
    this.envelope(gain, volume, time, duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(time, time % .5);
    source.stop(time + duration);
  }
}
