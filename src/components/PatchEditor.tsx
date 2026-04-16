import { useState, useEffect, useCallback } from 'react';
import { User, db, setDoc, doc, Timestamp } from '../firebase';
import { PatchData, OscillatorParams, FilterParams, EnvelopeParams, LFOParams } from '../types';
import { SynthPreview } from './SynthPreview';
import { midiService } from '../services/MidiService';
import { Save, Play, Download, Upload, Cpu, Activity, Zap, Layers, RefreshCw, Send, Radio } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { Visualizer } from './Visualizer';

import * as Tone from 'tone';

const DEFAULT_PATCH: PatchData = {
  name: "INIT PATCH",
  author: "User",
  osc1: { waveform: 0, pitch: 0, detune: 0, vibrato: 0, pulseWidth: 0, sync: false },
  osc2: { waveform: 0, pitch: 0, detune: 0, vibrato: 0, pulseWidth: 0, sync: false },
  subOsc: { waveform: 0, level: 0 },
  noise: { type: 0, level: 0 },
  mixer: { osc1Level: 100, osc2Level: 0, subLevel: 0, noiseLevel: 0, ringMod: 0 },
  filter: { type: 0, cutoff: 127, resonance: 0, envAmount: 0, lfo1Amount: 0, tracking: 127 },
  env1: { attack: 0, decay: 64, sustain: 127, release: 20, velocity: 64 },
  env2: { attack: 0, decay: 64, sustain: 0, release: 20, velocity: 0 },
  env3: { attack: 0, decay: 64, sustain: 0, release: 20, velocity: 0 },
  lfo1: { waveform: 0, rate: 40, delay: 0, sync: false },
  lfo2: { waveform: 0, rate: 20, delay: 0, sync: false },
  modMatrix: [],
  distortion: { type: 0, level: 0 },
  chorus: { type: 0, level: 0, rate: 0, depth: 0, feedback: 0 }
};

