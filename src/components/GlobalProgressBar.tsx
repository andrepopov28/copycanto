import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Clock, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { 
  db, 
  collection, 
  query, 
  where, 
  onSnapshot,
  handleFirestoreError,
  OperationType
} from '../db';
import { cn } from '../lib/utils';

interface Job {
  id: string;
  type: string;
  status: string;
  progress: number;
  message: string;
  estimatedTimeLeft?: number; // in seconds
}

export const GlobalProgressBar: React.FC<{ user: any; compact?: boolean }> = ({ user, compact = false }) => {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!user) return;

    const jobsQuery = query(
      collection(db, "jobs"),
      where("userId", "==", user.uid),
      where("status", "in", ["pending", "processing"])
    );

    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setActiveJobs(jobsData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "jobs");
    });

    return () => unsubscribe();
  }, [user]);

  if (activeJobs.length === 0) return null;

  const formatTime = (seconds?: number) => {
    if (!seconds) return '...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (compact) {
    const totalProgress = activeJobs.reduce((acc, job) => acc + job.progress, 0) / activeJobs.length;
    
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 apple-hover">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
          <span className="text-xs font-bold text-brand-primary">{activeJobs.length} Active</span>
        </div>
        <div className="w-24 h-1.5 bg-text-main/5 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${totalProgress}%` }}
            className="h-full bg-brand-primary"
          />
        </div>
        <span className="text-[10px] font-mono text-brand-primary">{Math.round(totalProgress)}%</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-8 right-8 z-50 w-80 space-y-3">
      <AnimatePresence>
        {activeJobs.map((job) => (
          <motion.div
            key={job.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="glass p-4 rounded-2xl shadow-2xl border-l-4 border-brand-primary group relative overflow-hidden"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                <Loader2 className="w-5 h-5 text-brand-primary animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold capitalize truncate pr-2">{job.type}</span>
                  <span className="text-xs font-mono text-brand-primary shrink-0">{Math.round(job.progress)}%</span>
                </div>
                
                <div className="h-1.5 w-full bg-text-main/5 rounded-full overflow-hidden mb-2">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${job.progress}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-brand-primary to-brand-accent"
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span className="truncate max-w-[120px]">{job.message}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(job.estimatedTimeLeft)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Subtle background pulse */}
            <div className="absolute inset-0 bg-brand-primary/5 animate-pulse pointer-events-none" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
