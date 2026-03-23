import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  ChevronLeft, 
  Mic2, 
  Music2, 
  Cpu, 
  Sparkles, 
  Check, 
  Play,
  Loader2,
  Settings as SettingsIcon,
  Disc
} from 'lucide-react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp 
} from '../db';
import { cn } from '../lib/utils';
import { HeroSection } from '../components/HeroSection';

interface Voice {
  id: string;
  name: string;
  avatar: string;
  type: string;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  audioUrl: string;
}

const STEPS = [
  { id: 'engine', title: 'Choose Engine', icon: Cpu },
  { id: 'voice', title: 'Select Voice', icon: Mic2 },
  { id: 'song', title: 'Select Song', icon: Music2 },
  { id: 'config', title: 'Finalize', icon: SettingsIcon },
];

export const CreateCover: React.FC<{ user: any }> = ({ user }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // MED-2: Clean up any polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);
  
  // Selection State
  const [engine, setEngine] = useState<'superman' | 'knn'>('superman');
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isAcapella, setIsAcapella] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [coverTitle, setCoverTitle] = useState('');
  const [highQuality, setHighQuality] = useState(true);
  
  // Data State
  const [voices, setVoices] = useState<Voice[]>([]);
  const [clones, setClones] = useState<any[]>([]); // Clones can be used as voices
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    if (!user) return;

    // Fetch Voices
    const voicesUnsub = onSnapshot(
      query(
        collection(db, "voices"), 
        where("creatorId", "==", user.uid),
        where("archived", "==", false)
      ),
      (snap) => setVoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Voice)))
    );

    // Fetch Clones to be used as Voices
    const clonesUnsub = onSnapshot(
      query(collection(db, "clones"), where("userId", "==", user.uid)),
      (snap) => setClones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Fetch Songs
    const songsUnsub = onSnapshot(
      query(collection(db, "songs"), where("userId", "==", user.uid)),
      (snap) => setSongs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Song)))
    );

    return () => {
      voicesUnsub();
      clonesUnsub();
      songsUnsub();
    };
  }, [user]);

  // Combine voices and clones for the selection step
  const selectableVoices = [
    ...voices,
    ...clones.map(c => ({
      id: c.id,
      name: c.title,
      avatar: c.thumbnail,
      type: 'Clone (Source)'
    }))
  ];

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleCreate();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleCreate = async () => {
    if (!selectedVoice || !user || (!selectedSong && !youtubeUrl)) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/covers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          voiceId: selectedVoice.id,
          youtubeUrl: youtubeUrl || null,
          audioUrl: selectedSong?.audioUrl || null,
          title: coverTitle.trim() || selectedSong?.title || 'New Cover',
          artist: selectedSong?.artist || 'Unknown',
          engine,
          pitch,
          isAcapella,
          highQuality,
        })
      });

      if (!response.ok) throw new Error('Failed to start job on backend');

      navigate('/');
    } catch (err) {
      console.error("Failed to create cover job:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleYoutubeExtract = async (url: string) => {
    setYoutubeUrl(url);
    setYoutubeError(null);
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) return;
    
    try {
      const res = await fetch('/api/extract/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        const data = await res.json();
        // HIGH-2: Detect fallback metadata (Ollama unavailable) and warn user
        const isOllamaFallback = data.artist === 'YouTube Download' && data.song_title === 'Extracted Audio';
        if (isOllamaFallback) {
          setYoutubeError('⚠️ Could not extract song metadata — Ollama is not running. Title will be set to "Extracted Audio". You can rename it in the final step.');
        }
        setSelectedSong({
          id: 'yt-temp',
          title: data.song_title || 'Unknown Song',
          artist: data.artist || 'Unknown Artist',
          thumbnail: 'https://picsum.photos/seed/yt/200',
          audioUrl: '' // Fix missing property lint error
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Engine
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => setEngine('superman')}
              className={cn(
                "glass p-8 rounded-[40px] text-left space-y-4 border-2 transition-all apple-hover",
                engine === 'superman' ? "border-brand-primary bg-brand-primary/5" : "border-transparent"
              )}
            >
              <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
                <Cpu className="w-8 h-8 text-brand-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Superman Engine</h3>
                <p className="text-sm text-text-muted">High-fidelity retrieval-based voice conversion. Best for professional singing.</p>
              </div>
              {engine === 'superman' && <Check className="w-6 h-6 text-brand-primary" />}
            </button>

            <button 
              onClick={() => setEngine('knn')}
              className={cn(
                "glass p-8 rounded-[40px] text-left space-y-4 border-2 transition-all apple-hover",
                engine === 'knn' ? "border-brand-secondary bg-brand-secondary/5" : "border-transparent"
              )}
            >
              <div className="w-16 h-16 rounded-2xl bg-brand-secondary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-brand-secondary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">kNN-SVC Engine</h3>
                <p className="text-sm text-text-muted">Zero-shot instant voice cloning. Fast processing with good quality.</p>
              </div>
              {engine === 'knn' && <Check className="w-6 h-6 text-brand-secondary" />}
            </button>
          </div>
        );

      case 1: // Voice
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {selectableVoices.map(voice => (
              <button 
                key={voice.id}
                onClick={() => setSelectedVoice(voice as any)}
                className={cn(
                  "glass p-6 rounded-[32px] text-left space-y-4 border-2 transition-all apple-hover",
                  selectedVoice?.id === voice.id ? "border-brand-primary bg-brand-primary/5" : "border-transparent"
                )}
              >
                <img src={voice.avatar || `https://picsum.photos/seed/${voice.id}/200`} className="w-full aspect-square rounded-2xl object-cover" alt={voice.name} />
                <h4 className="font-bold">{voice.name}</h4>
                <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted">{voice.type}</span>
              </button>
            ))}
            {selectableVoices.length === 0 && (
              <div className="col-span-full py-20 text-center glass rounded-[40px]">
                <p className="text-text-muted">No voices or clones found. Go to Voices library to add one.</p>
              </div>
            )}
          </div>
        );

      case 2: // Song
        return (
          <div className="space-y-6">
            <div className="glass p-6 rounded-3xl space-y-4">
              <h3 className="font-bold">Paste a YouTube Link</h3>
              <input 
                type="text" 
                placeholder="https://youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => handleYoutubeExtract(e.target.value)}
                className="w-full bg-text-main/5 border border-glass-border rounded-xl p-4 text-text-main focus:outline-none focus:border-brand-primary transition-colors"
              />
              {youtubeError && (
                <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl p-3">
                  <span>{youtubeError}</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="h-px bg-glass-border flex-1" />
              <span className="text-sm font-bold tracking-widest uppercase text-text-muted">OR CHOOSE EXISTING</span>
              <div className="h-px bg-glass-border flex-1" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {songs.map(song => (
                <button 
                  key={song.id}
                  onClick={() => { setSelectedSong(song); setYoutubeUrl(''); }}
                  className={cn(
                    "glass p-4 rounded-3xl text-left flex items-center gap-4 border-2 transition-all apple-hover",
                    selectedSong?.id === song.id ? "border-brand-primary bg-brand-primary/5" : "border-transparent"
                  )}
                >
                  <img src={song.thumbnail || `https://picsum.photos/seed/${song.id}/200`} className="w-20 h-20 rounded-xl object-cover" alt={song.title} />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold truncate">{song.title}</h4>
                    <p className="text-sm text-text-muted truncate">{song.artist}</p>
                  </div>
                </button>
              ))}
              {songs.length === 0 && (
                <div className="col-span-full py-10 text-center glass rounded-[40px]">
                  <p className="text-text-muted">No saved songs found.</p>
                </div>
              )}
            </div>

            {/* Acapella Toggle */}
            <div className="glass p-6 rounded-3xl flex items-center justify-between mt-4">
              <div className="space-y-1">
                <h3 className="font-bold">Acapella Only?</h3>
                <p className="text-sm text-text-muted">Check this if the audio contains no instruments. Skips stem separation.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={isAcapella} onChange={(e) => setIsAcapella(e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-glass-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
              </label>
            </div>
          </div>
        );

      case 3: // Config
        return (
          <div className="max-w-md mx-auto space-y-8">
            <div className="glass p-8 rounded-[40px] space-y-6">
              {/* Cover Title */}
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-widest text-text-muted">Cover Name</label>
                <input
                  type="text"
                  placeholder={selectedSong?.title ? `${selectedSong.title} (Cover)` : 'My Cover'}
                  value={coverTitle}
                  onChange={(e) => setCoverTitle(e.target.value)}
                  className="w-full bg-text-main/5 border border-glass-border rounded-xl p-4 text-text-main focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold uppercase tracking-widest text-text-muted">Pitch Adjustment (Semitones)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="-12" 
                    max="12" 
                    value={pitch} 
                    onChange={(e) => setPitch(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-text-main/10 rounded-full appearance-none cursor-pointer accent-brand-primary"
                  />
                  <span className="w-12 text-center font-mono font-bold text-brand-primary">{pitch > 0 ? `+${pitch}` : pitch}</span>
                </div>
                <p className="text-[10px] text-text-muted">Use +12 for male-to-female, -12 for female-to-male.</p>
              </div>

              <div className="pt-6 border-t border-glass-border space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Selected Voice:</span>
                  <span className="font-bold">{selectedVoice?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Selected Song:</span>
                  <span className="font-bold truncate max-w-[200px]">{selectedSong?.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Engine:</span>
                  <span className="font-bold uppercase">{engine}</span>
                </div>
              </div>

              {/* High Quality Toggle */}
              <div className="pt-6 border-t border-glass-border flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm">High Fidelity Mode</h3>
                  <p className="text-[10px] text-text-muted">Enforces maximum VBR quality and 44.1kHz resampling.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={highQuality} onChange={(e) => setHighQuality(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-glass-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
                </label>
              </div>
            </div>
          </div>
        );
    }
  };

  const isNextDisabled = () => {
    if (currentStep === 1 && !selectedVoice) return true;
    if (currentStep === 2 && !selectedSong && !youtubeUrl) return true;
    return false;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <HeroSection 
        title="Start New Cover"
        subtitle="Transform any song with your custom AI voice clones in 4 simple steps."
        imageSeed="musician-panda"
        badge="AI Creation Pipeline"
      />

      {/* Stepper Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between relative px-4">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-text-main/5 -translate-y-1/2 -z-10" />
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === idx;
            const isCompleted = currentStep > idx;
            
            return (
              <div key={step.id} className="flex flex-col items-center gap-3">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 relative",
                  isActive ? "bg-brand-primary text-white scale-110 shadow-lg" : 
                  isCompleted ? "bg-brand-primary/20 text-brand-primary" : "bg-bg-main border border-glass-border text-text-muted"
                )}>
                  {isCompleted ? <Check className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                  {isActive && (
                    <motion.div 
                      layoutId="step-glow"
                      className="absolute inset-0 bg-brand-primary blur-xl opacity-40 rounded-2xl -z-10"
                    />
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest transition-colors",
                  isActive ? "text-brand-primary" : "text-text-muted"
                )}>
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-8 border-t border-glass-border">
        <button 
          onClick={handleBack}
          disabled={currentStep === 0 || loading}
          className="btn-secondary flex items-center gap-2 disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        
        <button 
          onClick={handleNext}
          disabled={isNextDisabled() || loading}
          className="btn-primary flex items-center gap-2 prismatic-liquid-hover disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin relative z-10" />
          ) : (
            <>
              <span className="relative z-10">{currentStep === STEPS.length - 1 ? 'Start Conversion' : 'Continue'}</span>
              <ChevronRight className="w-5 h-5 relative z-10" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
};
