import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Mic, 
  Sparkles, 
  Play, 
  Cpu, 
  Loader2, 
  AlertCircle,
  ChevronRight,
  Disc,
  Music
} from 'lucide-react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  limit, 
  orderBy,
  handleFirestoreError,
  OperationType
} from '../db';
import { cn } from '../lib/utils';

interface Cover {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  voiceName: string;
  createdAt: any;
}

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string;
}

import { HeroSection } from '../components/HeroSection';

export const Home: React.FC<{ user: any }> = ({ user }) => {
  const [recentCovers, setRecentCovers] = useState<Cover[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Listen to Recent Covers
    const coversQuery = query(
      collection(db, "covers"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(3)
    );

    const unsubscribeCovers = onSnapshot(coversQuery, (snapshot) => {
      const coversData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cover));
      setRecentCovers(coversData);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "covers");
      setError("Failed to load covers.");
      setLoading(false);
    });

    // Listen to Active Jobs
    const jobsQuery = query(
      collection(db, "jobs"),
      where("userId", "==", user.uid),
      where("status", "in", ["pending", "processing"])
    );

    const unsubscribeJobs = onSnapshot(jobsQuery, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setActiveJobs(jobsData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "jobs");
    });

    return () => {
      unsubscribeCovers();
      unsubscribeJobs();
    };
  }, [user]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      {/* Hero Section */}
      <HeroSection 
        title={<>Clone Any <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-accent">Voice</span></>}
        imageSrc="/assets/bugs_bunny_home_hero.png"
        badge="AI Voice Conversion Suite"
      >
        <Link 
          to="/create/engine"
          className="inline-flex flex-col items-center gap-4 group/btn"
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-brand-primary to-brand-accent p-1 shadow-[0_0_40px_rgba(99,102,241,0.5)] transition-all duration-500 group-hover/btn:scale-110 group-hover/btn:shadow-[0_0_60px_rgba(99,102,241,0.8)] prismatic-liquid-hover">
            <div className="w-full h-full rounded-full bg-bg-main flex items-center justify-center relative z-10">
              <Mic className="w-10 h-10 text-text-main group-hover/btn:animate-pulse" />
            </div>
          </div>
          <span className="text-sm font-bold uppercase tracking-widest text-text-muted group-hover/btn:text-text-main transition-colors">
            Start New Cover
          </span>
        </Link>
      </HeroSection>

      {/* Feature Cards Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Card 1 — Voice Conversion */}
        <motion.div whileHover={{ y: -4 }} className="glass rounded-[32px] overflow-hidden group flex flex-col">
          <div className="relative aspect-video">
            <img
              src="/assets/superman_rvc_card.png"
              alt="High Fidelity Voice Conversion"
              className="w-full h-full object-cover object-[50%_20%] transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute top-3 left-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest backdrop-blur-md bg-brand-primary/80 text-white">
                Voice Conversion
              </span>
            </div>
          </div>
          <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold">Flawless Vocals</h3>
              <p className="text-sm text-text-muted leading-relaxed mt-1">
                High-fidelity AI voice conversion. Optimized for professional singing with minimal artifacts and maximum clarity.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-brand-primary uppercase tracking-widest pt-2">
              <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
              Available Now
            </div>
          </div>
        </motion.div>

        {/* Card 2 — Instant Cloning */}
        <motion.div whileHover={{ y: -4 }} className="glass rounded-[32px] overflow-hidden group flex flex-col">
          <div className="relative aspect-video">
            <img
              src="/assets/batman_knn_card.png"
              alt="Zero-Shot Voice Cloning"
              className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute top-3 left-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest backdrop-blur-md bg-brand-secondary/80 text-white">
                Instant Clone
              </span>
            </div>
          </div>
          <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold">Zero-Shot Cloning</h3>
              <p className="text-sm text-text-muted leading-relaxed mt-1">
                Clone any voice instantly from a short sample. No training required — perfect for rapid prototyping and quick covers.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-brand-secondary uppercase tracking-widest pt-2">
              <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
              Roadmap: Q2 2026
            </div>
          </div>
        </motion.div>

        {/* Card 3 — Stem Separation */}
        <motion.div whileHover={{ y: -4 }} className="glass rounded-[32px] overflow-hidden group flex flex-col">
          <div className="relative aspect-video">
            <img
              src="/assets/robin_demucs_card.png"
              alt="Stem Separation"
              className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute top-3 left-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-widest backdrop-blur-md bg-brand-accent/80 text-white">
                Stem Separation
              </span>
            </div>
          </div>
          <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold">Stem Precision</h3>
              <p className="text-sm text-text-muted leading-relaxed mt-1">
                State-of-the-art hybrid transformer stem separation. Isolates vocals from any track with surgical precision.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-brand-accent uppercase tracking-widest pt-2">
              <span className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
              Active Pipeline
            </div>
          </div>
        </motion.div>

      </section>



      {/* Active Jobs Banner */}
      {activeJobs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-brand-primary" />
              Active Processing
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeJobs.map(job => (
              <div key={job.id} className="glass p-4 rounded-2xl border-l-4 border-brand-primary flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-brand-primary animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold capitalize">{job.type}</span>
                    <span className="text-xs font-mono text-brand-primary">{Math.round(job.progress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-text-main/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${job.progress}%` }}
                      className="h-full bg-brand-primary"
                    />
                  </div>
                  <p className="text-[10px] text-text-muted mt-1 truncate">{job.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Disc className="w-6 h-6 text-brand-accent" />
            Recent Activity
          </h2>
          <Link to="/covers" className="text-sm text-brand-primary font-medium flex items-center gap-1 hover:gap-2 transition-all">
            View Library <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass h-64 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : recentCovers.length === 0 ? (
          <div className="glass p-12 rounded-[40px] text-center space-y-4">
            <div className="w-16 h-16 bg-text-main/5 rounded-full flex items-center justify-center mx-auto">
              <Disc className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-muted">No covers yet. Start your first cloning project above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentCovers.map(cover => (
              <motion.div 
                key={cover.id}
                whileHover={{ y: -8 }}
                className="glass group rounded-[32px] overflow-hidden cursor-pointer"
              >
                <div className="relative aspect-video">
                  <img 
                    src={cover.thumbnail || `https://picsum.photos/seed/${cover.id}/800/450`} 
                    alt={cover.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-6 h-6 fill-current text-white" />
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-lg truncate">{cover.title}</h3>
                  <p className="text-sm text-text-muted truncate">Voice: {cover.voiceName}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
};
