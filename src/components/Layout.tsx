import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Home, 
  Mic2, 
  Music2, 
  Disc, 
  Settings, 
  Search, 
  TrendingUp, 
  LogOut,
  Plus,
  Music,
  Github,
  Sun,
  Moon,
  Sparkles
} from 'lucide-react';
import { auth } from '../db';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { GlobalProgressBar } from './GlobalProgressBar';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
}

const NavItem = ({ to, icon: Icon, label, active }: { to: string, icon: any, label: string, active: boolean }) => (
  <Link 
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 w-full group relative overflow-hidden apple-hover",
      active 
        ? "bg-brand-primary/20 text-text-main shadow-[0_0_20px_rgba(99,102,241,0.2)]" 
        : "text-text-muted hover:bg-text-main/5 hover:text-text-main"
    )}
  >
    <Icon className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110 z-10", active && "text-brand-primary")} />
    <span className="font-medium z-10">{label}</span>
    {active && (
      <motion.div 
        layoutId="nav-indicator" 
        className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(99,102,241,0.8)] z-10" 
      />
    )}
    <div className={cn(
      "absolute inset-0 bg-gradient-to-r from-brand-primary/10 to-transparent opacity-0 transition-opacity duration-500",
      active && "opacity-100"
    )} />
  </Link>
);

export const Layout: React.FC<LayoutProps> = ({ children, user }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-bg-main text-text-main flex">
      {/* Sidebar */}
      <aside className="w-72 border-r border-glass-border p-6 flex flex-col gap-8 glass sticky top-0 h-screen z-50">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-accent flex items-center justify-center shadow-lg">
            <Music className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight">CopyCanto</span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem to="/" icon={Home} label="Dashboard" active={currentPath === '/'} />
          <NavItem to="/voices" icon={Mic2} label="Voice Library" active={currentPath === '/voices'} />
          <NavItem to="/songs" icon={Music2} label="Song Library" active={currentPath === '/songs'} />
          <NavItem to="/clones" icon={Sparkles} label="Clone Library" active={currentPath === '/clones'} />
          <NavItem to="/covers" icon={Disc} label="Cover Library" active={currentPath === '/covers'} />
          <div className="pt-4">
            <Link 
              to="/create/engine"
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 prismatic-liquid-hover"
            >
              <Plus className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Start New Cover</span>
            </Link>
          </div>
        </nav>

        <div className="mt-auto space-y-4">
          <div className="glass-light p-4 rounded-2xl flex items-center gap-3">
            <img 
              src={user?.photoURL || `https://picsum.photos/seed/${user?.uid}/100/100`} 
              alt={user?.displayName} 
              className="w-10 h-10 rounded-full border border-glass-border" 
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.displayName}</p>
              <p className="text-xs text-text-muted truncate">Local Mode</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen relative flex flex-col">
        <header className="sticky top-0 z-40 glass border-b border-glass-border px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6 flex-1">
            <div className="relative w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input 
                type="text" 
                placeholder="Search voices, covers, or artists..." 
                className="input-field pl-12 py-2 text-sm"
              />
            </div>
            <GlobalProgressBar user={user} compact />
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-xl hover:bg-text-main/5 transition-colors relative apple-hover">
              <TrendingUp className="w-5 h-5 text-text-main/60" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-accent rounded-full" />
            </button>
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-text-main/5 transition-colors text-text-main/60 apple-hover"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link to="/settings" className="p-2 rounded-xl hover:bg-text-main/5 transition-colors apple-hover">
              <Settings className="w-5 h-5 text-text-main/60" />
            </Link>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
      
    </div>
  );
};
