import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "peluqueria_pos_focus";

type PosFocusContextValue = {
  posFocus: boolean;
  /** Ocultar sidebar/topbar solo en la pestaña Nueva venta. */
  chromeHidden: boolean;
  setPosFocus: (on: boolean) => void;
  togglePosFocus: () => void;
};

const PosFocusContext = createContext<PosFocusContextValue | null>(null);

function readStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStored(on: boolean) {
  try {
    if (on) sessionStorage.setItem(STORAGE_KEY, "1");
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isVentasPosPath(pathname: string): boolean {
  return /\/ventas\/ventas\/?$/.test(pathname);
}

export function PosFocusProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [posFocus, setPosFocusState] = useState(readStored);

  const onPosTab = isVentasPosPath(location.pathname);
  const chromeHidden = posFocus && onPosTab;

  const setPosFocus = useCallback((on: boolean) => {
    setPosFocusState(on);
    writeStored(on);
  }, []);

  const togglePosFocus = useCallback(() => {
    setPosFocusState((prev) => {
      const next = !prev;
      writeStored(next);
      return next;
    });
  }, []);

  useEffect(() => {
    writeStored(posFocus);
  }, [posFocus]);

  useEffect(() => {
    document.documentElement.classList.toggle("pos-focus-active", chromeHidden);
    return () => document.documentElement.classList.remove("pos-focus-active");
  }, [chromeHidden]);

  useEffect(() => {
    if (posFocus && !onPosTab) setPosFocus(false);
  }, [posFocus, onPosTab, setPosFocus]);

  useEffect(() => {
    if (!chromeHidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPosFocus(false);
      if (document.fullscreenElement) void document.exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chromeHidden, setPosFocus]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && posFocus && onPosTab) {
        setPosFocus(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [posFocus, onPosTab, setPosFocus]);

  const value = useMemo(
    () => ({ posFocus, chromeHidden, setPosFocus, togglePosFocus }),
    [posFocus, chromeHidden, setPosFocus, togglePosFocus]
  );

  return <PosFocusContext.Provider value={value}>{children}</PosFocusContext.Provider>;
}

export function usePosFocus() {
  const ctx = useContext(PosFocusContext);
  if (!ctx) throw new Error("usePosFocus debe usarse dentro de PosFocusProvider");
  return ctx;
}

export function usePosFocusOptional() {
  return useContext(PosFocusContext);
}
