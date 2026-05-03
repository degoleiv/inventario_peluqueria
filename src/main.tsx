import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/themes/body-themes.css";
import "./styles/clay/tokens.css";
import "./styles/clay/components.css";
import "./App.css";
import "./styles/bridge-design-system.css";
import "./styles/ui-overrides.css";
import App from "./App.tsx";
import { ToastProvider } from "./context/ToastContext";
import { ThemeUiProvider } from "./context/ThemeUiContext";
import { applyUiPreferencesToDocument, readUiPreferences } from "./lib/uiPreferences";

applyUiPreferencesToDocument(readUiPreferences());
try {
  const t = localStorage.getItem("peluqueria_theme");
  document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeUiProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeUiProvider>
  </StrictMode>
);
