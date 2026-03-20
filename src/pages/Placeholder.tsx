import React from 'react';
import { motion } from 'motion/react';
import { Construction } from 'lucide-react';

export const Placeholder: React.FC<{ title: string }> = ({ title }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-6"
  >
    <div className="w-24 h-24 bg-text-main/5 rounded-[40px] flex items-center justify-center animate-float">
      <Construction className="w-12 h-12 text-brand-primary" />
    </div>
    <div className="space-y-2">
      <h2 className="text-4xl font-bold tracking-tighter">{title}</h2>
      <p className="text-text-muted max-w-md mx-auto">
        This section is currently under construction. Check back soon for the full experience.
      </p>
    </div>
  </motion.div>
);
