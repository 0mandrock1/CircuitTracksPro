export interface PatchData {
  name: string;
  author: string;
  
  // Oscillators
  osc1: OscillatorParams;
  osc2: OscillatorParams;
  subOsc: { waveform: number; level: number };
  noise: { type: number; level: number };
  mixer: { osc1Level: number; osc2Level: number; subLevel: number; noiseLevel: number; ringMod: number };

  // Filter
  filter: FilterParams;

  // Envelopes
  env1: EnvelopeParams; // Amp
  env2: EnvelopeParams; // Mod 1
  env3: EnvelopeParams; // Mod 2

  // LFOs
  lfo1: LFOParams;
  lfo2: LFOParams;

  // Mod Matrix (20 slots)
  modMatrix: ModMatrixEntry[];

  // Effects
  distortion: { type: number; level: number };
  chorus: { type: number; level: number; rate: number; depth: number; feedback: number };
  raw?: Uint8Array; // Original SysEx data for preservation
}

export interface OscillatorParams {
  waveform: number; // 0-127
  pitch: number; // -64 to 63
  detune: number; // -64 to 63
  vibrato: number; // 0-127
  pulseWidth: number; // 0-127
  sync: boolean;
}

export interface FilterParams {
  type: number; // 0-127 (LP12, LP24, HP12, HP24, BP12, BP24)
  cutoff: number; // 0-127
  resonance: number; // 0-127
  envAmount: number; // -64 to 63
  lfo1Amount: number; // -64 to 63
  tracking: number; // 0-127
}

export interface EnvelopeParams {
  attack: number; // 0-127
  decay: number; // 0-127
  sustain: number; // 0-127
  release: number; // 0-127
  velocity: number; // 0-127
}

export interface LFOParams {
  waveform: number; // 0-127
  rate: number; // 0-127
  delay: number; // 0-127
  sync: boolean;
}

export interface ModMatrixEntry {
  source: number;
  destination: number;
  amount: number;
}

export interface SampleData {
  id?: string;
  name: string;
  data: string; // base64
  start: number;
  end: number;
  pitch: number;
  filter: number;
  decay: number;
  distortion: number;
  eq: number;
  authorUid: string;
}

export interface PatchRecord {
  id: string;
  name: string;
  author: string;
  authorUid: string;
  data: string; // base64 SysEx
  tags: string[];
  createdAt: any;
  updatedAt: any;
}
