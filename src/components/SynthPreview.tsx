import { useEffect, useRef, useCallback } from 'react';
import { PatchData } from '../types';
import * as Tone from 'tone';

interface SynthPreviewProps {
  patch: PatchData;
  trigger: number;
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
    filterEnvGain: Tone.Gain;
    lfo1: Tone.LFO;
    lfo1Gain: Tone.Gain;
    lfo2: Tone.LFO;
    dist: Tone.Distortion;
    chorus: Tone.Chorus;
    mixer: Tone.Gain;
    osc1Gain: Tone.Gain;
    osc2Gain: Tone.Gain;
    subGain: Tone.Gain;
    noiseGain: Tone.Gain;
  } | null>(null);

  useEffect(() => {
    console.log("SynthPreview: Initializing Tone components");
    // Initialize Tone.js components
    const osc1 = new Tone.Oscillator().start();
    const osc2 = new Tone.Oscillator().start();
    const sub = new Tone.Oscillator().start();
    const noise = new Tone.Noise().start();
    
    const osc1Gain = new Tone.Gain(0);
    const osc2Gain = new Tone.Gain(0);
    const subGain = new Tone.Gain(0);
    const noiseGain = new Tone.Gain(0);
    
    const mixerNode = new Tone.Gain(1);
    const filter = new Tone.Filter(2000, "lowpass");
    const ampEnv = new Tone.AmplitudeEnvelope({
      attack: 0.1,
      decay: 0.2,
      sustain: 0.5,
      release: 0.8
    });
    const filterEnv = new Tone.Envelope({
      attack: 0.1,
      decay: 0.2,
      sustain: 0.5,
      release: 0.8
    });
    const filterEnvGain = new Tone.Gain(0);
    filterEnv.connect(filterEnvGain);
    filterEnvGain.connect(filter.frequency);
    
    const dist = new Tone.Distortion(0);
    const chorus = new Tone.Chorus(4, 2.5, 0.5).start();
    const mixer = new Tone.Gain(2.0); // Even more volume
    const limiter = new Tone.Limiter(-1).toDestination();

    // Connections
    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    sub.connect(subGain);
    noise.connect(noiseGain);

    osc1Gain.connect(mixerNode);
    osc2Gain.connect(mixerNode);
    subGain.connect(mixerNode);
    noiseGain.connect(mixerNode);

    mixerNode.connect(ampEnv);
    ampEnv.connect(filter);
    filter.connect(dist);
    dist.connect(chorus);
    chorus.connect(mixer);
    mixer.connect(limiter);

    const lfo1 = new Tone.LFO({ frequency: 1, type: "sine" }).start();
    const lfo1Gain = new Tone.Gain(0);
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(filter.frequency);

    synth.current = {
      osc1, osc2, sub, noise, filter, ampEnv, filterEnv, filterEnvGain,
      lfo1,
      lfo2: new Tone.LFO().start(),
      dist, chorus, mixer,
      osc1Gain, osc2Gain, subGain, noiseGain,
      lfo1Gain
    };

    return () => {
      console.log("SynthPreview: Disposing Tone components");
      osc1.dispose();
      osc2.dispose();
      sub.dispose();
      noise.dispose();
      osc1Gain.dispose();
      osc2Gain.dispose();
      subGain.dispose();
      noiseGain.dispose();
      mixerNode.dispose();
      filter.dispose();
      ampEnv.dispose();
      filterEnv.dispose();
      filterEnvGain.dispose();
      lfo1.dispose();
      lfo1Gain.dispose();
      dist.dispose();
      chorus.dispose();
      mixer.dispose();
      limiter.dispose();
    };
  }, []);

  const updateSynthParams = useCallback(() => {
    if (!synth.current) return;
    const s = synth.current;

    // Osc 1
    const osc1Freq = Tone.Frequency(60 + (patch.osc1?.pitch ?? 0), "midi").toFrequency();
    s.osc1.type = mapWaveform(patch.osc1?.waveform ?? 0);
    s.osc1.frequency.rampTo(osc1Freq, 0.05);
    s.osc1.detune.rampTo((patch.osc1?.detune ?? 0) * 2, 0.05); // Detune range boost
    
    // Osc 2
    const osc2Freq = Tone.Frequency(60 + (patch.osc2?.pitch ?? 0), "midi").toFrequency();
    s.osc2.type = mapWaveform(patch.osc2?.waveform ?? 0);
    s.osc2.frequency.rampTo(osc2Freq, 0.05);
    s.osc2.detune.rampTo((patch.osc2?.detune ?? 0) * 2, 0.05);

    // Sub
    const subWf = patch.subOsc?.waveform ?? 0;
    s.sub.type = subWf < 32 ? 'sine' : subWf < 64 ? 'triangle' : subWf < 96 ? 'sawtooth' : 'square';
    s.sub.frequency.rampTo(Tone.Frequency(60 + (patch.osc1?.pitch ?? 0) - 12, "midi").toFrequency(), 0.05);

    // Mixer
    const osc1Vol = (patch.mixer?.osc1Level ?? 100) / 127;
    const osc2Vol = (patch.mixer?.osc2Level ?? 0) / 127;
    const subVol = (patch.mixer?.subLevel ?? 0) / 127;
    const noiseVol = (patch.mixer?.noiseLevel ?? 0) / 127;

    console.log("SynthPreview: Updating params", { osc1Vol, cutoff: patch.filter?.cutoff, waveform: patch.osc1?.waveform });
    s.osc1Gain.gain.rampTo(osc1Vol, 0.05);
    s.osc2Gain.gain.rampTo(osc2Vol, 0.05);
    s.subGain.gain.rampTo(subVol, 0.05);
    s.noiseGain.gain.rampTo(noiseVol, 0.05);

    // Filter
    const filterCutoff = Number(patch.filter?.cutoff ?? 127);
    s.filter.type = (patch.filter?.type ?? 0) < 42 ? 'lowpass' : (patch.filter?.type ?? 0) < 84 ? 'bandpass' : 'highpass';
    const baseFreq = Math.min(20000, Math.max(20, filterCutoff * 150));
    s.filter.frequency.rampTo(baseFreq, 0.05);
    s.filter.Q.rampTo((patch.filter?.resonance ?? 0) / 10, 0.05);

    // Modulation Amounts
    const envAmt = (patch.filter?.envAmount ?? 0) * 50; // Scale env amount
    s.filterEnvGain.gain.rampTo(envAmt, 0.05);

    const lfo1Amt = (patch.filter?.lfo1Amount ?? 0) * 20;
    s.lfo1Gain.gain.rampTo(lfo1Amt, 0.05);

    // LFO Params
    s.lfo1.type = mapWaveform(patch.lfo1?.waveform ?? 0);
    s.lfo1.frequency.rampTo(Math.max(0.1, (patch.lfo1?.rate ?? 40) / 10), 0.05);

    // Envelopes
    s.ampEnv.attack = Math.max(0.005, ((patch.env1?.attack ?? 0) / 127) * 2);
    s.ampEnv.decay = Math.max(0.005, ((patch.env1?.decay ?? 64) / 127) * 2);
    s.ampEnv.sustain = (patch.env1?.sustain ?? 127) / 127;
    s.ampEnv.release = Math.max(0.005, ((patch.env1?.release ?? 20) / 127) * 3);

    s.filterEnv.attack = Math.max(0.005, ((patch.env2?.attack ?? 0) / 127) * 2);
    s.filterEnv.decay = Math.max(0.005, ((patch.env2?.decay ?? 64) / 127) * 2);
    s.filterEnv.sustain = (patch.env2?.sustain ?? 0) / 127;
    s.filterEnv.release = Math.max(0.005, ((patch.env2?.release ?? 20) / 127) * 3);
    
    // Effects
    s.dist.distortion = (patch.distortion?.level ?? 0) / 127;
    s.chorus.depth = (patch.chorus?.depth ?? 0) / 127;
    s.chorus.delayTime = ((patch.chorus?.rate ?? 0) / 127) * 20;
    s.chorus.feedback.value = (patch.chorus?.feedback ?? 0) / 127;

  }, [patch]);

  useEffect(() => {
    updateSynthParams();
  }, [patch, updateSynthParams]);

  const playNote = useCallback(async () => {
    console.log("SynthPreview: playNote called", { trigger, patchName: patch.name });
    
    if (Tone.getContext().state !== 'running') {
      console.log("SynthPreview: Resuming Tone context");
      await Tone.getContext().resume();
    }

    updateSynthParams();
    if (!synth.current) {
      console.warn("SynthPreview: synth.current is null");
      return;
    }
    
    const now = Tone.now();
    
    synth.current.ampEnv.triggerAttackRelease(0.5, now);
    synth.current.filterEnv.triggerAttackRelease(0.5, now);
  }, [updateSynthParams, trigger, patch.name]);

  useEffect(() => {
    if (trigger > 0) {
      playNote();
    }
  }, [trigger, playNote]);

  return null;
}

function mapWaveform(val: number): Tone.ToneOscillatorType {
  if (val < 32) return 'sine';
  if (val < 64) return 'triangle';
  if (val < 96) return 'sawtooth';
  return 'square';
}
