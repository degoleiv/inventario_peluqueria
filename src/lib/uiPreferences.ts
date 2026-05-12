import { applyColorThemeToBody, type ColorThemeId } from "./colorTheme";

export type UiDensity = "comfortable" | "compact";

/** Forma de bordes en controles y tarjetas */
export type UiRadius = "default" | "soft" | "pill";

export type UiClayStyle = "full" | "soft";

/** Escala visual global (pantallas chicas / tablets). 100 = sin zoom. */
export type UiScale = 100 | 92 | 85 | 78;

export type UiPreferences = {
  preset: ColorThemeId;
  density: UiDensity;
  /** Zoom del documento (Chrome/Edge; en otros navegadores puede ignorarse). */
  uiScale: UiScale;
  radius: UiRadius;
  clayStyle: UiClayStyle;
  /** Si se define, pisa `--primary` del tema en `:root` (solo esta app / equipo). */
  customPrimary: string | null;
  /** Si se define, pisa `--accent` del tema. */
  customAccent: string | null;
};

const STORAGE_KEY = "peluqueria_ui_prefs";
const LEGACY_THEME_KEY = "peluqueria_color_theme";

const DEFAULT_PREFS: UiPreferences = {
  preset: "default",
  density: "comfortable",
  uiScale: 100,
  radius: "default",
  clayStyle: "full",
  customPrimary: null,
  customAccent: null,
};

function parseUiScale(v: unknown): UiScale {
  const n = typeof v === "number" ? v : Number(v);
  if (n === 92 || n === 85 || n === 78) return n as UiScale;
  return 100;
}

function isPresetId(s: string): s is ColorThemeId {
  return (
    s === "default" ||
    s === "neon" ||
    s === "girly" ||
    s === "purple" ||
    s === "ocean" ||
    s === "slate"
  );
}

export function readUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<UiPreferences>;
      const preset = o.preset && isPresetId(o.preset) ? o.preset : DEFAULT_PREFS.preset;
      return {
        preset,
        density: o.density === "compact" ? "compact" : "comfortable",
        uiScale: parseUiScale(o.uiScale),
        radius: o.radius === "soft" || o.radius === "pill" ? o.radius : "default",
        clayStyle: o.clayStyle === "soft" ? "soft" : "full",
        customPrimary:
          typeof o.customPrimary === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.customPrimary)
            ? o.customPrimary
            : null,
        customAccent:
          typeof o.customAccent === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.customAccent)
            ? o.customAccent
            : null,
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy && isPresetId(legacy)) {
      return { ...DEFAULT_PREFS, preset: legacy };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS };
}

export function writeUiPreferences(prefs: UiPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    localStorage.setItem(LEGACY_THEME_KEY, prefs.preset);
  } catch {
    /* ignore */
  }
}

/** Aplica clase de tema en body, densidad, radios, estilo clay y colores opcionales en :root. */
export function applyUiPreferencesToDocument(prefs: UiPreferences): void {
  applyColorThemeToBody(prefs.preset);

  document.body.classList.toggle("ui-density-compact", prefs.density === "compact");

  if (prefs.uiScale === 100) {
    document.documentElement.style.removeProperty("zoom");
    delete document.documentElement.dataset.uiScale;
  } else {
    const z = prefs.uiScale / 100;
    document.documentElement.style.zoom = String(z);
    document.documentElement.dataset.uiScale = String(prefs.uiScale);
  }

  if (prefs.radius === "default") {
    delete document.documentElement.dataset.uiRadius;
  } else {
    document.documentElement.dataset.uiRadius = prefs.radius;
  }

  if (prefs.clayStyle === "full") {
    delete document.documentElement.dataset.clayStyle;
  } else {
    document.documentElement.dataset.clayStyle = prefs.clayStyle;
  }

  const root = document.documentElement.style;
  if (prefs.customPrimary) {
    root.setProperty("--primary", prefs.customPrimary);
  } else {
    root.removeProperty("--primary");
  }
  if (prefs.customAccent) {
    root.setProperty("--accent", prefs.customAccent);
  } else {
    root.removeProperty("--accent");
  }
}
