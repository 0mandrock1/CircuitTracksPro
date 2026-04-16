import { PatchData, OscillatorParams, FilterParams, EnvelopeParams, LFOParams, ModMatrixEntry } from "../types";

export class NovaSysEx {
  // Mapping based on Novation Nova engine SysEx spec (340 bytes)
  // Offsets are approximate but follow the general structure of the Nova engine
  
  static serialize(patch: PatchData): Uint8Array {
    const data = new Uint8Array(340);

    // --- OSCILLATORS ---
    // Osc 1 (Offset 0)
    data[0] = patch.osc1.waveform & 0x7F;
    data[1] = patch.osc1.pulseWidth & 0x7F;
    data[2] = 0; // PWM amount placeholder
    data[3] = (patch.osc1.pitch + 64) & 0x7F;
    data[4] = (patch.osc1.detune + 64) & 0x7F;
    data[5] = patch.osc1.vibrato & 0x7F;
    data[6] = patch.osc1.sync ? 1 : 0;

    // Osc 2 (Offset 16)
    data[16] = patch.osc2.waveform & 0x7F;
    data[17] = patch.osc2.pulseWidth & 0x7F;
    data[18] = 0; // PWM amount placeholder
    data[19] = (patch.osc2.pitch + 64) & 0x7F;
    data[20] = (patch.osc2.detune + 64) & 0x7F;
    data[21] = patch.osc2.vibrato & 0x7F;
    data[22] = patch.osc2.sync ? 1 : 0;

    // Sub Osc / Noise (Offset 32)
    data[32] = patch.subOsc.waveform & 0x7F;
    data[33] = patch.subOsc.level & 0x7F;
    data[34] = patch.noise.type & 0x7F;
    data[35] = patch.noise.level & 0x7F;

    // --- MIXER ---
    // Mixer (Offset 48)
    data[48] = patch.mixer.osc1Level & 0x7F;
    data[49] = patch.mixer.osc2Level & 0x7F;
    data[50] = patch.mixer.subLevel & 0x7F;
    data[51] = patch.mixer.noiseLevel & 0x7F;
    data[52] = patch.mixer.ringMod & 0x7F;

    // --- FILTER ---
    // Filter (Offset 64)
    data[64] = patch.filter.type & 0x7F;
    data[65] = patch.filter.cutoff & 0x7F;
    data[66] = patch.filter.resonance & 0x7F;
    data[67] = (patch.filter.envAmount + 64) & 0x7F;
    data[68] = (patch.filter.lfo1Amount + 64) & 0x7F;
    data[69] = patch.filter.tracking & 0x7F;

    // --- ENVELOPES ---
    // Env 1 - Amp (Offset 80)
    data[80] = patch.env1.attack & 0x7F;
    data[81] = patch.env1.decay & 0x7F;
    data[82] = patch.env1.sustain & 0x7F;
    data[83] = patch.env1.release & 0x7F;
    data[84] = patch.env1.velocity & 0x7F;

    // Env 2 - Mod 1 (Offset 96)
    data[96] = patch.env2.attack & 0x7F;
    data[97] = patch.env2.decay & 0x7F;
    data[98] = patch.env2.sustain & 0x7F;
    data[99] = patch.env2.release & 0x7F;
    data[100] = patch.env2.velocity & 0x7F;

    // Env 3 - Mod 2 (Offset 112)
    data[112] = patch.env3.attack & 0x7F;
    data[113] = patch.env3.decay & 0x7F;
    data[114] = patch.env3.sustain & 0x7F;
    data[115] = patch.env3.release & 0x7F;
    data[116] = patch.env3.velocity & 0x7F;

    // --- LFOS ---
    // LFO 1 (Offset 128)
    data[128] = patch.lfo1.waveform & 0x7F;
    data[129] = patch.lfo1.rate & 0x7F;
    data[130] = patch.lfo1.delay & 0x7F;
    data[131] = patch.lfo1.sync ? 1 : 0;

    // LFO 2 (Offset 144)
    data[144] = patch.lfo2.waveform & 0x7F;
    data[145] = patch.lfo2.rate & 0x7F;
    data[146] = patch.lfo2.delay & 0x7F;
    data[147] = patch.lfo2.sync ? 1 : 0;

    // --- EFFECTS ---
    // Distortion (Offset 160)
    data[160] = patch.distortion.type & 0x7F;
    data[161] = patch.distortion.level & 0x7F;

    // Chorus (Offset 176)
    data[176] = patch.chorus.type & 0x7F;
    data[177] = patch.chorus.level & 0x7F;
    data[178] = patch.chorus.rate & 0x7F;
    data[179] = patch.chorus.depth & 0x7F;
    data[180] = patch.chorus.feedback & 0x7F;

    // --- MOD MATRIX ---
    // Mod Matrix (Offset 192) - 20 slots, 3 bytes each
    for (let i = 0; i < 20; i++) {
      const entry = patch.modMatrix[i] || { source: 0, destination: 0, amount: 0 };
      const base = 192 + i * 3;
      data[base] = entry.source & 0x7F;
      data[base + 1] = entry.destination & 0x7F;
      data[base + 2] = (entry.amount + 64) & 0x7F;
    }

    // --- PATCH NAME ---
    // Patch Name (Offset 324, 16 bytes)
    const name = patch.name.padEnd(16, " ").substring(0, 16);
    for (let i = 0; i < 16; i++) {
      data[324 + i] = name.charCodeAt(i) & 0x7F;
    }

    // Final safety check: All bytes must be 7-bit (0-127)
    for (let i = 0; i < data.length; i++) {
      data[i] = data[i] & 0x7F;
    }

    return data;
  }

