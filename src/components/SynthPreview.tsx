import { useEffect, useRef, useCallback } from 'react';
import { PatchData } from '../types';

interface SynthPreviewProps {
  patch: PatchData;
  trigger: boolean;
}

export function SynthPreview({ patch, trigger }: SynthPreviewProps) {
  const audioCtx = useRef<AudioContext | null>(null);
  const masterGain = useRef<GainNode | null>(null);

  useEffect(() => {
    audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain.current = audioCtx.current.createGain();
    masterGain.current.gain.value = 0.3;
    masterGain.current.connect(audioCtx.current.destination);

    return () => {
      audioCtx.current?.close();
    };
  }, []);

  const playNote = useCallback(() => {
    if (!audioCtx.current || !masterGain.current) return;
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();

    const now = audioCtx.current.currentTime;
    
    // Osc 1
    const osc1 = audioCtx.current.createOscillator();
    const osc1Gain = audioCtx.current.createGain();
    osc1.type = mapWaveform(patch.osc1.waveform);
    osc1.frequency.value = 220 * Math.pow(2, patch.osc1.pitch / 12);
    osc1.detune.value = patch.osc1.detune;
    
    // Osc 2
    const osc2 = audioCtx.current.createOscillator();
    const osc2Gain = audioCtx.current.createGain();
    osc2.type = mapWaveform(patch.osc2.waveform);
    osc2.frequency.value = 220 * Math.pow(2, patch.osc2.pitch / 12);
    osc2.detune.value = patch.osc2.detune;

    // Filter
    const filter = audioCtx.current.createBiquadFilter();
    filter.type = patch.filter.type < 42 ? 'lowpass' : patch.filter.type < 84 ? 'bandpass' : 'highpass';
    filter.frequency.value = Math.max(20, patch.filter.cutoff * 150);
    filter.Q.value = patch.filter.resonance / 10;

    // Envelopes
    const env1 = patch.env1;
    const ampEnv = audioCtx.current.createGain();
    ampEnv.gain.setValueAtTime(0, now);
    ampEnv.gain.linearRampToValueAtTime(1, now + (env1.attack / 127) * 2);
    ampEnv.gain.linearRampToValueAtTime(env1.sustain / 127, now + (env1.attack / 127) * 2 + (env1.decay / 127) * 2);
    
    const releaseTime = (env1.release / 127) * 3;
    const duration = 0.5; // Fixed duration for preview
    ampEnv.gain.setValueAtTime(env1.sustain / 127, now + duration);
    ampEnv.gain.linearRampToValueAtTime(0, now + duration + releaseTime);

    // Connections
    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    filter.connect(ampEnv);
    ampEnv.connect(masterGain.current);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + releaseTime);
    osc2.stop(now + duration + releaseTime);
  }, [patch]);

  useEffect(() => {
    if (trigger) {
      playNote();
    }
  }, [trigger, playNote]);

  return null;
}

function mapWaveform(val: number): OscillatorType {
  if (val < 32) return 'sine';
  if (val < 64) return 'triangle';
  if (val < 96) return 'sawtooth';
  return 'square';
}
