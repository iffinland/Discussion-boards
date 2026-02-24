import type { ReactNode } from "react";

import Footer from "./Footer";
import Header from "./Header";
import StatsBar from "./StatsBar";

type ThemeMode = "light-cyan" | "soft-cyan";

type LayoutProps = {
  children: ReactNode;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

const Layout = ({ children, themeMode, onToggleTheme }: LayoutProps) => {
  return (
    <div className="bg-surface-app flex min-h-screen flex-col">
      <Header themeMode={themeMode} onToggleTheme={onToggleTheme} />
      <StatsBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
