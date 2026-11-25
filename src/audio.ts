import { makeAudioCue, type AudioCue } from './audio-bank';
import { CAST_TIMES, STAFF_RELEASE_PHASE, type Spell } from './data';
import type { CombatEvent, Point } from './combat';

type SpellVoice = readonly [cue: AudioCue, pitch: number, level: number];
const SPELL_VOICE: Partial<Record<Spell, SpellVoice>> = {
  bolt: ['ice-bolt', 1.10, .72], lance: ['ice-lance', .89, .93],
  frostChain: ['ice-lance', 1.15, .82], rimeVolley: ['ice-lance', 1.27, .78], frostBind: ['ice-ward', 1.11, .70],
  frostGale: ['ice-sweep', 1.04, 1], blizzard: ['ice-sweep', .78, .78], whiteout: ['ice-sweep', .68, .94],
  nova: ['ice-sweep', 1.17, .87], blink: ['ice-sweep', 1.42, .68],
  barrier: ['ice-ward', 1, .86], winterMoon: ['ice-ward', .67, .90], orb: ['ice-sweep', 1.22, .78],
  comet: ['ice-lance', .71, .83], glacierWall: ['ice-heavy', 1.12, .75], iceBloom: ['ice-ward', .86, .81],
  auroraStrike: ['ice-heavy', 1.22, .88], glacialCollapse: ['ice-heavy', .89, .97], absoluteZero: ['ice-heavy', .72, 1.09],
  fireball: ['fire-bolt', 1.08, .75], pyro: ['fire-bolt', .70, 1.09], phoenix: ['fire-sweep', .92, .94],
  fireBarrier: ['fire-ward', 1.06, .83], combustion: ['fire-ward', .77, .99], livingBomb: ['fire-ward', 1.34, .67],
  flamestrike: ['fire-sweep', .83, .92], emberFan: ['fire-sweep', 1.22, 1],
  flashpoint: ['fire-bolt', 1.27, .77], cinderMarks: ['fire-bolt', 1.47, .70], emberBrand: ['fire-ward', 1.18, .71],
  meteor: ['fire-heavy', 1.14, .80], cinderVortex: ['fire-sweep', .74, .89],
  supernova: ['fire-heavy', .68, 1.08], infernoHeart: ['fire-heavy', .85, 1],
};
const STAFF_PROJECTILE = new Set<Spell>(['bolt', 'lance', 'fireball', 'orb', 'pyro', 'phoenix']);

