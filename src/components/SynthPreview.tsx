import { useEffect, useRef, useCallback } from 'react';
import { PatchData } from '../types';
import * as Tone from 'tone';

interface SynthPreviewProps {
  patch: PatchData;
  trigger: boolean;
}

export function SynthPreview({ patch, trigger }: SynthPreviewProps) {
  const synth = useRef<{
    osc1: Tone.Oscillator;
    osc2: Tone.Oscillator;
    sub: Tone.Oscillator;
    noise: Tone.Noise;
    filter: Tone.Filter;
    ampEnv: Tone.AmplitudeEnvelope;
    filterEnv: Tone.Envelope;
    lfo1: Tone.LFO;
    lfo2: Tone.LFO;
    dist: Tone.Distortion;
    chorus: Tone.Chorus;
    mixer: Tone.Gain;
  } | null>(null);

  useEffect(() => {
    // Initialize Tone.js components
    const osc1 = new Tone.Oscillator().start();
    const osc2 = new Tone.Oscillator().start();
    const sub = new Tone.Oscillator().start();
    const noise = new Tone.Noise().start();
    
    const osc1Gain = new Tone.Gain();
    const osc2Gain = new Tone.Gain();
    const subGain = new Tone.Gain();
    const noiseGain = new Tone.Gain();
    
    const filter = new Tone.Filter();
    const ampEnv = new Tone.AmplitudeEnvelope();
    const filterEnv = new Tone.Envelope();
    
    const dist = new Tone.Distortion(0);
    const chorus = new Tone.Chorus(0, 0, 0).start();
    const mixer = new Tone.Gain(0.5);

    // Connections
    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    sub.connect(subGain);
    noise.connect(noiseGain);

    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    subGain.connect(filter);
    noiseGain.connect(filter);

    filter.connect(ampEnv);
    ampEnv.connect(dist);
    dist.connect(chorus);
    chorus.connect(mixer);
    mixer.toDestination();

    // Modulation
    filterEnv.connect(filter.frequency);

    synth.current = {
      osc1, osc2, sub, noise, filter, ampEnv, filterEnv,
      lfo1: new Tone.LFO().start(),
      lfo2: new Tone.LFO().start(),
      dist, chorus, mixer
    };

    return () => {
      synth.current?.osc1.dispose();
      synth.current?.osc2.dispose();
      synth.current?.sub.dispose();
      synth.current?.noise.dispose();
      synth.current?.filter.dispose();
      synth.current?.ampEnv.dispose();
      synth.current?.filterEnv.dispose();
      synth.current?.lfo1.dispose();
      synth.current?.lfo2.dispose();
      synth.current?.dist.dispose();
      synth.current?.chorus.dispose();
      synth.current?.mixer.dispose();
    };
  }, []);

  const updateSynthParams = useCallback(() => {
    if (!synth.current) return;
    const s = synth.current;

    // Osc 1
    s.osc1.type = mapWaveform(patch.osc1.waveform);
    s.osc1.frequency.value = Tone.Frequency(60 + patch.osc1.pitch, "midi").toFrequency();
    s.osc1.detune.value = patch.osc1.detune;
    
    // Osc 2
    s.osc2.type = mapWaveform(patch.osc2.waveform);
    s.osc2.frequency.value = Tone.Frequency(60 + patch.osc2.pitch, "midi").toFrequency();
    s.osc2.detune.value = patch.osc2.detune;

    // Sub
    s.sub.type = patch.subOsc.waveform === 0 ? 'sine' : patch.subOsc.waveform === 1 ? 'square' : 'sawtooth';
    s.sub.frequency.value = Tone.Frequency(60 + patch.osc1.pitch - 12, "midi").toFrequency();

    // Mixer
    (s.osc1.context.rawContext as any).resume(); // Ensure context is running
    s.osc1.volume.value = Tone.gainToDb(patch.mixer.osc1Level / 127);
    s.osc2.volume.value = Tone.gainToDb(patch.mixer.osc2Level / 127);
    s.sub.volume.value = Tone.gainToDb(patch.mixer.subLevel / 127);
    s.noise.volume.value = Tone.gainToDb(patch.mixer.noiseLevel / 127);

    // Filter
    s.filter.type = patch.filter.type < 42 ? 'lowpass' : patch.filter.type < 84 ? 'bandpass' : 'highpass';
    s.filter.frequency.value = Math.min(20000, Math.max(20, patch.filter.cutoff * 150));
    s.filter.Q.value = patch.filter.resonance / 10;

    // Envelopes
    s.ampEnv.attack = Math.max(0.005, (patch.env1.attack / 127) * 2);
    s.ampEnv.decay = Math.max(0.005, (patch.env1.decay / 127) * 2);
    s.ampEnv.sustain = patch.env1.sustain / 127;
    s.ampEnv.release = Math.max(0.005, (patch.env1.release / 127) * 3);

    s.filterEnv.attack = Math.max(0.005, (patch.env2.attack / 127) * 2);
    s.filterEnv.decay = Math.max(0.005, (patch.env2.decay / 127) * 2);
    s.filterEnv.sustain = patch.env2.sustain / 127;
    s.filterEnv.release = Math.max(0.005, (patch.env2.release / 127) * 3);
    
    // Effects
    s.dist.distortion = patch.distortion.level / 127;
    s.chorus.depth = patch.chorus.depth / 127;
    s.chorus.delayTime = (patch.chorus.rate / 127) * 20;
    s.chorus.feedback.value = patch.chorus.feedback / 127;

  }, [patch]);

  const playNote = useCallback(async () => {
    await Tone.start();
    updateSynthParams();
    if (!synth.current) return;
    
    const now = Tone.now();
    synth.current.ampEnv.triggerAttackRelease("0.5", now);
    synth.current.filterEnv.triggerAttackRelease("0.5", now);
  }, [updateSynthParams]);

  useEffect(() => {
    if (trigger) {
      playNote();
    }
  }, [trigger, playNote]);

  return null;
}

function mapWaveform(val: number): Tone.ToneOscillatorType {
  if (val === 0) return 'sawtooth';
  if (val === 1) return 'square';
  if (val === 2) return 'sine';
  if (val === 3) return 'triangle';
  if (val < 32) return 'sawtooth';
  if (val < 64) return 'square';
  if (val < 96) return 'sawtooth';
  return 'square';
}
