import { useState, useEffect } from 'react';
import { User, db, collection, query, orderBy, onSnapshot, deleteDoc, doc } from '../firebase';
import { PatchRecord, SampleData } from '../types';
import { Waves, Music, Trash2, Download, Search, Tag, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export function Library({ user, setView }: { user: User | null; setView: (v: 'patch' | 'sample' | 'library') => void }) {
  const [patches, setPatches] = useState<PatchRecord[]>([]);
  const [samples, setSamples] = useState<SampleData[]>([]);
  const [tab, setTab] = useState<'patches' | 'samples'>('patches');
  const [search, setSearch] = useState("");

  useEffect(() => {
    const qPatches = query(collection(db, 'patches'), orderBy('createdAt', 'desc'));
    const unsubPatches = onSnapshot(qPatches, (snapshot) => {
      setPatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PatchRecord)));
    });

    const qSamples = query(collection(db, 'samples'), orderBy('createdAt', 'desc'));
    const unsubSamples = onSnapshot(qSamples, (snapshot) => {
      setSamples(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SampleData)));
    });

    return () => {
      unsubPatches();
      unsubSamples();
    };
  }, []);

  const handleDelete = async (type: 'patches' | 'samples', id: string) => {
    if (!confirm("Are you sure you want to delete this?")) return;
    try {
      await deleteDoc(doc(db, type, id));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const filteredPatches = patches.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSamples = samples.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button 
            onClick={() => setTab('patches')}
            className={cn("px-6 py-2 rounded-md text-sm font-bold transition-all", tab === 'patches' ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300")}
          >
            Patches
          </button>
          <button 
            onClick={() => setTab('samples')}
            className={cn("px-6 py-2 rounded-md text-sm font-bold transition-all", tab === 'samples' ? "bg-indigo-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300")}
          >
            Samples
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search library..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tab === 'patches' ? (
          filteredPatches.map(patch => (
            <LibraryCard 
              key={patch.id}
              title={patch.name}
              subtitle={patch.author}
              icon={<Waves className="w-5 h-5 text-indigo-400" />}
              isOwner={user?.uid === patch.authorUid}
              onDelete={() => handleDelete('patches', patch.id)}
              onDownload={() => {
                const blob = new Blob([atob(patch.data)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${patch.name}.json`;
                a.click();
              }}
            />
          ))
        ) : (
          filteredSamples.map(sample => (
            <LibraryCard 
              key={sample.id}
              title={sample.name}
              subtitle="User Sample"
              icon={<Music className="w-5 h-5 text-emerald-400" />}
              isOwner={user?.uid === sample.authorUid}
              onDelete={() => handleDelete('samples', sample.id!)}
              onDownload={() => {
                const a = document.createElement('a');
                a.href = sample.data;
                a.download = `${sample.name}.wav`;
                a.click();
              }}
            />
          ))
        )}
      </div>

      {(tab === 'patches' ? filteredPatches : filteredSamples).length === 0 && (
        <div className="text-center py-20 bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
            <Tag className="w-8 h-8 text-zinc-700" />
          </div>
          <h3 className="text-zinc-400 font-medium">No items found in the library</h3>
          <p className="text-zinc-600 text-sm mt-1">Try a different search or create something new!</p>
        </div>
      )}
    </div>
  );
}

function LibraryCard({ title, subtitle, icon, isOwner, onDelete, onDownload }: { title: string; subtitle: string; icon: React.ReactNode; isOwner: boolean; onDelete: () => void; onDownload: () => void }) {
  return (
    <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 group-hover:border-indigo-500/30 transition-colors">
            {icon}
          </div>
          <div>
            <h4 className="font-bold text-zinc-200 truncate max-w-[150px]">{title}</h4>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <UserIcon className="w-3 h-3" />
              <span>{subtitle}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onDownload} className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all">
            <Download className="w-4 h-4" />
          </button>
          {isOwner && (
            <button onClick={onDelete} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
