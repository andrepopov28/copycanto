import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Mic2,
  Plus,
  Search,
  Trash2,
  Play,
  Loader2,
  Sparkles,
  Cpu,
  Edit2,
  Check,
  X,
  Upload,
  StopCircle
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
  addDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
  User
} from '../db';

interface Voice {
  id: string;
  name: string;
  avatar: string;
  type: string;
  description?: string;
  creatorId: string;
  isPublic: boolean;
  audioUrl?: string;
}

import { useNavigate } from 'react-router-dom';
import { HeroSection } from '../components/HeroSection';

export const Voices = ({ user }: { user: User | null }) => {
  const navigate = useNavigate();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime((t: number) => t + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
        setNewAudioFile(file);
        stream?.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Could not access microphone.");
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleCreateVoice = async () => {
    if (!newVoiceName.trim() || !newAudioFile || !user) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('userId', user.uid);
      formData.append('voiceName', newVoiceName);
      formData.append('audio', newAudioFile);
      if (newAvatarFile) {
        formData.append('avatar', newAvatarFile);
      }

      const res = await fetch('/api/upload/voice', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error("Failed to upload voice");

      const { voiceId, audioUrl, avatarUrl } = await res.json();

      await addDoc(collection(db, "voices"), {
        name: newVoiceName,
        avatar: avatarUrl,
        audioUrl: audioUrl,
        type: 'Source Audio',
        creatorId: user.uid,
        isPublic: false,
        createdAt: serverTimestamp()
      });

      setIsModalOpen(false);
      setNewVoiceName('');
      setNewAudioFile(null);
      setNewAvatarFile(null);
    } catch (err) {
      console.error(err);
      alert("Error creating voice.");
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const voicesQuery = query(
      collection(db, "voices"),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(voicesQuery, (snapshot: any) => {
      const voicesData = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Voice));
      setVoices(voicesData);
      setLoading(false);
    }, (err: any) => {
      handleFirestoreError(err, OperationType.LIST, "voices");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this voice model?")) {
      await deleteDoc(doc(db, "voices", id));
    }
  };

  const handleEdit = (voice: Voice) => {
    setEditingId(voice.id);
    setEditName(voice.name);
    setEditAvatar(voice.avatar);
  };

  const saveEdit = async (id: string) => {
    await updateDoc(doc(db, "voices", id), {
      name: editName,
      avatar: editAvatar
    });
    setEditingId(null);
  };

  const filteredVoices = voices.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <HeroSection
        title="Voice Library"
        subtitle="Explore and use community-contributed AI voice models."
        imageSrc="/assets/animal_muppet_hero_1773997756233.png"
        badge="Voice Cloning Suite"
      >
        <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center gap-2 prismatic-liquid-hover">
          <Plus className="w-5 h-5 relative z-10" />
          <span className="relative z-10">Add New Voice</span>
        </button>
      </HeroSection>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          placeholder="Search your voices..."
          className="input-field pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
        </div>
      ) : filteredVoices.length === 0 ? (
        <div className="glass p-20 rounded-[40px] text-center space-y-6">
          <div className="w-20 h-20 bg-text-main/5 rounded-full flex items-center justify-center mx-auto">
            <Mic2 className="w-10 h-10 text-text-muted" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No voices found</h3>
            <p className="text-text-muted max-w-xs mx-auto">
              You haven't trained any voice clones yet. Start by uploading a clean vocal sample.
            </p>
          </div>
          <button className="btn-secondary">Learn about Training</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVoices.map(voice => (
            <motion.div
              key={voice.id}
              whileHover={{ y: -4 }}
              className="glass rounded-[32px] overflow-hidden group flex flex-col"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video">
                <img
                  src={voice.avatar || `/assets/monkey_avatar_1774000814815.png`}
                  alt={voice.name}
                  className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-3 left-3">
                  <span className={cn(
                    "text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest backdrop-blur-md",
                    voice.type === 'Superman' ? "bg-brand-primary/80 text-white" : "bg-brand-secondary/80 text-white"
                  )}>
                    {voice.type || 'Source Audio'}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  {editingId === voice.id ? (
                    <div className="space-y-2 mb-2 w-full">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="input-field text-sm p-2 w-full"
                        placeholder="Voice Name"
                      />
                      <input
                        type="text"
                        value={editAvatar}
                        onChange={(e) => setEditAvatar(e.target.value)}
                        className="input-field text-sm p-2 w-full"
                        placeholder="Avatar URL"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(voice.id)} className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 w-full flex justify-center"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 w-full flex justify-center"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-bold text-lg truncate">{voice.name}</h3>
                        <p className="text-sm text-text-muted truncate">{voice.description || "No description provided."}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEdit(voice)} className="p-2 rounded-xl hover:bg-text-main/10 text-text-muted transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(voice.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <div className="w-full bg-text-main/5 rounded-xl p-3 border border-glass-border">
                    <audio controls src={voice.audioUrl} className="w-full h-8 outline-none" controlsList="nodownload" />
                  </div>
                  <button onClick={() => navigate('/create')} className="w-full btn-primary py-2 text-sm flex items-center justify-center gap-2 liquid-hover">
                    <Sparkles className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">Use Voice</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      )}

      {/* Voice Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass relative w-full max-w-lg p-8 rounded-[40px] space-y-6"
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Add New Voice</h2>
              <p className="text-text-muted text-sm">Upload a clean vocal sample or record directly from your microphone.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-widest text-text-muted">Voice Name</label>
                <input
                  type="text"
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  placeholder="e.g. My Custom Voice"
                  className="input-field w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-widest text-text-muted">Avatar Image (Optional)</label>
                <div className="flex items-center gap-4">
                  <label className="btn-secondary py-2 px-4 cursor-pointer flex items-center gap-2 text-sm">
                    <Upload className="w-4 h-4" />
                    <span>Select Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setNewAvatarFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  <span className="text-sm text-text-muted truncate flex-1">
                    {newAvatarFile ? newAvatarFile.name : 'Defaults to Monkey Avatar'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-widest text-text-muted">Source Audio (Required)</label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="glass p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/5 border-2 border-transparent transition-all">
                    <Upload className="w-6 h-6 text-brand-secondary" />
                    <span className="text-sm font-bold">Upload File</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setNewAudioFile(e.target.files?.[0] || null)}
                    />
                  </label>

                  {isRecording ? (
                    <button
                      onClick={stopRecording}
                      className="glass bg-red-500/10 border-red-500 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer border-2 transition-all animate-pulse"
                    >
                      <StopCircle className="w-6 h-6 text-red-500" />
                      <span className="text-sm font-bold text-red-500">Stop ({recordingTime}s)</span>
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      className="glass p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/5 border-2 border-transparent transition-all"
                    >
                      <Mic2 className="w-6 h-6 text-brand-primary" />
                      <span className="text-sm font-bold">Record</span>
                    </button>
                  )}
                </div>
                {newAudioFile && (
                  <div className="mt-2 text-sm text-brand-primary flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span className="truncate flex-1">Audio Ready: {newAudioFile.name}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleCreateVoice}
              disabled={isUploading || !newVoiceName.trim() || !newAudioFile || isRecording}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving Voice...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Create Voice
                </>
              )}
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

const cn = (...classes: (string | boolean | undefined | null)[]) => classes.filter(Boolean).join(' ');