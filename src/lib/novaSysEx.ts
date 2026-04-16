import { PatchData, OscillatorParams, FilterParams, EnvelopeParams, LFOParams, ModMatrixEntry } from "../types";

export class NovaSysEx {
  // Novation Circuit Tracks / Circuit Patch Layout (340 bytes)
  // 0: Category
  // 1-16: Name
  // 17-339: Parameters (Based on Nova engine spec, shifted by 17)
  
  private static readonly PARAM_SHIFT = 17;
  private static readonly NAME_OFFSET = 1;
  private static readonly CAT_OFFSET = 0;

  static serialize(patch: PatchData): Uint8Array {
    const data = patch.raw ? new Uint8Array(patch.raw) : new Uint8Array(340);

    // --- CATEGORY ---
    data[this.CAT_OFFSET] = 0; // Default

    // --- PATCH NAME (1-16) ---
    const name = patch.name.padEnd(16, " ").substring(0, 16);
    for (let i = 0; i < 16; i++) {
      data[this.NAME_OFFSET + i] = name.charCodeAt(i) & 0x7F;
    }

    // --- PARAMETERS (Shifted by 17) ---
    const p = (offset: number, value: number) => {
      if (this.PARAM_SHIFT + offset < 340) {
        data[this.PARAM_SHIFT + offset] = value & 0x7F;
      }
    };

    // --- OSCILLATORS ---
    // Osc 1 (Nova Offset 0 -> Circuit 17)
    p(0, patch.osc1.waveform);
    p(1, patch.osc1.pulseWidth);
    p(2, 0); // PWM amount placeholder
    p(3, patch.osc1.pitch + 64);
    p(4, patch.osc1.detune + 64);
    p(5, patch.osc1.vibrato);
    p(6, patch.osc1.sync ? 1 : 0);

    // Osc 2 (Nova Offset 16 -> Circuit 33)
    p(16, patch.osc2.waveform);
    p(17, patch.osc2.pulseWidth);
    p(18, 0); // PWM amount placeholder
    p(19, patch.osc2.pitch + 64);
    p(20, patch.osc2.detune + 64);
    p(21, patch.osc2.vibrato);
    p(22, patch.osc2.sync ? 1 : 0);

    // Sub Osc / Noise (Nova Offset 32 -> Circuit 49)
    p(32, patch.subOsc.waveform);
    p(33, patch.subOsc.level);
    p(34, patch.noise.type);
    p(35, patch.noise.level);

    // --- MIXER ---
    // Mixer (Nova Offset 48 -> Circuit 65)
    p(48, patch.mixer.osc1Level);
    p(49, patch.mixer.osc2Level);
    p(50, patch.mixer.subLevel);
    p(51, patch.mixer.noiseLevel);
    p(52, patch.mixer.ringMod);

    // --- FILTER ---
    // Filter (Nova Offset 64 -> Circuit 81)
    p(64, patch.filter.type);
    p(65, patch.filter.cutoff);
    p(66, patch.filter.resonance);
    p(67, patch.filter.envAmount + 64);
    p(68, patch.filter.lfo1Amount + 64);
    p(69, patch.filter.tracking);

    // --- ENVELOPES ---
    // Env 1 - Amp (Nova Offset 80 -> Circuit 97)
    p(80, patch.env1.attack);
    p(81, patch.env1.decay);
    p(82, patch.env1.sustain);
    p(83, patch.env1.release);
    p(84, patch.env1.velocity);

    // Env 2 - Mod 1 (Nova Offset 96 -> Circuit 113)
    p(96, patch.env2.attack);
    p(97, patch.env2.decay);
    p(98, patch.env2.sustain);
    p(99, patch.env2.release);
    p(100, patch.env2.velocity);

    // Env 3 - Mod 2 (Nova Offset 112 -> Circuit 129)
    p(112, patch.env3.attack);
    p(113, patch.env3.decay);
    p(114, patch.env3.sustain);
    p(115, patch.env3.release);
    p(116, patch.env3.velocity);

    // --- LFOS ---
    // LFO 1 (Nova Offset 128 -> Circuit 145)
    p(128, patch.lfo1.waveform);
    p(129, patch.lfo1.rate);
    p(130, patch.lfo1.delay);
    p(131, patch.lfo1.sync ? 1 : 0);

    // LFO 2 (Nova Offset 144 -> Circuit 161)
    p(144, patch.lfo2.waveform);
    p(145, patch.lfo2.rate);
    p(146, patch.lfo2.delay);
    p(147, patch.lfo2.sync ? 1 : 0);

    // --- EFFECTS ---
    // Distortion (Nova Offset 160 -> Circuit 177)
    p(160, patch.distortion.type);
    p(161, patch.distortion.level);

    // Chorus (Nova Offset 176 -> Circuit 193)
    p(176, patch.chorus.type);
    p(177, patch.chorus.level);
    p(178, patch.chorus.rate);
    p(179, patch.chorus.depth);
    p(180, patch.chorus.feedback);

    // --- MOD MATRIX ---
    // Mod Matrix (Nova Offset 192 -> Circuit 209)
    for (let i = 0; i < 8; i++) {
      const entry = patch.modMatrix[i] || { source: 0, destination: 0, amount: 0 };
      const base = 192 + i * 3;
      p(base, entry.source);
      p(base + 1, entry.destination);
      p(base + 2, entry.amount + 64);
    }

    // Final safety check: All bytes must be 7-bit (0-127)
    for (let i = 0; i < data.length; i++) {
      data[i] = data[i] & 0x7F;
    }

    return data;
  }

