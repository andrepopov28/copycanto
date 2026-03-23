import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Disc, 
  Plus, 
  Search, 
  Trash2, 
  Play, 
  Loader2,
  Download,
  Share2,
  Mic2,
  Music2,
  ArrowRight,
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

interface Cover {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  audioUrl: string;
  voiceId: string;
  voiceName: string;
  userId: string;
  createdAt: any;
}

import { HeroSection } from '../components/HeroSection';

export const Covers: React.FC<{ user: any }> = ({ user }) => {
  const [covers, setCovers] = useState<Cover[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');

  useEffect(() => {
    if (!user) return;

    const coversQuery = query(
      collection(db, "covers"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(coversQuery, (snapshot: any) => {
      const coversData = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Cover));
      setCovers(coversData);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "covers");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this cover?")) {
      await deleteDoc(doc(db, "covers", id));
    }
  };

  const handleEdit = (cover: Cover) => {
    setEditingId(cover.id);
    setEditTitle(cover.title);
    setEditThumbnail(cover.thumbnail);
  };

  const saveEdit = async (id: string) => {
    await updateDoc(doc(db, "covers", id), {
      title: editTitle,
      thumbnail: editThumbnail
    });
    setEditingId(null);
  };

  const filteredCovers = covers.filter(c => 
    (c.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.voiceName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <HeroSection 
        title="Cover Library"
        subtitle="View and manage all your generated AI covers."
        imageSrc="/assets/bugs_bunny_hero_1773997735825.png"
        badge="AI Cover Suite"
      >
        <Link to="/create" className="btn-primary flex items-center gap-2 prismatic-liquid-hover">
          <Plus className="w-5 h-5 relative z-10" />
          <span className="relative z-10">Create New Cover</span>
        </Link>
      </HeroSection>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input 
          type="text" 
          placeholder="Search your covers..." 
          className="input-field pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
        </div>
      ) : filteredCovers.length === 0 ? (
        <div className="glass p-20 rounded-[40px] text-center space-y-6">
          <div className="w-20 h-20 bg-text-main/5 rounded-full flex items-center justify-center mx-auto">
            <Disc className="w-10 h-10 text-text-muted" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No covers found</h3>
            <p className="text-text-muted max-w-xs mx-auto">
              You haven't generated any AI covers yet. Pick a voice and a song to start the conversion.
            </p>
          </div>
          <button className="btn-secondary">How it works</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCovers.map(cover => (
            <motion.div 
              key={cover.id}
              whileHover={{ y: -4 }}
              className="glass rounded-[32px] overflow-hidden group"
            >
              <div className="relative aspect-video">
                <img 
                  src={cover.thumbnail || `/assets/bugs_bunny_hero_1773997735825.png`} 
                  alt={cover.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <a href={cover.audioUrl} download className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform hover:bg-white hover:text-brand-primary">
                    <Download className="w-5 h-5 fill-current" />
                  </a>
                </div>
              </div>
              
              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  {editingId === cover.id ? (
                    <div className="space-y-2 mb-2">
                      <input 
                        type="text" 
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="input-field text-sm p-2 w-full" 
                        placeholder="Cover Title"
                      />
                      <input 
                        type="text" 
                        value={editThumbnail}
                        onChange={(e) => setEditThumbnail(e.target.value)}
                        className="input-field text-sm p-2 w-full" 
                        placeholder="Thumbnail URL"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(cover.id)} className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 w-full flex justify-center"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 w-full flex justify-center"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-lg truncate">{cover.title}</h3>
                        <div className="flex items-center gap-2 text-sm text-text-muted mt-1">
                          <Mic2 className="w-3 h-3" />
                          <span className="truncate">{cover.voiceName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(cover)} className="p-2 rounded-xl hover:bg-text-main/10 text-text-muted transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(cover.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <div className="w-full bg-text-main/5 rounded-xl p-3 border border-glass-border">
                    <audio controls src={cover.audioUrl} className="w-full h-8 outline-none" controlsList="nodownload" />
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={cover.audioUrl} download className="flex-1 btn-secondary py-2 text-xs flex items-center justify-center gap-2">
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                    <button className="flex-1 btn-secondary py-2 text-xs flex items-center justify-center gap-2">
                      <Share2 className="w-3 h-3" />
                      Share
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
