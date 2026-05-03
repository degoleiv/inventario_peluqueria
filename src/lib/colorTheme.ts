export type ColorThemeId =
  | "default"
  | "neon"
  | "girly"
  | "purple"
  | "ocean"
  | "slate";

const LEGACY_STORAGE_KEY = "peluqueria_color_theme";

const BODY_CLASSES: Record<ColorThemeId, string> = {
  default: "theme-default",
  neon: "theme-neon",
  girly: "theme-girly",
  purple: "theme-purple",
  ocean: "theme-ocean",
  slate: "theme-slate",
};

const ALL_THEME_BODY_CLASSES = Object.values(BODY_CLASSES);

/** Lectura mínima para arranque antes del provider (solo clave legada). */
export function readColorTheme(): ColorThemeId {
  try {
    const s = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (
      s === "neon" ||
      s === "girly" ||
      s === "purple" ||
      s === "ocean" ||
      s === "slate" ||
      s === "default"
    ) {
      return s;
    }
  } catch {
    /* ignore */
  }
  return "default";
}

export function writeColorTheme(theme: ColorThemeId): void {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyColorThemeToBody(theme: ColorThemeId): void {
  const body = document.body;
  body.classList.remove(...ALL_THEME_BODY_CLASSES);
  body.classList.add(BODY_CLASSES[theme]);
}
