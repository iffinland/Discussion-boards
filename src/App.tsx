import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

const Layout = lazy(() => import('./components/layout/Layout'));
const Home = lazy(() => import('./pages/Home'));
const ThreadPage = lazy(() => import('./pages/ThreadPage'));

type ThemeMode = 'light-cyan' | 'soft-cyan';
const THEME_STORAGE_KEY = 'forum-theme-mode';

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
    <HashRouter>
      <Suspense
        fallback={
          <div className="p-4 text-sm text-slate-500">Loading app...</div>
        }
      >
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
      </Suspense>
    </HashRouter>
  );
};

export default App;