type Bus = 'spell' | 'impact' | 'warning' | 'notice' | 'foley';
const BUS: Record<Bus, [gain: number, voices: number]> = {
  spell: [.60, 5], impact: [.73, 6], warning: [1, 4], notice: [.78, 5], foley: [.36, 2],
};
type Mix = {
  bus?: Bus; level?: number; pitch?: number; delay?: number; pan?: number; limit?: readonly [channel: string, interval: number];
};
const MASTER = .66;
type Listener = Point & { heading?: number };
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export class GameAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private buses = new Map<Bus, GainNode>();
  private active = new Map<Bus, number>();
  private bank = new Map<AudioCue, AudioBuffer>();
  private lastSound = new Map<string, number>();

  constructor(public enabled: boolean) {}

  unlock() {
    if (!this.enabled || !window.AudioContext) return;
    if (!this.context) {
      const context = this.context = new AudioContext();
      const output = this.output = context.createGain();
      output.gain.value = MASTER;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 12;
      limiter.ratio.value = 9;
      limiter.attack.value = .004;
      limiter.release.value = .12;
      output.connect(limiter).connect(context.destination);
      for (const bus of Object.keys(BUS) as Bus[]) {
        const channel = context.createGain();
        channel.gain.value = BUS[bus][0];
        channel.connect(output);
        this.buses.set(bus, channel);
      }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  toggle(value = !this.enabled) {
    this.enabled = value;
    if (value) this.unlock();
    if (this.output && this.context) this.output.gain.setTargetAtTime(value ? MASTER : 0, this.context.currentTime, .014);
  }

  footstep(foot: 'left' | 'right') {
    this.play(foot === 'left' ? 'snow-left' : 'snow-right', {
      bus: 'foley', pitch: .93 + Math.random() * .14, pan: foot === 'left' ? -.12 : .12, limit: ['steps', .085],
    });
  }

  combat(event: CombatEvent, listener?: Listener) {
    if ('bombPower' in event && (event.bombPower ?? 1) < .06) return;
    const impact = (cue: AudioCue, point: Point, level = 1, channel = 'impact', interval = .085) => {
      this.play(cue, { bus: 'impact', ...this.position(point, listener, level), limit: [channel, interval], pitch: .94 + Math.random() * .12 });
    };
    switch (event.kind) {
      case 'cast': {
        const voice = SPELL_VOICE[event.spell];
        if (!voice) break; // Fire Blast and Chain Lightning play on contact.
        const [cue, pitch, level] = voice;
        this.play(cue, { bus: 'spell', pitch, level, delay: STAFF_PROJECTILE.has(event.spell) ? CAST_TIMES[event.spell] * STAFF_RELEASE_PHASE : 0,
          ...(event.spell === 'livingBomb' ? { limit: ['bomb-fuse', .15] as const } : {}) });
        break;
      }
      case 'collect': this.play('collect', { limit: ['pickup', .11] }); break;
      case 'level': this.play('level'); break;
      case 'hurt': case 'block': this.play(event.kind, { bus: 'impact', limit: [event.kind, .11] }); break;
      case 'hot-streak': this.play('charge-ready', { pitch: 1.09, level: .92 }); break;
      case 'lightning-charge': this.play('charge-ready', { pitch: .94, limit: ['charge', .24] }); break;
      case 'chain-lightning-hit':
        this.play(event.hop ? 'arc-hop' : 'arc-first', { bus: 'impact', pitch: (event.charged ? 1.08 : 1) * (.88 + event.hop * .025),
          ...this.position(event, listener, event.hop ? Math.max(.46, .82 - event.hop * .026) : 1.18), limit: ['arc', .027] });
        break;
      case 'frost-crit-freeze': impact('ice-impact', event, .47, 'freeze', .19); break;
      case 'enemy-warning':
        this.play(event.to ? 'warning-charge' : event.elite ? 'warning-elite' : 'warning-boss', {
          bus: 'warning', ...this.position(event.to ?? event, listener, 1.14, .75),
          limit: [event.to ? 'charge-windup' : event.elite ? 'elite-windup' : 'boss-windup', .29],
        });
        break;
      case 'enemy-blast':
        impact(event.to ? 'blast-charge' : event.elite ? 'blast-elite' : 'blast-boss', event.to ?? event, 1, 'enemy-impact', .16);
        break;
      case 'comet-impact': impact('ice-impact', event, 1.15); break;
      case 'fireburst': impact('flame-impact', event, event.spell === 'pyro' ? 1.13 : (event.bombPower ?? 1)); break;
      case 'ignite-burst':
        if (event.spell !== 'livingBomb') impact('flame-impact', event, event.spell === 'supernova' ? 1.23 : .74);
        break;
      case 'spell-impact':
        if (event.spell === 'meteor') impact('meteor-impact', event, 1.22, 'heavy-impact');
        else if (event.spell === 'fireBlast') impact('fire-blast', event, 1.11, 'fire-blast');
        else if (event.spell === 'iceBloom' || event.spell === 'glacierWall' || event.spell === 'absoluteZero') impact('ice-impact', event);
        break;
      case 'strike':
        if (event.dot) break;
        if (event.spell === 'bolt' || event.spell === 'lance') impact('ice-hit', event, event.critical ? .73 : .49, 'hit', .11);
        else if (event.spell === 'fireball' || event.spell === 'phoenix') impact('ember-hit', event, event.critical ? .73 : .50, 'hit', .11);
        break;
    }
  }

  private position(point: Point, listener: Listener | undefined, level: number, min = .27) {
    if (!listener) return { level, pan: 0 };
    const x = point.x - listener.x, z = point.z - listener.z, heading = listener.heading ?? 0, range = Math.hypot(x, z);
    return {
      pan: clamp((-x * Math.cos(heading) + z * Math.sin(heading)) / 12, -.64, .64),
      level: level * clamp(1 / (1 + range * .056), min, 1),
    };
  }

  play(cue: AudioCue, { bus = 'notice', level = 1, pitch = 1, delay = 0, pan = 0, limit }: Mix = {}) {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const time = ctx.currentTime, voices = this.active.get(bus) ?? 0;
    if (voices >= BUS[bus][1] || (limit && time - (this.lastSound.get(limit[0]) ?? -Infinity) < limit[1])) return;
    if (limit) this.lastSound.set(limit[0], time);

    let buffer = this.bank.get(cue);
    if (!buffer) {
      buffer = makeAudioCue(ctx, cue);
      this.bank.set(cue, buffer);
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    const stereo = pan ? ctx.createStereoPanner() : undefined;
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    gain.gain.value = level;
    source.connect(gain);
    if (stereo) {
      stereo.pan.value = pan;
      gain.connect(stereo).connect(this.buses.get(bus)!);
    } else gain.connect(this.buses.get(bus)!);

    this.active.set(bus, voices + 1);
    source.addEventListener('ended', () => {
      this.active.set(bus, (this.active.get(bus) ?? 1) - 1);
      source.disconnect(); gain.disconnect(); stereo?.disconnect();
    }, { once: true });
    source.start(time + delay);

    if (bus === 'warning') {
      for (const background of ['spell', 'foley'] as const) {
        const channel = this.buses.get(background)!.gain, usual = BUS[background][0];
        channel.cancelScheduledValues(time);
        channel.setTargetAtTime(usual * .58, time, .026);
        channel.setTargetAtTime(usual, time + .24, .13);
      }
    }
  }
}
