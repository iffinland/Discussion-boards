import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AppWrapper } from "./AppWrapper";
import { ForumProvider } from "./context/ForumContext";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppWrapper>
      <ForumProvider>
        <App />
      </ForumProvider>
    </AppWrapper>
  </StrictMode>
);