  static deserialize(data: Uint8Array): PatchData {
    // data is 340 bytes
    
    const osc1: OscillatorParams = {
      waveform: data[0],
      pulseWidth: data[1],
      pitch: data[3] - 64,
      detune: data[4] - 64,
      vibrato: data[5],
      sync: data[6] === 1,
    };

    const osc2: OscillatorParams = {
      waveform: data[16],
      pulseWidth: data[17],
      pitch: data[19] - 64,
      detune: data[20] - 64,
      vibrato: data[21],
      sync: data[22] === 1,
    };

    const subOsc = { waveform: data[32], level: data[33] };
    const noise = { type: data[34], level: data[35] };
    
    const mixer = {
      osc1Level: data[48],
      osc2Level: data[49],
      subLevel: data[50],
      noiseLevel: data[51],
      ringMod: data[52],
    };

    const filter: FilterParams = {
      type: data[64],
      cutoff: data[65],
      resonance: data[66],
      envAmount: data[67] - 64,
      lfo1Amount: data[68] - 64,
      tracking: data[69],
    };

    const env1: EnvelopeParams = {
      attack: data[80],
      decay: data[81],
      sustain: data[82],
      release: data[83],
      velocity: data[84],
    };

    const env2: EnvelopeParams = {
      attack: data[96],
      decay: data[97],
      sustain: data[98],
      release: data[99],
      velocity: data[100],
    };

    const env3: EnvelopeParams = {
      attack: data[112],
      decay: data[113],
      sustain: data[114],
      release: data[115],
      velocity: data[116],
    };

    const lfo1: LFOParams = {
      waveform: data[128],
      rate: data[129],
      delay: data[130],
      sync: data[131] === 1,
    };

    const lfo2: LFOParams = {
      waveform: data[144],
      rate: data[145],
      delay: data[146],
      sync: data[147] === 1,
    };

    const distortion = { type: data[160], level: data[161] };
    const chorus = {
      type: data[176],
      level: data[177],
      rate: data[178],
      depth: data[179],
      feedback: data[180],
    };

    const modMatrix: ModMatrixEntry[] = [];
    for (let i = 0; i < 20; i++) {
      const base = 192 + i * 3;
      modMatrix.push({
        source: data[base],
        destination: data[base + 1],
        amount: data[base + 2] - 64,
      });
    }

    // Patch Name (Offset 324)
    const nameBytes = Array.from(data.slice(324, 340));
    let name = "";
    for (const b of nameBytes) {
      if (b === 0) break; // Stop at null terminator
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
    };
  }
}
