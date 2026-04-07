import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import Footer from './Footer';
import Header from './Header';
import StatsBar from './StatsBar';

type ThemeMode = 'light-cyan' | 'soft-cyan';

type LayoutProps = {
  children: ReactNode;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

const Layout = ({
  children,
  themeMode,
  onToggleTheme,
  searchQuery,
  onSearchQueryChange,
}: LayoutProps) => {
  const location = useLocation();
  const showHomeShortcut = location.pathname !== '/';

  return (
    <div className="bg-surface-app flex min-h-screen flex-col">
      <Header themeMode={themeMode} onToggleTheme={onToggleTheme} />
      <StatsBar
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />
      {showHomeShortcut ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
          <Link
            to="/"
            className="text-brand-primary inline-flex items-center gap-2 text-sm font-semibold transition hover:text-cyan-700"
          >
            <span aria-hidden="true">←</span>
            <span>Back to topics</span>
          </Link>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
