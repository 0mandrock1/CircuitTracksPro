import { useState, useEffect, useCallback } from 'react';
import { User, db, setDoc, doc, Timestamp } from '../firebase';
import { PatchData, OscillatorParams, FilterParams, EnvelopeParams, LFOParams } from '../types';
import { SynthPreview } from './SynthPreview';
import { midiService } from '../services/MidiService';
import { Save, Play, Download, Upload, Cpu, Activity, Zap, Layers, RefreshCw, Send, Radio } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

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
  const [trigger, setTrigger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [midiStatus, setMidiStatus] = useState("Disconnected");
  const [activeTab, setActiveTab] = useState<'oscillators' | 'filter' | 'envelopes' | 'modulation'>('oscillators');

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

  useEffect(() => {
    const cleanup = midiService.onPatchReceived((data) => {
      console.log("SysEx Received:", data);
      // Simulate decoding the 340 bytes
      setPatch(prev => ({ ...prev, name: "FETCHED FROM CIRCUIT" }));
      alert("Patch data received from Circuit!");
    });
    return cleanup;
  }, []);

  const handleFetch = () => {
    midiService.requestPatchDump(0);
  };

  const handleSend = () => {
    midiService.sendPatch(patch, 0);
    alert("Patch sent to Circuit!");
  };

  return (
    <div className="space-y-6">
      <SynthPreview patch={patch as any} trigger={trigger} />
      
      {/* Pro Toolbar */}
      <div className="pro-panel p-4 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-1 w-full">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-lg flex items-center justify-center border border-brand-primary/20">
            <Cpu className="w-6 h-6 text-brand-primary" />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={patch.name}
              onChange={(e) => setPatch(p => ({ ...p, name: e.target.value }))}
              className="bg-transparent text-xl font-black text-white border-none focus:ring-0 w-full uppercase tracking-widest"
              placeholder="PATCH NAME"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className={cn("w-2 h-2 rounded-full", midiStatus !== "Disconnected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-700")} />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">MIDI: {midiStatus}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleFetch} className="pro-button pro-button-secondary">
            <RefreshCw className="w-4 h-4" /> FETCH
          </button>
          <button onClick={handleSend} className="pro-button pro-button-secondary">
            <Send className="w-4 h-4" /> SEND
          </button>
          <div className="w-px h-8 bg-zinc-800 mx-2 hidden sm:block" />
          <button onClick={() => setTrigger(!trigger)} className="pro-button pro-button-primary">
            <Play className="w-4 h-4 fill-current" /> PREVIEW
          </button>
          {user && (
            <button onClick={() => {}} className="pro-button bg-emerald-600 hover:bg-emerald-500 text-white">
              <Save className="w-4 h-4" /> CLOUD
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
                    <Knob label="PITCH" value={patch.osc1.pitch} min={-64} max={63} onChange={v => updatePatch('osc1', 'pitch', v)} />
                    <Knob label="DETUNE" value={patch.osc1.detune} min={-64} max={63} onChange={v => updatePatch('osc1', 'detune', v)} />
                    <Knob label="PW" value={patch.osc1.pulseWidth} onChange={v => updatePatch('osc1', 'pulseWidth', v)} />
                    <Knob label="VIB" value={patch.osc1.vibrato} onChange={v => updatePatch('osc1', 'vibrato', v)} />
                  </div>
                </div>
              </ProSection>
              <ProSection title="OSC 2">
                <div className="space-y-6">
                  <WaveformSelector value={patch.osc2.waveform} onChange={v => updatePatch('osc2', 'waveform', v)} />
                  <div className="grid grid-cols-2 gap-6">
                    <Knob label="PITCH" value={patch.osc2.pitch} min={-64} max={63} onChange={v => updatePatch('osc2', 'pitch', v)} />
                    <Knob label="DETUNE" value={patch.osc2.detune} min={-64} max={63} onChange={v => updatePatch('osc2', 'detune', v)} />
                    <Knob label="PW" value={patch.osc2.pulseWidth} onChange={v => updatePatch('osc2', 'pulseWidth', v)} />
                    <Knob label="VIB" value={patch.osc2.vibrato} onChange={v => updatePatch('osc2', 'vibrato', v)} />
                  </div>
                </div>
              </ProSection>
              <ProSection title="MIXER">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="OSC 1" value={patch.mixer.osc1Level} onChange={v => updatePatch('mixer', 'osc1Level', v)} />
                  <Knob label="OSC 2" value={patch.mixer.osc2Level} onChange={v => updatePatch('mixer', 'osc2Level', v)} />
                  <Knob label="SUB" value={patch.mixer.subLevel} onChange={v => updatePatch('mixer', 'subLevel', v)} />
                  <Knob label="NOISE" value={patch.mixer.noiseLevel} onChange={v => updatePatch('mixer', 'noiseLevel', v)} />
                </div>
              </ProSection>
              <ProSection title="SUB / NOISE">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="SUB WAVE" value={patch.subOsc.waveform} onChange={v => updatePatch('subOsc', 'waveform', v)} />
                  <Knob label="NOISE TYPE" value={patch.noise.type} onChange={v => updatePatch('noise', 'type', v)} />
                </div>
              </ProSection>
            </>
          )}

          {activeTab === 'filter' && (
            <>
              <ProSection title="FILTER CORE">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="CUTOFF" value={patch.filter.cutoff} onChange={v => updatePatch('filter', 'cutoff', v)} />
                  <Knob label="RES" value={patch.filter.resonance} onChange={v => updatePatch('filter', 'resonance', v)} />
                  <Knob label="TYPE" value={patch.filter.type} onChange={v => updatePatch('filter', 'type', v)} />
                  <Knob label="TRACK" value={patch.filter.tracking} onChange={v => updatePatch('filter', 'tracking', v)} />
                </div>
              </ProSection>
              <ProSection title="MODULATION">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ENV AMT" value={patch.filter.envAmount} min={-64} max={63} onChange={v => updatePatch('filter', 'envAmount', v)} />
                  <Knob label="LFO1 AMT" value={patch.filter.lfo1Amount} min={-64} max={63} onChange={v => updatePatch('filter', 'lfo1Amount', v)} />
                </div>
              </ProSection>
            </>
          )}

          {activeTab === 'envelopes' && (
            <>
              <ProSection title="ENV 1 (AMP)">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ATTACK" value={patch.env1.attack} onChange={v => updatePatch('env1', 'attack', v)} />
                  <Knob label="DECAY" value={patch.env1.decay} onChange={v => updatePatch('env1', 'decay', v)} />
                  <Knob label="SUSTAIN" value={patch.env1.sustain} onChange={v => updatePatch('env1', 'sustain', v)} />
                  <Knob label="RELEASE" value={patch.env1.release} onChange={v => updatePatch('env1', 'release', v)} />
                </div>
              </ProSection>
              <ProSection title="ENV 2 (MOD)">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ATTACK" value={patch.env2.attack} onChange={v => updatePatch('env2', 'attack', v)} />
                  <Knob label="DECAY" value={patch.env2.decay} onChange={v => updatePatch('env2', 'decay', v)} />
                  <Knob label="SUSTAIN" value={patch.env2.sustain} onChange={v => updatePatch('env2', 'sustain', v)} />
                  <Knob label="RELEASE" value={patch.env2.release} onChange={v => updatePatch('env2', 'release', v)} />
                </div>
              </ProSection>
              <ProSection title="ENV 3 (MOD)">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="ATTACK" value={patch.env3.attack} onChange={v => updatePatch('env3', 'attack', v)} />
                  <Knob label="DECAY" value={patch.env3.decay} onChange={v => updatePatch('env3', 'decay', v)} />
                  <Knob label="SUSTAIN" value={patch.env3.sustain} onChange={v => updatePatch('env3', 'sustain', v)} />
                  <Knob label="RELEASE" value={patch.env3.release} onChange={v => updatePatch('env3', 'release', v)} />
                </div>
              </ProSection>
            </>
          )}

          {activeTab === 'modulation' && (
            <>
              <ProSection title="LFO 1">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="WAVE" value={patch.lfo1.waveform} onChange={v => updatePatch('lfo1', 'waveform', v)} />
                  <Knob label="RATE" value={patch.lfo1.rate} onChange={v => updatePatch('lfo1', 'rate', v)} />
                  <Knob label="DELAY" value={patch.lfo1.delay} onChange={v => updatePatch('lfo1', 'delay', v)} />
                </div>
              </ProSection>
              <ProSection title="LFO 2">
                <div className="grid grid-cols-2 gap-6">
                  <Knob label="WAVE" value={patch.lfo2.waveform} onChange={v => updatePatch('lfo2', 'waveform', v)} />
                  <Knob label="RATE" value={patch.lfo2.rate} onChange={v => updatePatch('lfo2', 'rate', v)} />
                  <Knob label="DELAY" value={patch.lfo2.delay} onChange={v => updatePatch('lfo2', 'delay', v)} />
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

function Knob({ label, value, min = 0, max = 127, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const percentage = ((value - min) / (max - min)) * 100;
  const rotation = -135 + (percentage * 2.7);

  return (
    <div className="knob-container group">
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
    </div>
  );
}
