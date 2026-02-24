import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import ThreadPage from "./pages/ThreadPage";

type ThemeMode = "light-cyan" | "soft-cyan";
const THEME_STORAGE_KEY = "forum-theme-mode";

const App = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light-cyan";
    }

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "soft-cyan" ? "soft-cyan" : "light-cyan";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-soft-cyan", themeMode === "soft-cyan");
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const handleToggleTheme = () => {
    setThemeMode((current) =>
      current === "light-cyan" ? "soft-cyan" : "light-cyan"
    );
  };

  return (
    <HashRouter>
      <Layout themeMode={themeMode} onToggleTheme={handleToggleTheme}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/thread/:id" element={<ThreadPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
