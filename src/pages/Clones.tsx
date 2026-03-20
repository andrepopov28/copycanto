import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  Search, 
  Trash2, 
  Loader2,
  Download,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  handleFirestoreError,
  OperationType
} from '../db';
import { HeroSection } from '../components/HeroSection';
import { cn } from '../lib/utils';

interface Clone {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  audioUrl: string;
  voiceId: string;
  engine: string;
  userId: string;
  createdAt: any;
}

export const Clones: React.FC<{ user: any }> = ({ user }) => {
  const [clones, setClones] = useState<Clone[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');

  useEffect(() => {
    if (!user) return;

    const clonesQuery = query(
      collection(db, "clones"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(clonesQuery, (snapshot) => {
      const clonesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Clone));
      setClones(clonesData);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "clones");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this clone?")) {
      await deleteDoc(doc(db, "clones", id));
    }
  };

  const handleEdit = (clone: Clone) => {
    setEditingId(clone.id);
    setEditTitle(clone.title);
    setEditThumbnail(clone.thumbnail);
  };

  const saveEdit = async (id: string) => {
    await updateDoc(doc(db, "clones", id), {
      title: editTitle,
      thumbnail: editThumbnail
    });
    setEditingId(null);
  };

  const filteredClones = clones.filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <HeroSection 
        title="Clone Library"
        imageSrc="/assets/pink_panther_dj_hero.png"
        badge="Isolated Vocals"
      />

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input 
          type="text" 
          placeholder="Search your clones..." 
          className="input-field pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
        </div>
      ) : filteredClones.length === 0 ? (
        <div className="glass p-20 rounded-[40px] text-center space-y-6">
           <div className="w-20 h-20 bg-text-main/5 rounded-full flex items-center justify-center mx-auto">
            <Sparkles className="w-10 h-10 text-text-muted" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No clones found</h3>
            <p className="text-text-muted max-w-xs mx-auto">
              You haven't generated any isolated clones yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClones.map(clone => (
            <motion.div 
              key={clone.id}
              whileHover={{ y: -4 }}
              className="glass rounded-[32px] overflow-hidden group flex flex-col"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video">
                <img 
                  src={clone.thumbnail || `/assets/pink_panther_dj_hero.png`}
                  alt={clone.title} 
                  className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 left-3">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest backdrop-blur-md bg-brand-accent/80 text-white">
                    {clone.engine?.toUpperCase() || 'CLONE'}
                  </span>
                </div>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <a href={clone.audioUrl} download className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform hover:bg-white hover:text-brand-primary">
                    <Download className="w-5 h-5 fill-current" />
                  </a>
                </div>
              </div>

              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  {editingId === clone.id ? (
                    <div className="space-y-2 mb-2">
                      <input 
                        type="text" 
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="input-field text-sm p-2 w-full" 
                        placeholder="Clone Title"
                      />
                      <input 
                        type="text" 
                        value={editThumbnail}
                        onChange={(e) => setEditThumbnail(e.target.value)}
                        className="input-field text-sm p-2 w-full" 
                        placeholder="Thumbnail URL"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(clone.id)} className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 w-full flex justify-center"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 w-full flex justify-center"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-lg truncate">{clone.title}</h3>
                        <p className="text-sm text-text-muted truncate">Engine: {clone.engine?.toUpperCase() || 'UNKNOWN'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(clone)} className="p-2 rounded-xl hover:bg-text-main/10 text-text-muted transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(clone.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <div className="w-full bg-text-main/5 rounded-xl p-3 border border-glass-border">
                    <audio controls src={clone.audioUrl} className="w-full h-8 outline-none" controlsList="nodownload" />
                  </div>
                  <a 
                    href={clone.audioUrl}
                    download
                    className="w-full btn-secondary py-2 text-xs flex items-center justify-center gap-2"
                  >
                    <Download className="w-3 h-3" />
                    Download Clone
                  </a>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      )}
    </motion.div>
  );
};
