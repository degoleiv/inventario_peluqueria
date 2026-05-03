import type { ColorThemeId } from "./colorTheme";

export type ThemeCatalogEntry = {
  id: ColorThemeId;
  label: string;
  hint: string;
  swatch: [string, string, string];
};

export const THEME_CATALOG: ThemeCatalogEntry[] = [
  {
    id: "default",
    label: "Profesional",
    hint: "Indigo y neutros; ideal oficina.",
    swatch: ["#4F46E5", "#10B981", "#F59E0B"],
  },
  {
    id: "neon",
    label: "Neon soft",
    hint: "Oscuro con acentos vivos.",
    swatch: ["#7F5AF0", "#2CB67D", "#FF8906"],
  },
  {
    id: "girly",
    label: "Girly soft",
    hint: "Rosa pastel y claridad.",
    swatch: ["#FF8BA7", "#FFC6C7", "#CDB4DB"],
  },
  {
    id: "purple",
    label: "Purple",
    hint: "Violeta y contraste suave.",
    swatch: ["#7C3AED", "#A78BFA", "#EC4899"],
  },
  {
    id: "ocean",
    label: "Ocean",
    hint: "Teal y arena clara.",
    swatch: ["#0D9488", "#14B8A6", "#F59E0B"],
  },
  {
    id: "slate",
    label: "Slate",
    hint: "Corporativo frío y sobrio.",
    swatch: ["#334155", "#64748B", "#0EA5E9"],
  },
];