export function PatchEditor({ user }: { user: User | null }) {
  const [patch, setPatch] = useState<PatchData>(DEFAULT_PATCH);
  const [lastSavedPatch, setLastSavedPatch] = useState<PatchData>(DEFAULT_PATCH);
  const [synthTrigger, setSynthTrigger] = useState(0);
  const [saving, setSaving] = useState(false);
  const [midiStatus, setMidiStatus] = useState("Disconnected");
  const [activeTab, setActiveTab] = useState<'oscillators' | 'filter' | 'envelopes' | 'modulation'>('oscillators');
  const [selectedSynth, setSelectedSynth] = useState<0 | 1>(0);

  const isDirty = JSON.stringify(patch) !== JSON.stringify(lastSavedPatch);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const initMidi = async () => {
      const success = await midiService.requestAccess();
      if (success) {
        setMidiStatus(midiService.getDeviceName());
      }
    };
    initMidi();
  }, []);

  const updatePatch = (section: keyof PatchData, field: string, value: any) => {
    setPatch(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        [field]: value
      }
    }));
  };

  const [midiLog, setMidiLog] = useState<string[]>([]);
  const [lastSysEx, setLastSysEx] = useState<string>("");

  const addLog = (msg: string) => {
    setMidiLog(prev => [msg, ...prev].slice(0, 5));
  };

  useEffect(() => {
    const cleanupPatch = midiService.onPatchReceived((receivedPatch) => {
      console.log("SysEx Received & Deserialized:", receivedPatch);
      addLog(`RECV: PATCH OK`);
      setPatch(receivedPatch);
      setLastSavedPatch(receivedPatch); // Update last saved on fetch
    });
    
    const cleanupSysEx = midiService.onSysExReceived((data) => {
      const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastSysEx(hex);
    });

    const cleanupError = midiService.onMidiError((msg) => {
      addLog(`ERR: ${msg}`);
    });

    return () => {
      cleanupPatch();
      cleanupSysEx();
      cleanupError();
    };
  }, [midiStatus]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const patchId = patch.name.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'patches', patchId), {
        ...patch,
        authorUid: user.uid,
        updatedAt: Timestamp.now()
      });
      setLastSavedPatch({ ...patch });
      addLog("DB: PATCH SAVED");
    } catch (e) {
      console.error(e);
      addLog("DB: SAVE FAILED");
    } finally {
      setSaving(false);
    }
  };

  const handleFetch = () => {
    if (isDirty && !confirm("You have unsaved changes. Fetching will overwrite them. Continue?")) {
      return;
    }
    const bytes = midiService.requestPatchDump(selectedSynth);
    if (bytes > 0) {
      addLog(`SEND: FETCH S${selectedSynth + 1} (${bytes}B)`);
      // Set a timeout to check if we got a response
      setTimeout(() => {
        addLog("FETCH: WAITING...");
      }, 1000);
    } else {
      addLog("SEND: FETCH FAILED");
    }
  };

  const handleSend = () => {
    const bytes = midiService.sendPatch(patch, selectedSynth);
    if (bytes > 0) {
      addLog(`SEND: PATCH S${selectedSynth + 1} OK (${bytes}B)`);
    } else {
      addLog("SEND: PATCH FAILED");
    }
  };

  const handleSendVerify = async () => {
    addLog(`SEND+VERIFY: START S${selectedSynth + 1}`);
    await midiService.sendAndVerify(patch, selectedSynth);
  };

  const handleHWPreview = (note: number, synthIndex: number = 0) => {
    addLog(`SEND: NOTE ${note} S${synthIndex + 1}`);
    midiService.playNoteOnHardware(note, synthIndex);
  };

  return (
    <div className="space-y-6">
      <SynthPreview patch={patch as any} trigger={synthTrigger} />
      
      {/* Pro Toolbar */}
      <div className="pro-panel p-4 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-1 w-full">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-lg flex items-center justify-center border border-brand-primary/20">
            <Cpu className="w-6 h-6 text-brand-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={patch.name}
                onChange={(e) => setPatch(p => ({ ...p, name: e.target.value }))}
                className="bg-transparent text-xl font-black text-white border-none focus:ring-0 w-full uppercase tracking-widest"
                placeholder="PATCH NAME"
              />
              {isDirty && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[9px] font-black text-amber-500 uppercase tracking-widest animate-pulse">
                  Unsaved
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("w-2 h-2 rounded-full", midiStatus !== "Disconnected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-700")} />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">MIDI: {midiStatus}</span>
              <div className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-[8px] font-mono text-indigo-400 flex items-center gap-4">
                {midiLog.slice(0, 2).map((log, i) => (
                  <div key={i} className={cn(log.includes('ERR') ? 'text-rose-500' : log.includes('RECV') ? 'text-emerald-500' : '')}>
                    {log}
                  </div>
                ))}
                {midiLog.length === 0 && <div className="text-zinc-700 italic">No activity...</div>}
              </div>
              {midiStatus === "Disconnected" && (
                <button 
                  onClick={async () => {
                    const success = await midiService.reconnect();
                    if (success) {
                      setMidiStatus(midiService.getDeviceName());
                      addLog("MIDI: RECONNECTED");
                    } else {
                      addLog("MIDI: RECONNECT FAILED");
                    }
                  }}
                  className="text-[8px] font-black text-brand-primary hover:text-white transition-colors uppercase tracking-widest ml-2 underline"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
          {midiLog.length > 0 && (
            <div className="flex flex-col gap-1 border-l border-zinc-800 pl-4 min-w-[200px] max-h-[60px] overflow-y-auto custom-scrollbar">
              {midiLog.map((log, i) => (
                <div key={i} className={cn(
                  "text-[9px] font-mono uppercase tracking-tighter animate-in fade-in slide-in-from-left-1",
                  log.includes("FAILED") || log.includes("ERR") ? "text-red-500" : "text-brand-primary/80"
                )}>
                  {log}
                </div>
              ))}
              {lastSysEx && (
                <div className="text-[8px] font-mono text-zinc-400 mt-1 border-t border-zinc-800 pt-1 break-all leading-tight">
                  <span className="text-zinc-600 mr-1">HEX:</span>
                  {lastSysEx.substring(0, 60)}...
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 mr-2">
            <button 
              onClick={() => setSelectedSynth(0)} 
              className={cn(
                "px-3 py-1.5 text-[9px] font-black rounded transition-all",
                selectedSynth === 0 ? "bg-brand-primary text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              )}
            >
              SYNTH 1
            </button>
            <button 
              onClick={() => setSelectedSynth(1)} 
              className={cn(
                "px-3 py-1.5 text-[9px] font-black rounded transition-all",
                selectedSynth === 1 ? "bg-brand-primary text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
              )}
            >
              SYNTH 2
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 mr-2">
            <div className="group relative">
              <button onClick={() => handleHWPreview(60, 0)} className="px-3 py-1.5 text-[9px] font-black bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded border border-zinc-700 transition-all">
                SYNTH
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-32 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl text-center">
                Plays a test note on Synth 1.
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-800" />
              </div>
            </div>
            <div className="group relative">
              <button onClick={() => handleHWPreview(36, 1)} className="px-3 py-1.5 text-[9px] font-black bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded border border-zinc-700 transition-all">
                BASS
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-32 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl text-center">
                Plays a test note on Synth 2.
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-800" />
              </div>
            </div>
          </div>
          <div className="group relative">
            <button onClick={handleFetch} className="pro-button pro-button-secondary">
              <Download className="w-4 h-4" /> FETCH
            </button>
          </div>
          <div className="group relative">
            <button onClick={handleSend} className="pro-button pro-button-primary">
              <Send className="w-4 h-4" /> SEND
            </button>
          </div>
          <div className="group relative">
            <button onClick={handleSendVerify} className="pro-button bg-indigo-600 hover:bg-indigo-500 text-white">
              <RefreshCw className="w-4 h-4" /> SEND+VERIFY
            </button>
          </div>
          <div className="w-px h-8 bg-zinc-800 mx-2 hidden sm:block" />
          <div className="group relative flex items-center gap-2">
            <div className="flex flex-col items-center">
              <button 
                onClick={async () => {
                  console.log("PatchEditor: PREVIEW clicked");
                  try {
                    await Tone.start();
                    console.log("PatchEditor: Tone started, state:", Tone.getContext().state);
                    setSynthTrigger(prev => prev + 1);
                  } catch (err) {
                    console.error("PatchEditor: Tone.start failed", err);
                  }
                }} 
                className="pro-button pro-button-primary"
              >
                <Play className="w-4 h-4 fill-current" /> PREVIEW
              </button>
            </div>
          </div>
          <div className="w-48 h-12 bg-black/40 rounded border border-white/5 overflow-hidden hidden md:block relative">
            <Visualizer trigger={synthTrigger as any} patch={patch} />
          </div>
          {user && (
            <button 
              onClick={handleSave} 
              disabled={saving || !isDirty}
              className={cn(
                "pro-button text-white transition-all",
                isDirty ? "bg-emerald-600 hover:bg-emerald-500" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
            >
              <Save className={cn("w-4 h-4", saving && "animate-spin")} /> 
              {saving ? "SAVING..." : "CLOUD"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1011] p-1 rounded-xl border border-[#2a1517]">
        <TabButton active={activeTab === 'oscillators'} onClick={() => setActiveTab('oscillators')} icon={<Zap className="w-4 h-4" />} label="OSCILLATORS" />
        <TabButton active={activeTab === 'filter'} onClick={() => setActiveTab('filter')} icon={<Activity className="w-4 h-4" />} label="FILTER" />
        <TabButton active={activeTab === 'envelopes'} onClick={() => setActiveTab('envelopes')} icon={<Radio className="w-4 h-4" />} label="ENVELOPES" />
        <TabButton active={activeTab === 'modulation'} onClick={() => setActiveTab('modulation')} icon={<Layers className="w-4 h-4" />} label="MODULATION" />
      </div>

      {/* Editor Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {activeTab === 'oscillators' && (
            <>
              <ProSection title="OSC 1">
                <div className="space-y-6">
                  <WaveformSelector value={patch.osc1.waveform} onChange={v => updatePatch('osc1', 'waveform', v)} />
                  <div className="grid grid-cols-2 gap-6">
                    <Knob label="PITCH" value={patch.osc1.pitch} min={-64} max={63} onChange={v => updatePatch('osc1', 'pitch', v)} tooltip="Adjusts the base frequency in semitones." />
                    <Knob label="DETUNE" value={patch.osc1.detune} min={-64} max={63} onChange={v => updatePatch('osc1', 'detune', v)} tooltip="Fine-tunes frequency for a thicker sound." />
                    <Knob label="PW" value={patch.osc1.pulseWidth} onChange={v => updatePatch('osc1', 'pulseWidth', v)} tooltip="Changes square wave width and harmonics." />
                    <Knob label="VIB" value={patch.osc1.vibrato} onChange={v => updatePatch('osc1', 'vibrato', v)} tooltip="Adds periodic pitch modulation." />
                    <div className="flex items-center gap-2 group relative">
                      <input 
                        type="checkbox" 
                        checked={patch.osc1.sync} 
                        onChange={e => updatePatch('osc1', 'sync', e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-brand-primary focus:ring-brand-primary/20"
                      />
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">SYNC</span>
                      <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                        Hard sync: Resets Osc 1 phase when master completes a cycle. Creates sharp, aggressive, harmonically complex tones.
                        <div className="absolute top-full left-2 border-4 border-transparent border-t-zinc-800" />
                      </div>
                    </div>
                  </div>
                </div>
              </ProSection>
              <ProSection title="OSC 2">
                <div className="space-y-6">
                  <WaveformSelector value={patch.osc2.waveform} onChange={v => updatePatch('osc2', 'waveform', v)} />
                  <div className="grid grid-cols-2 gap-6">
                    <Knob label="PITCH" value={patch.osc2.pitch} min={-64} max={63} onChange={v => updatePatch('osc2', 'pitch', v)} tooltip="Adjusts the base frequency in semitones." />
                    <Knob label="DETUNE" value={patch.osc2.detune} min={-64} max={63} onChange={v => updatePatch('osc2', 'detune', v)} tooltip="Fine-tunes frequency for a thicker sound." />
                    <Knob label="PW" value={patch.osc2.pulseWidth} onChange={v => updatePatch('osc2', 'pulseWidth', v)} tooltip="Changes square wave width and harmonics." />
                    <Knob label="VIB" value={patch.osc2.vibrato} onChange={v => updatePatch('osc2', 'vibrato', v)} tooltip="Adds periodic pitch modulation." />
                    <div className="flex items-center gap-2 group relative">
                      <input 
                        type="checkbox" 
                        checked={patch.osc2.sync} 
                        onChange={e => updatePatch('osc2', 'sync', e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-brand-primary focus:ring-brand-primary/20"
                      />
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">SYNC</span>
                      <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                        Hard sync: Resets Osc 2 phase when master completes a cycle. Creates sharp, aggressive, harmonically complex tones.
                        <div className="absolute top-full left-2 border-4 border-transparent border-t-zinc-800" />
                      </div>
                    </div>
                  </div>
                </div>
              </ProSection>
              <ProSection title="MIXER">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="OSC 1" value={patch.mixer.osc1Level} onChange={v => updatePatch('mixer', 'osc1Level', v)} tooltip="Volume level of Oscillator 1." />
                  <Knob label="OSC 2" value={patch.mixer.osc2Level} onChange={v => updatePatch('mixer', 'osc2Level', v)} tooltip="Volume level of Oscillator 2." />
                  <Knob label="SUB" value={patch.mixer.subLevel} onChange={v => updatePatch('mixer', 'subLevel', v)} tooltip="Volume level of the Sub Oscillator." />
                  <Knob label="NOISE" value={patch.mixer.noiseLevel} onChange={v => updatePatch('mixer', 'noiseLevel', v)} tooltip="Volume level of the Noise generator." />
                  <Knob label="RING MOD" value={patch.mixer.ringMod} onChange={v => updatePatch('mixer', 'ringMod', v)} tooltip="Metallic texture via Osc 1 & 2 multiplication." />
                </div>
              </ProSection>
              <ProSection title="SUB / NOISE">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="SUB WAVE" value={patch.subOsc.waveform} onChange={v => updatePatch('subOsc', 'waveform', v)} tooltip="Selects the sub-oscillator shape (Sine, Tri, Saw, Square)." />
                  <Knob label="NOISE TYPE" value={patch.noise.type} onChange={v => updatePatch('noise', 'type', v)} tooltip="Changes the noise color (White, Pink, etc.)." />
                </div>
              </ProSection>
            </>
          )}

          {activeTab === 'filter' && (
            <>
              <ProSection title="FILTER CORE">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="CUTOFF" value={patch.filter.cutoff} onChange={v => updatePatch('filter', 'cutoff', v)} tooltip="Sets the frequency where attenuation begins. Lower values make the sound darker." />
                  <Knob label="RES" value={patch.filter.resonance} onChange={v => updatePatch('filter', 'resonance', v)} tooltip="Boosts frequencies around the cutoff point. High values add a 'whistling' quality." />
                  <Knob label="TYPE" value={patch.filter.type} onChange={v => updatePatch('filter', 'type', v)} tooltip="Selects filter mode: Low Pass (removes highs), High Pass (removes lows), or Band Pass." />
                  <Knob label="TRACK" value={patch.filter.tracking} onChange={v => updatePatch('filter', 'tracking', v)} tooltip="Keyboard Tracking: How much the cutoff frequency follows the notes you play." />
                </div>
              </ProSection>
              <ProSection title="MODULATION">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ENV AMT" value={patch.filter.envAmount} min={-64} max={63} onChange={v => updatePatch('filter', 'envAmount', v)} tooltip="Modulation depth from Envelope 2 to the filter cutoff." />
                  <Knob label="LFO1 AMT" value={patch.filter.lfo1Amount} min={-64} max={63} onChange={v => updatePatch('filter', 'lfo1Amount', v)} tooltip="Modulation depth from LFO 1 to the filter cutoff." />
                </div>
              </ProSection>
            </>
          )}

          {activeTab === 'envelopes' && (
            <>
              <ProSection title="ENV 1 (AMP)">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ATTACK" value={patch.env1.attack} onChange={v => updatePatch('env1', 'attack', v)} tooltip="Time to reach max level after trigger." />
                  <Knob label="DECAY" value={patch.env1.decay} onChange={v => updatePatch('env1', 'decay', v)} tooltip="Time to drop from peak to sustain level." />
                  <Knob label="SUSTAIN" value={patch.env1.sustain} onChange={v => updatePatch('env1', 'sustain', v)} tooltip="Level maintained while note is held." />
                  <Knob label="RELEASE" value={patch.env1.release} onChange={v => updatePatch('env1', 'release', v)} tooltip="Time to fade out after note release." />
                  <Knob label="VELOCITY" value={patch.env1.velocity} onChange={v => updatePatch('env1', 'velocity', v)} tooltip="Sensitivity to key press strength." />
                </div>
              </ProSection>
              <ProSection title="ENV 2 (MOD)">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ATTACK" value={patch.env2.attack} onChange={v => updatePatch('env2', 'attack', v)} tooltip="Time to reach max level after trigger." />
                  <Knob label="DECAY" value={patch.env2.decay} onChange={v => updatePatch('env2', 'decay', v)} tooltip="Time to drop from peak to sustain level." />
                  <Knob label="SUSTAIN" value={patch.env2.sustain} onChange={v => updatePatch('env2', 'sustain', v)} tooltip="Level maintained while note is held." />
                  <Knob label="RELEASE" value={patch.env2.release} onChange={v => updatePatch('env2', 'release', v)} tooltip="Time to fade out after note release." />
                  <Knob label="VELOCITY" value={patch.env2.velocity} onChange={v => updatePatch('env2', 'velocity', v)} tooltip="Sensitivity to key press strength." />
                </div>
              </ProSection>
              <ProSection title="ENV 3 (MOD)">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ATTACK" value={patch.env3.attack} onChange={v => updatePatch('env3', 'attack', v)} tooltip="Time to reach max level after trigger." />
                  <Knob label="DECAY" value={patch.env3.decay} onChange={v => updatePatch('env3', 'decay', v)} tooltip="Time to drop from peak to sustain level." />
                  <Knob label="SUSTAIN" value={patch.env3.sustain} onChange={v => updatePatch('env3', 'sustain', v)} tooltip="Level maintained while note is held." />
                  <Knob label="RELEASE" value={patch.env3.release} onChange={v => updatePatch('env3', 'release', v)} tooltip="Time to fade out after note release." />
                  <Knob label="VELOCITY" value={patch.env3.velocity} onChange={v => updatePatch('env3', 'velocity', v)} tooltip="Sensitivity to key press strength." />
                </div>
              </ProSection>
            </>
          )}

          {activeTab === 'modulation' && (
            <>
              <ProSection title="LFO 1">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="WAVE" value={patch.lfo1.waveform} onChange={v => updatePatch('lfo1', 'waveform', v)} tooltip="Selects the modulation shape." />
                  <Knob label="RATE" value={patch.lfo1.rate} onChange={v => updatePatch('lfo1', 'rate', v)} tooltip="Speed of the modulation cycle." />
                  <Knob label="DELAY" value={patch.lfo1.delay} onChange={v => updatePatch('lfo1', 'delay', v)} tooltip="Time before modulation starts." />
                  <div className="flex items-center gap-2 group relative">
                    <input 
                      type="checkbox" 
                      checked={patch.lfo1.sync} 
                      onChange={e => updatePatch('lfo1', 'sync', e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-brand-primary focus:ring-brand-primary/20"
                    />
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">SYNC</span>
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                      Tempo Sync: Locks LFO 1 rate to the project BPM. Modulation stays perfectly in time with your track.
                      <div className="absolute top-full left-2 border-4 border-transparent border-t-zinc-800" />
                    </div>
                  </div>
                </div>
              </ProSection>
              <ProSection title="LFO 2">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="WAVE" value={patch.lfo2.waveform} onChange={v => updatePatch('lfo2', 'waveform', v)} tooltip="Selects the modulation shape." />
                  <Knob label="RATE" value={patch.lfo2.rate} onChange={v => updatePatch('lfo2', 'rate', v)} tooltip="Speed of the modulation cycle." />
                  <Knob label="DELAY" value={patch.lfo2.delay} onChange={v => updatePatch('lfo2', 'delay', v)} tooltip="Time before modulation starts." />
                  <div className="flex items-center gap-2 group relative">
                    <input 
                      type="checkbox" 
                      checked={patch.lfo2.sync} 
                      onChange={e => updatePatch('lfo2', 'sync', e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-brand-primary focus:ring-brand-primary/20"
                    />
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">SYNC</span>
                    <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                      Tempo Sync: Locks LFO 2 rate to the project BPM. Modulation stays perfectly in time with your track.
                      <div className="absolute top-full left-2 border-4 border-transparent border-t-zinc-800" />
                    </div>
                  </div>
                </div>
              </ProSection>
              <ProSection title="MOD MATRIX (TOP 4)">
                <div className="space-y-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-2 bg-zinc-900/30 p-2 rounded border border-zinc-800/50">
                      <div className="text-[8px] font-black text-zinc-600 w-4">{i+1}</div>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <div className="group relative">
                          <input 
                            type="number" 
                            value={patch.modMatrix[i]?.source || 0} 
                            onChange={e => {
                              const newMatrix = [...patch.modMatrix];
                              newMatrix[i] = { ...(newMatrix[i] || { source: 0, destination: 0, amount: 0 }), source: parseInt(e.target.value) };
                              setPatch(p => ({ ...p, modMatrix: newMatrix }));
                            }}
                            className="w-full bg-zinc-800 text-[9px] text-white border border-zinc-700 rounded px-1 py-0.5"
                            placeholder="SRC"
                          />
                          <div className="absolute bottom-full left-0 mb-2 w-32 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                            Modulation Source (e.g., LFO, Env, Velocity).
                          </div>
                        </div>
                        <div className="group relative">
                          <input 
                            type="number" 
                            value={patch.modMatrix[i]?.destination || 0} 
                            onChange={e => {
                              const newMatrix = [...patch.modMatrix];
                              newMatrix[i] = { ...(newMatrix[i] || { source: 0, destination: 0, amount: 0 }), destination: parseInt(e.target.value) };
                              setPatch(p => ({ ...p, modMatrix: newMatrix }));
                            }}
                            className="w-full bg-zinc-800 text-[9px] text-white border border-zinc-700 rounded px-1 py-0.5"
                            placeholder="DEST"
                          />
                          <div className="absolute bottom-full left-0 mb-2 w-32 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                            Modulation Destination (e.g., Pitch, Cutoff, Level).
                          </div>
                        </div>
                        <div className="group relative">
                          <input 
                            type="number" 
                            value={patch.modMatrix[i]?.amount || 0} 
                            onChange={e => {
                              const newMatrix = [...patch.modMatrix];
                              newMatrix[i] = { ...(newMatrix[i] || { source: 0, destination: 0, amount: 0 }), amount: parseInt(e.target.value) };
                              setPatch(p => ({ ...p, modMatrix: newMatrix }));
                            }}
                            className="w-full bg-zinc-800 text-[9px] text-white border border-zinc-700 rounded px-1 py-0.5"
                            placeholder="AMT"
                          />
                          <div className="absolute bottom-full left-0 mb-2 w-32 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                            Modulation Depth/Amount (-64 to +63).
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ProSection>
              <ProSection title="EFFECTS">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="DIST TYPE" value={patch.distortion.type} onChange={v => updatePatch('distortion', 'type', v)} tooltip="Selects the type of distortion/saturation." />
                  <Knob label="DIST LVL" value={patch.distortion.level} onChange={v => updatePatch('distortion', 'level', v)} tooltip="Amount of distortion applied to the signal." />
                  <Knob label="CHOR TYPE" value={patch.chorus.type} onChange={v => updatePatch('chorus', 'type', v)} tooltip="Selects the chorus/flanger/phaser mode." />
                  <Knob label="CHOR LVL" value={patch.chorus.level} onChange={v => updatePatch('chorus', 'level', v)} tooltip="Mix level of the chorus effect." />
                </div>
              </ProSection>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-[10px] font-black tracking-widest transition-all",
        active ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20" : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pro-panel overflow-hidden">
      <div className="bg-[#1a1011] px-4 py-2 border-b border-[#2a1517]">
        <h3 className="text-[10px] font-black tracking-[0.2em] text-brand-primary uppercase">{title}</h3>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

function WaveformSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const waveforms = [
    { id: 0, name: 'SINE', icon: <div className="w-6 h-6 border-2 border-current rounded-full flex items-center justify-center"><div className="w-4 h-1 bg-current rounded-full" /></div> },
    { id: 32, name: 'TRI', icon: <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[14px] border-b-current" /> },
    { id: 64, name: 'SAW', icon: <div className="w-6 h-6 flex items-end"><div className="w-0 h-0 border-l-[12px] border-l-transparent border-b-[16px] border-b-current" /><div className="w-0 h-0 border-l-[12px] border-l-transparent border-b-[16px] border-b-current" /></div> },
    { id: 96, name: 'SQR', icon: <div className="w-5 h-4 border-2 border-current border-b-0" /> },
  ];

  return (
    <div className="space-y-2">
      <div className="text-[9px] font-black text-zinc-600 tracking-widest uppercase">Waveform</div>
      <div className="flex gap-1">
        {waveforms.map((wf) => (
          <button
            key={wf.id}
            onClick={() => onChange(wf.id)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 rounded-lg border transition-all",
              value >= wf.id && value < wf.id + 32
                ? "bg-brand-primary/20 border-brand-primary text-brand-primary shadow-lg shadow-brand-primary/10"
                : "bg-zinc-900 border-zinc-800 text-zinc-600 hover:border-zinc-700"
            )}
          >
            <div className="mb-1">{wf.icon}</div>
            <span className="text-[8px] font-black">{wf.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Knob({ label, value, min = 0, max = 127, onChange, tooltip }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; tooltip?: string }) {
  const percentage = ((value - min) / (max - min)) * 100;
  const rotation = -135 + (percentage * 2.7);

  return (
    <div className="knob-container group relative">
      <div className="text-[9px] font-black text-zinc-600 group-hover:text-brand-primary transition-colors tracking-widest uppercase mb-1">{label}</div>
      <div className="relative">
        <div className="knob-ring group-active:scale-95">
          <div 
            className="knob-indicator" 
            style={{ transform: `rotate(${rotation}deg)` }} 
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 opacity-0 cursor-ns-resize"
        />
      </div>
      <div className="text-[10px] font-mono font-bold text-zinc-500 mt-1">{value}</div>
      
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-zinc-900 border border-zinc-800 rounded text-[8px] text-zinc-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl text-center">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
        </div>
      )}
    </div>
  );
}
