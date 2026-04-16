import { useState, useEffect } from 'react';
import { auth, signInWithPopup, googleProvider, signOut, onAuthStateChanged, User } from './firebase';
import { PatchEditor } from './components/PatchEditor';
import { SampleEditor } from './components/SampleEditor';
import { Library } from './components/Library';
import { midiService } from './services/MidiService';
import { Music, Waves, Library as LibraryIcon, LogIn, LogOut, User as UserIcon, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

type View = 'patch' | 'sample' | 'library';

export default function App() {
  const [view, setView] = useState<View>('patch');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [midiActive, setMidiActive] = useState(false);

  const [midiPorts, setMidiPorts] = useState<{ inputs: MIDIInput[]; outputs: MIDIOutput[] }>({ inputs: [], outputs: [] });
  const [selectedPorts, setSelectedPorts] = useState<{ input: string | null; output: string | null }>({ input: null, output: null });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    
    const checkMidi = async () => {
      const access = await midiService.requestAccess();
      setMidiActive(access);
      if (access) {
        setMidiPorts(midiService.getAvailablePorts());
        setSelectedPorts(midiService.getSelectedPorts());
      }
    };
    checkMidi();

    return () => unsubscribe();
  }, []);

  const handlePortChange = (type: 'input' | 'output', id: string) => {
    if (type === 'input') midiService.setInput(id);
    else midiService.setOutput(id);
    setSelectedPorts(midiService.getSelectedPorts());
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0506] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0506] text-zinc-100 font-sans selection:bg-brand-primary/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#2a1517] bg-[#0a0506]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-primary rounded-xl flex items-center justify-center shadow-2xl shadow-brand-primary/40 rotate-3 hover:rotate-0 transition-transform cursor-pointer">
              <Radio className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase italic">Circuit Tracks</h1>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-brand-primary font-black uppercase tracking-[0.3em]">Pro Manager</span>
                <div className={cn("w-1.5 h-1.5 rounded-full", midiActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-800")} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 bg-[#140a0b] p-1 rounded-lg border border-[#2a1517]">
              <select 
                value={selectedPorts.input || ''} 
                onChange={(e) => handlePortChange('input', e.target.value)}
                className="bg-transparent text-[8px] font-black text-zinc-500 border-none focus:ring-0 uppercase tracking-tighter max-w-[100px]"
              >
                <option value="">No Input</option>
                {midiPorts.inputs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="w-px h-4 bg-zinc-800" />
              <select 
                value={selectedPorts.output || ''} 
                onChange={(e) => handlePortChange('output', e.target.value)}
                className="bg-transparent text-[8px] font-black text-zinc-500 border-none focus:ring-0 uppercase tracking-tighter max-w-[100px]"
              >
                <option value="">No Output</option>
                {midiPorts.outputs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 rounded-lg border border-zinc-800">
              <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">MIDI</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2 bg-[#140a0b] p-1.5 rounded-xl border border-[#2a1517]">
            <NavButton 
              active={view === 'patch'} 
              onClick={() => setView('patch')}
              icon={<Waves className="w-4 h-4" />}
              label="SYNTH"
            />
            <NavButton 
              active={view === 'sample'} 
              onClick={() => setView('sample')}
              icon={<Music className="w-4 h-4" />}
              label="DRUMS"
            />
            <NavButton 
              active={view === 'library'} 
              onClick={() => setView('library')}
              icon={<LibraryIcon className="w-4 h-4" />}
              label="LIBRARY"
            />
          </nav>

          <div className="flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-black text-zinc-200 uppercase tracking-widest">{user.displayName}</p>
                  <button 
                    onClick={handleLogout}
                    className="text-[10px] font-bold text-zinc-500 hover:text-brand-primary transition-colors uppercase"
                  >
                    Disconnect
                  </button>
                </div>
                <div className="relative">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-brand-primary/20 p-0.5" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                      <UserIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[#0a0506] rounded-full" />
                </div>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="pro-button pro-button-primary"
              >
                <LogIn className="w-4 h-4" />
                SIGN IN
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {view === 'patch' && <PatchEditor user={user} />}
            {view === 'sample' && <SampleEditor user={user} />}
            {view === 'library' && <Library user={user} setView={setView} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-auto border-t border-[#2a1517] py-12 bg-[#0a0506]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3 opacity-50 grayscale hover:grayscale-0 transition-all">
             <Radio className="w-6 h-6 text-brand-primary" />
             <span className="text-sm font-black tracking-widest uppercase">Circuit Tracks Pro</span>
          </div>
          <div className="flex items-center gap-8 text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">
            <a href="https://customer.novationmusic.com/sites/customer/files/novation/downloads/10590/circuit-tracks-programmers-reference-guide-en_0.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">MIDI Implementation</a>
            <a href="https://customer.novationmusic.com/sites/customer/files/novation/downloads/10590/circuit-tracks-programmers-reference-guide-en_0.pdf" target="_blank" rel="noopener noreferrer" className="hover:text-brand-primary transition-colors">SysEx Protocol</a>
          </div>
          <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">© 2026 Circuit Tracks Pro</p>
        </div>
      </footer>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-2.5 rounded-lg transition-all text-[11px] font-black tracking-[0.15em]",
        active 
          ? "bg-brand-primary text-white shadow-xl shadow-brand-primary/30" 
          : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
      )}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
