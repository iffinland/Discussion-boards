import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import Layout from './components/layout/Layout';
import Home from './pages/Home';
import ThreadPage from './pages/ThreadPage';

type ThemeMode = 'light-cyan' | 'soft-cyan';
const THEME_STORAGE_KEY = 'forum-theme-mode';
const qortalWindow = window as Window & { _qdnBase?: string };
const routerBaseName = qortalWindow._qdnBase || '';

const LegacyHashRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.hash.startsWith('#/')) {
      return;
    }

    navigate(location.hash.slice(1), { replace: true });
  }, [location.hash, navigate]);

  return null;
};

const App = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light-cyan';
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'soft-cyan' ? 'soft-cyan' : 'light-cyan';
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-soft-cyan', themeMode === 'soft-cyan');
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const handleToggleTheme = () => {
    setThemeMode((current) =>
      current === 'light-cyan' ? 'soft-cyan' : 'light-cyan'
    );
  };

  return (
    <BrowserRouter basename={routerBaseName}>
      <LegacyHashRedirect />
      <Layout
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      >
        <Routes>
          <Route path="/" element={<Home searchQuery={searchQuery} />} />
          <Route
            path="/thread/:id"
            element={
              <ThreadPage
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
};

export default App;
