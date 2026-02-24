import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

const rootElement = document.getElementById("root");
const RootApp = lazy(() => import("./RootApp"));

const AppBootstrap = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const maybeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const markReady = () => {
      setIsReady(true);
    };

    if (typeof maybeWindow.requestIdleCallback === "function") {
      const idleId = maybeWindow.requestIdleCallback(() => {
        markReady();
      }, { timeout: 1500 });

      return () => {
        if (typeof maybeWindow.cancelIdleCallback === "function") {
          maybeWindow.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(markReady, 400);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!isReady) {
    return <div className="p-4 text-sm text-slate-500">Loading forum shell...</div>;
  }

  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading forum...</div>}>
      <RootApp />
    </Suspense>
  );
};

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppBootstrap />
  </StrictMode>
);
