import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ColorThemeId } from "../lib/colorTheme";
import {
  applyUiPreferencesToDocument,
  readUiPreferences,
  writeUiPreferences,
  type UiClayStyle,
  type UiDensity,
  type UiPreferences,
  type UiRadius,
  type UiScale,
} from "../lib/uiPreferences";

export type ThemeUiContextValue = {
  prefs: UiPreferences;
  setPrefs: (next: UiPreferences) => void;
  setPreset: (preset: ColorThemeId) => void;
  setDensity: (d: UiDensity) => void;
  setUiScale: (s: UiScale) => void;
  setRadius: (r: UiRadius) => void;
  setClayStyle: (c: UiClayStyle) => void;
  setCustomPrimary: (hex: string | null) => void;
  setCustomAccent: (hex: string | null) => void;
  resetUiCustom: () => void;
};

const ThemeUiContext = createContext<ThemeUiContextValue | null>(null);

/** Referencia estable: `useSyncExternalStore` compara con Object.is; readUiPreferences() siempre devolvía un objeto nuevo. */
let cachedClientPrefs: UiPreferences = readUiPreferences();
let cachedClientPrefsKey = JSON.stringify(cachedClientPrefs);

const SERVER_PREFS_SNAPSHOT: UiPreferences = {
  preset: "default",
  density: "comfortable",
  uiScale: 100,
  radius: "default",
  clayStyle: "full",
  customPrimary: null,
  customAccent: null,
};

function subscribe(onStoreChange: () => void) {
  const onPrefs = () => {
    const next = readUiPreferences();
    const key = JSON.stringify(next);
    if (key !== cachedClientPrefsKey) {
      cachedClientPrefs = next;
      cachedClientPrefsKey = key;
    }
    onStoreChange();
  };
  window.addEventListener("peluqueria-ui-prefs", onPrefs);
  return () => window.removeEventListener("peluqueria-ui-prefs", onPrefs);
}

function getSnapshot(): UiPreferences {
  const next = readUiPreferences();
  const key = JSON.stringify(next);
  if (key !== cachedClientPrefsKey) {
    cachedClientPrefs = next;
    cachedClientPrefsKey = key;
  }
  return cachedClientPrefs;
}

function getServerSnapshot(): UiPreferences {
  return SERVER_PREFS_SNAPSHOT;
}

export function ThemeUiProvider({ children }: { children: React.ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyUiPreferencesToDocument(prefs);
  }, [prefs]);

  const setPrefs = useCallback((next: UiPreferences) => {
    writeUiPreferences(next);
    window.dispatchEvent(new Event("peluqueria-ui-prefs"));
  }, []);

  const setPreset = useCallback(
    (preset: ColorThemeId) => {
      setPrefs({ ...readUiPreferences(), preset });
    },
    [setPrefs]
  );

  const setDensity = useCallback(
    (density: UiDensity) => {
      setPrefs({ ...readUiPreferences(), density });
    },
    [setPrefs]
  );

  const setUiScale = useCallback(
    (uiScale: UiScale) => {
      setPrefs({ ...readUiPreferences(), uiScale });
    },
    [setPrefs]
  );

  const setRadius = useCallback(
    (radius: UiRadius) => {
      setPrefs({ ...readUiPreferences(), radius });
    },
    [setPrefs]
  );

  const setClayStyle = useCallback(
    (clayStyle: UiClayStyle) => {
      setPrefs({ ...readUiPreferences(), clayStyle });
    },
    [setPrefs]
  );

  const setCustomPrimary = useCallback(
    (customPrimary: string | null) => {
      setPrefs({ ...readUiPreferences(), customPrimary });
    },
    [setPrefs]
  );

  const setCustomAccent = useCallback(
    (customAccent: string | null) => {
      setPrefs({ ...readUiPreferences(), customAccent });
    },
    [setPrefs]
  );

  const resetUiCustom = useCallback(() => {
    const p = readUiPreferences();
    setPrefs({ ...p, customPrimary: null, customAccent: null });
  }, [setPrefs]);

  const value = useMemo(
    () =>
      ({
        prefs,
        setPrefs,
        setPreset,
        setDensity,
        setUiScale,
        setRadius,
        setClayStyle,
        setCustomPrimary,
        setCustomAccent,
        resetUiCustom,
      }) satisfies ThemeUiContextValue,
    [
      prefs,
      setPrefs,
      setPreset,
      setDensity,
      setUiScale,
      setRadius,
      setClayStyle,
      setCustomPrimary,
      setCustomAccent,
      resetUiCustom,
    ]
  );

  return <ThemeUiContext.Provider value={value}>{children}</ThemeUiContext.Provider>;
}

export function useThemeUi(): ThemeUiContextValue {
  const v = useContext(ThemeUiContext);
  if (!v) {
    throw new Error("useThemeUi debe usarse dentro de ThemeUiProvider");
  }
  return v;
}