  static deserialize(data: Uint8Array): PatchData {
    const g = (offset: number) => {
      return data[this.PARAM_SHIFT + offset] || 0;
    };

    const osc1: OscillatorParams = {
      waveform: g(0),
      pulseWidth: g(1),
      pitch: g(3) - 64,
      detune: g(4) - 64,
      vibrato: g(5),
      sync: g(6) === 1,
    };

    const osc2: OscillatorParams = {
      waveform: g(16),
      pulseWidth: g(17),
      pitch: g(19) - 64,
      detune: g(20) - 64,
      vibrato: g(21),
      sync: g(22) === 1,
    };

    const subOsc = { waveform: g(32), level: g(33) };
    const noise = { type: g(34), level: g(35) };
    
    const mixer = {
      osc1Level: g(48),
      osc2Level: g(49),
      subLevel: g(50),
      noiseLevel: g(51),
      ringMod: g(52),
    };

    const filter: FilterParams = {
      type: g(64),
      cutoff: g(65),
      resonance: g(66),
      envAmount: g(67) - 64,
      lfo1Amount: g(68) - 64,
      tracking: g(69),
    };

    const env1: EnvelopeParams = {
      attack: g(80),
      decay: g(81),
      sustain: g(82),
      release: g(83),
      velocity: g(84),
    };

    const env2: EnvelopeParams = {
      attack: g(96),
      decay: g(97),
      sustain: g(98),
      release: g(99),
      velocity: g(100),
    };

    const env3: EnvelopeParams = {
      attack: g(112),
      decay: g(113),
      sustain: g(114),
      release: g(115),
      velocity: g(116),
    };

    const lfo1: LFOParams = {
      waveform: g(128),
      rate: g(129),
      delay: g(130),
      sync: g(131) === 1,
    };

    const lfo2: LFOParams = {
      waveform: g(144),
      rate: g(145),
      delay: g(146),
      sync: g(147) === 1,
    };

    const distortion = { type: g(160), level: g(161) };
    const chorus = {
      type: g(176),
      level: g(177),
      rate: g(178),
      depth: g(179),
      feedback: g(180),
    };

    const modMatrix: ModMatrixEntry[] = [];
    for (let i = 0; i < 8; i++) {
      const base = 192 + i * 3;
      modMatrix.push({
        source: g(base),
        destination: g(base + 1),
        amount: g(base + 2) - 64,
      });
    }

    // Patch Name (Offsets 1-16)
    const nameBytes = Array.from(data.slice(this.NAME_OFFSET, this.NAME_OFFSET + 16));
    let name = "";
    for (const b of nameBytes) {
      if (b === 0) break;
      name += String.fromCharCode(b);
    }
    name = name.trim();

    return {
      name,
      author: "",
      osc1,
      osc2,
      subOsc,
      noise,
      mixer,
      filter,
      env1,
      env2,
      env3,
      lfo1,
      lfo2,
      distortion,
      chorus,
      modMatrix,
      raw: new Uint8Array(data),
    };
  }

  static getMappedOffsets(): number[] {
    const offsets: number[] = [];
    const s = (off: number) => this.PARAM_SHIFT + off;

    // Osc 1 & 2
    for (const i of [0, 1, 3, 4, 5, 6]) { 
      offsets.push(s(i)); 
      offsets.push(s(16 + i)); 
    }
    // Sub/Noise
    for (let i = 0; i < 4; i++) { offsets.push(s(32 + i)); }
    // Mixer
    for (let i = 0; i < 5; i++) { offsets.push(s(48 + i)); }
    // Filter
    for (let i = 0; i < 6; i++) { offsets.push(s(64 + i)); }
    // Envelopes
    for (let i = 0; i < 5; i++) { 
      offsets.push(s(80 + i)); 
      offsets.push(s(96 + i)); 
      offsets.push(s(112 + i)); 
    }
    // LFOs
    for (let i = 0; i < 4; i++) { 
      offsets.push(s(128 + i)); 
      offsets.push(s(144 + i)); 
    }
    // Effects
    for (let i = 0; i < 2; i++) { offsets.push(s(160 + i)); }
    for (let i = 0; i < 5; i++) { offsets.push(s(176 + i)); }
    // Mod Matrix (8 slots)
    for (let i = 0; i < 24; i++) { offsets.push(s(192 + i)); }
    // Name
    for (let i = 0; i < 16; i++) { offsets.push(this.NAME_OFFSET + i); }
    
    return offsets.sort((a, b) => a - b);
  }
}
