import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface HeroSectionProps {
  title: React.ReactNode;
  subtitle?: string;
  imageSeed?: string;
  imageSrc?: string;
  badge?: string;
  className?: string;
  children?: React.ReactNode;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  title,
  subtitle = '',
  imageSeed,
  imageSrc,
  badge = "AI Voice Suite",
  className,
  children
}) => {
  const imageUrl = imageSrc || `https://loremflickr.com/1920/1080/3d,cartoon,animal,musician,${imageSeed}`;

  return (
    <section className={cn("relative h-[400px] rounded-[40px] overflow-hidden group mb-12", className)}>
      <img 
        src={imageUrl} 
        alt="Hero" 
        className="w-full h-full object-cover object-[50%_20%] transition-transform duration-1000 group-hover:scale-105"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-text-main">
            {title}
          </h1>
          <p className="text-lg text-text-muted max-w-xl mx-auto">
            {subtitle}
          </p>
          
          {children}
        </motion.div>
      </div>
    </section>
  );
};
