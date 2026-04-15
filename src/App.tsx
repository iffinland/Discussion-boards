import { Suspense, lazy, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import Layout from './components/layout/Layout';
import { useForumData } from './hooks/useForumData';

const Home = lazy(() => import('./pages/Home'));
const TopicPage = lazy(() => import('./pages/TopicPage'));
const ThreadPage = lazy(() => import('./pages/ThreadPage'));

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

const MaintenancePage = ({ message }: { message: string }) => (
  <div className="bg-surface-app flex min-h-screen items-center justify-center px-4 py-10">
    <div className="w-full max-w-xl rounded-2xl border border-orange-200 bg-white p-8 shadow-sm">
      <p className="text-brand-accent text-xs font-semibold uppercase tracking-[0.2em]">
        Maintenance Mode
      </p>
      <h2 className="text-ui-strong mt-3 text-2xl font-semibold">
        Forum is temporarily unavailable
      </h2>
      <p className="text-ui-muted mt-4 text-sm leading-6">{message}</p>
    </div>
  </div>
);

const App = () => {
  const { maintenanceState, canBypassMaintenance } = useForumData();
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
      {maintenanceState.enabled && !canBypassMaintenance ? (
        <MaintenancePage message={maintenanceState.message} />
      ) : (
        <Layout
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        >
          <Suspense
            fallback={
              <div className="space-y-4">
                <div className="forum-card p-5">
                  <p className="text-ui-muted text-sm">Loading page...</p>
                </div>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home searchQuery={searchQuery} />} />
              <Route
                path="/topic/:id"
                element={
                  <TopicPage
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                  />
                }
              />
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
          </Suspense>
        </Layout>
      )}
    </BrowserRouter>
  );
};

export default App;
