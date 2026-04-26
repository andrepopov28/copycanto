import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Music2, 
  Plus, 
  Search, 
  Trash2, 
  Play, 
  Loader2,
  Youtube,
  Upload,
  Disc,
  ArrowRight,
  Edit2,
  Check,
  X,
  Download
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

interface Song {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  audioUrl: string;
  userId: string;
  createdAt: any;
  stems?: string[];
}

import { HeroSection } from '../components/HeroSection';

import { useNavigate } from 'react-router-dom';

export const Songs: React.FC<{ user: any }> = ({ user }) => {
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editThumbnail, setEditThumbnail] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const songsQuery = query(
      collection(db, "songs"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(songsQuery, (snapshot) => {
      const songsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Song));
      setSongs(songsData);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "songs");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this song?")) {
      await deleteDoc(doc(db, "songs", id));
    }
  };

  const handleEdit = (song: Song) => {
    setEditingId(song.id);
    setEditTitle(song.title);
    setEditArtist(song.artist);
    setEditThumbnail(song.thumbnail);
  };

  const saveEdit = async (id: string) => {
    await updateDoc(doc(db, "songs", id), {
      title: editTitle,
      artist: editArtist,
      thumbnail: editThumbnail
    });
    setEditingId(null);
  };

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('userId', user.uid);
      formData.append('audio', file);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();

      // Trigger extraction
      await fetch('/api/covers/create', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          audioUrl: url,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: "Uploaded MP3",
          voiceId: "none",
          engine: "none"
        })
      });
    } catch (err) {
      console.error(err);
      alert("Failed to upload song. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleYoutubePaste = async () => {
    const url = window.prompt("Enter a YouTube URL to extract stems from:");
    if (!url || !user) return;
    setIsUploading(true);

    try {
      // Trigger extraction
      await fetch('/api/covers/create', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          youtubeUrl: url,
          title: "YouTube Extraction",
          artist: "YouTube Download",
          voiceId: "none",
          engine: "none"
        })
      });
    } catch (err) {
      console.error(err);
      alert("Failed to process YouTube URL. Please check the URL and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <HeroSection
        title="Song Library"
        imageSrc="/assets/tom_jerry_hero_1773997774915.png"
        badge="Stem Separation Suite"
      >
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*"
            className="hidden"
          />
          <button
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2 apple-hover disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            Upload MP3
          </button>
          <button
            disabled={isUploading}
            onClick={handleYoutubePaste}
            className="btn-primary flex items-center gap-2 prismatic-liquid-hover disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-5 h-5 relative z-10 animate-spin" /> : <Youtube className="w-5 h-5 relative z-10" />}
            <span className="relative z-10">Paste YouTube URL</span>
          </button>
        </div>
      </HeroSection>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          placeholder="Search your songs..."
          className="input-field pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
        </div>
      ) : isUploading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
          <p className="text-text-muted animate-pulse">Initializing processing engine...</p>
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="glass p-20 rounded-[40px] text-center space-y-6">
          <div className="w-20 h-20 bg-text-main/5 rounded-full flex items-center justify-center mx-auto">
            <Music2 className="w-10 h-10 text-text-muted" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No songs found</h3>
            <p className="text-text-muted max-w-xs mx-auto">
              You haven't uploaded any songs yet. Paste a YouTube URL to start the Demucs v4 separation pipeline.
            </p>
          </div>
          <button className="btn-secondary">Learn about Stem Separation</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSongs.map(song => (
            <motion.div
              key={song.id}
              whileHover={{ y: -4 }}
              className="glass rounded-[32px] overflow-hidden group"
            >
              <div className="relative aspect-video">
                <img
                  src={song.thumbnail || `/assets/tom_jerry_hero_1773997774915.png`}
                  alt={song.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <a href={song.audioUrl} download className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform hover:bg-white hover:text-brand-primary">
                    <Download className="w-5 h-5 fill-current" />
                  </a>
                </div>
              </div>

              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  {editingId === song.id ? (
                    <div className="space-y-2 mb-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="input-field text-sm p-2 w-full"
                        placeholder="Song Title"
                      />
                      <input
                        type="text"
                        value={editArtist}
                        onChange={(e) => setEditArtist(e.target.value)}
                        className="input-field text-sm p-2 w-full"
                        placeholder="Artist"
                      />
                      <input
                        type="text"
                        value={editThumbnail}
                        onChange={(e) => setEditThumbnail(e.target.value)}
                        className="input-field text-sm p-2 w-full"
                        placeholder="Thumbnail URL"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(song.id)} className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 w-full flex justify-center"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 w-full flex justify-center"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-lg truncate">{song.title}</h3>
                        <p className="text-sm text-text-muted truncate">{song.artist}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(song)} className="p-2 rounded-xl hover:bg-text-main/10 text-text-muted transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(song.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {song.stems && song.stems.length > 0 ? (
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
                        <span className="px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20">Stems Extracted</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                        <span className="px-3 py-1 rounded-full bg-text-main/5 border border-glass-border">Processing...</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="space-y-2">
                    <p className="text-xs text-text-muted font-medium">Full Song</p>
                    <div className="w-full bg-text-main/5 rounded-xl p-3 border border-glass-border">
                      <audio controls src={song.audioUrl} className="w-full h-8 outline-none" controlsList="nodownload" />
                    </div>
                  </div>

                  {song.stems && song.stems.length > 0 && (
                     <div className="space-y-3">
                      {song.stems.map((stem: any, idx: number) => (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-text-muted font-medium">{stem.name || 'Stem'}</p>
                            <a href={stem.url} download className="text-brand-primary text-[10px] hover:underline flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              Save
                            </a>
                          </div>
                          <div className="w-full bg-text-main/5 rounded-xl p-3 border border-glass-border">
                            <audio controls src={stem.url || stem} className="w-full h-8 outline-none" controlsList="nodownload" />
                          </div>
                        </div>
                      ))}
                     </div>
                  )}

                  <div className="pt-2">
                    <button onClick={() => navigate('/create')} className="w-full btn-primary py-2 text-sm flex items-center justify-center gap-2 liquid-hover">
                      <ArrowRight className="w-4 h-4 relative z-10" />
                      <span className="relative z-10">Create Cover</span>
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