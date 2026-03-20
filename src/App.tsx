import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { 
  auth, 
  onAuthStateChanged, 
  signInWithPopup, 
  googleProvider, 
  User,
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from './db';
import { Layout } from './components/Layout';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Home } from './pages/Home';
import { Voices } from './pages/Voices';
import { Songs } from './pages/Songs';
import { Covers } from './pages/Covers';
import { Clones } from './pages/Clones';
import { CreateCover } from './pages/CreateCover';
import { Placeholder } from './pages/Placeholder';
import { 
  Mic, 
  Sparkles, 
  Music, 
  Disc, 
  Settings as SettingsIcon,
  Github,
  LogIn,
  Loader2,
  Sun,
  Moon
} from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u as any);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <Router>
        <Layout user={user}>
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Home user={user} />} />
              <Route path="/voices" element={<Voices user={user} />} />
              <Route path="/songs" element={<Songs user={user} />} />
              <Route path="/covers" element={<Covers user={user} />} />
              <Route path="/clones" element={<Clones user={user} />} />
              <Route path="/create" element={<CreateCover user={user} />} />
              <Route path="/create/engine" element={<CreateCover user={user} />} />
              <Route path="/create/voice" element={<CreateCover user={user} />} />
              <Route path="/create/song" element={<CreateCover user={user} />} />
              <Route path="/create/process" element={<CreateCover user={user} />} />
              <Route path="/settings" element={<Placeholder title="Settings" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </Layout>
      </Router>
    </ThemeProvider>
  );
};

export default App;
