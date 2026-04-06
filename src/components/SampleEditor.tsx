import { useState, useRef, useEffect } from 'react';
import { User, db, setDoc, doc, Timestamp } from '../firebase';
import { SampleData } from '../types';
import { midiService } from '../services/MidiService';
import { Upload, Play, Save, Trash2, Scissors, Music, Volume2, RefreshCw, Send, Layers, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function SampleEditor({ user }: { user: User | null }) {
  const [sample, setSample] = useState<SampleData & { decay: number; distortion: number; eq: number }>({
    name: "NEW SAMPLE",
    data: "",
    start: 0,
    end: 127,
    pitch: 0,
    filter: 64,
    decay: 64,
    distortion: 0,
    eq: 64,
    authorUid: user?.uid || ""
  });
  const [slot, setSlot] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateParam = (field: string, value: number) => {
    setSample(s => ({ ...s, [field]: value }));
    // Live MIDI update for drum params
    const paramMap: Record<string, number> = {
      'data': 0, // Sample selection (not quite right for CC but used as index)
      'pitch': 1,
      'decay': 2,
      'distortion': 3,
      'filter': 4
    };
    if (paramMap[field] !== undefined) {
      midiService.sendDrumParam(slot, paramMap[field], value);
    }
  };

  const handleFetch = () => {
    midiService.requestDrumDump(slot);
    alert(`Fetching state for Drum Slot ${slot + 1}...`);
  };

  const handleSend = () => {
    // Send all params to the selected slot
    midiService.sendDrumParam(slot, 0, 0); // Sample index (placeholder)
    midiService.sendDrumParam(slot, 1, sample.pitch + 64);
    midiService.sendDrumParam(slot, 2, sample.decay);
    midiService.sendDrumParam(slot, 3, sample.distortion);
    midiService.sendDrumParam(slot, 4, sample.filter);
    alert(`Drum Slot ${slot + 1} updated via MIDI!`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSample(s => ({ ...s, data: base64, name: file.name.split('.')[0].toUpperCase() }));
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handlePlay = () => {
    if (!sample.data) return;
    if (audioRef.current) {
      audioRef.current.currentTime = (sample.start / 127) * audioRef.current.duration;
      audioRef.current.play();
      
      const duration = audioRef.current.duration;
      const stopTime = (sample.end / 127) * duration;
      const checkInterval = setInterval(() => {
        if (audioRef.current && audioRef.current.currentTime >= stopTime) {
          audioRef.current.pause();
          clearInterval(checkInterval);
        }
      }, 10);
    }
  };

  const handleSave = async () => {
    if (!user || !sample.data) return;
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      await setDoc(doc(db, 'samples', id), {
        ...sample,
        authorUid: user.uid,
        createdAt: Timestamp.now()
      });
      alert("Sample saved to cloud!");
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Pro Toolbar */}
      <div className="pro-panel p-4 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-1 w-full">
          <div className="w-12 h-12 bg-brand-primary/10 rounded-lg flex items-center justify-center border border-brand-primary/20">
            <Music className="w-6 h-6 text-brand-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={sample.name}
                onChange={(e) => setSample(s => ({ ...s, name: e.target.value.toUpperCase() }))}
                className="bg-transparent text-xl font-black text-white border-none focus:ring-0 uppercase tracking-widest"
                placeholder="SAMPLE NAME"
              />
              <div className="flex bg-[#1a1011] p-1 rounded-lg border border-[#2a1517]">
                {[0, 1, 2, 3].map(i => (
                  <button
                    key={i}
                    onClick={() => setSlot(i)}
                    className={cn(
                      "px-3 py-1 rounded-md text-[10px] font-black transition-all",
                      slot === i ? "bg-brand-primary text-white" : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    DRUM {i + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleFetch} className="pro-button pro-button-secondary">
            <RefreshCw className="w-4 h-4" /> FETCH
          </button>
          <button onClick={handleSend} className="pro-button pro-button-secondary">
            <Send className="w-4 h-4" /> SEND
          </button>
          <div className="w-px h-8 bg-zinc-800 mx-2" />
          {user && (
            <button onClick={handleSave} disabled={saving} className="pro-button pro-button-primary">
              <Save className="w-4 h-4" /> {saving ? 'SAVING...' : 'SAVE CLOUD'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-[#140a0b] p-8 rounded-2xl border border-[#2a1517] text-center">
        {!sample.data ? (
          <div className="space-y-4 py-12">
            <div className="w-20 h-20 bg-[#1a1011] rounded-full flex items-center justify-center mx-auto border border-[#3a1a1d] shadow-2xl shadow-brand-primary/5">
              <Upload className="w-10 h-10 text-brand-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-widest uppercase">Import Sample</h3>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-tighter mt-1">WAV / MP3 / AIFF</p>
            </div>
            <label className="pro-button pro-button-primary mx-auto cursor-pointer w-fit">
              BROWSE FILES
              <input type="file" className="hidden" accept="audio/*" onChange={handleFileUpload} />
            </label>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Waveform Visualization */}
            <div className="h-48 bg-[#0a0506] rounded-2xl border border-[#2a1517] relative overflow-hidden flex items-center justify-center group">
              <div className="absolute inset-0 flex items-center justify-around px-8 opacity-30">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="w-1 bg-brand-primary rounded-full transition-all duration-500" style={{ height: `${Math.random() * 80 + 10}%` }} />
                ))}
              </div>
              <div 
                className="absolute top-0 bottom-0 bg-brand-primary/10 border-x-2 border-brand-primary/40 shadow-[0_0_30px_rgba(255,45,85,0.1)]"
                style={{ 
                  left: `${(sample.start / 127) * 100}%`, 
                  right: `${100 - (sample.end / 127) * 100}%` 
                }}
              />
              <div className="absolute top-4 left-4 text-[10px] font-black text-brand-primary/50 uppercase tracking-widest">Waveform Preview</div>
              <button 
                onClick={handlePlay} 
                className="relative w-20 h-20 bg-brand-primary hover:bg-brand-accent text-white rounded-full flex items-center justify-center shadow-2xl shadow-brand-primary/40 active:scale-90 transition-all z-10"
              >
                <Play className="w-8 h-8 fill-current ml-1" />
              </button>
              <button 
                onClick={() => setSample(s => ({ ...s, data: "" }))}
                className="absolute top-4 right-4 p-2 text-zinc-700 hover:text-brand-primary transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            <audio ref={audioRef} src={sample.data} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ProSection title="TRIMMING" icon={<Scissors className="w-4 h-4 text-brand-primary" />}>
          <div className="space-y-6">
            <Knob label="START" value={sample.start} onChange={(v) => updateParam('start', v)} />
            <Knob label="END" value={sample.end} onChange={(v) => updateParam('end', v)} />
          </div>
        </ProSection>

        <ProSection title="PITCH & TIME" icon={<Activity className="w-4 h-4 text-brand-primary" />}>
          <div className="space-y-6">
            <Knob label="PITCH" value={sample.pitch} min={-64} max={63} onChange={(v) => updateParam('pitch', v)} />
            <Knob label="DECAY" value={sample.decay} onChange={(v) => updateParam('decay', v)} />
          </div>
        </ProSection>

        <ProSection title="PROCESSING" icon={<Layers className="w-4 h-4 text-brand-primary" />}>
          <div className="space-y-6">
            <Knob label="FILTER" value={sample.filter} onChange={(v) => updateParam('filter', v)} />
            <Knob label="DRIVE" value={sample.distortion} onChange={(v) => updateParam('distortion', v)} />
          </div>
        </ProSection>
      </div>
    </div>
  );
}

function ProSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pro-panel overflow-hidden">
      <div className="bg-[#1a1011] px-4 py-2 border-b border-[#2a1517] flex items-center gap-2">
        {icon}
        <h3 className="text-[10px] font-black tracking-[0.2em] text-brand-primary uppercase">{title}</h3>
      </div>
      <div className="p-6">
        {children}
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
