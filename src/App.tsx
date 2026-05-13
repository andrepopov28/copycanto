import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
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

// APP-C-PC2-006: ErrorBoundary prevents full app crash from unhandled render errors
interface ErrorBoundaryState { hasError: boolean; error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-main flex flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-2xl font-bold text-red-500">Something went wrong</h1>
          <p className="text-text-muted text-sm max-w-md text-center">
            An unexpected error occurred. Please refresh the page.
          </p>
          <button
            className="btn-primary px-6 py-2"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!isMounted) return;
      if (u) {
        setUser(u);
      }
      setLoading(false);
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
};

export default App;
