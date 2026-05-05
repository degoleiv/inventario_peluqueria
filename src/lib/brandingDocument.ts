import type { BrandingConfig } from "../api";

const DEFAULT_FAVICON_HREF = "/vite.svg";

function faviconTypeFromDataUrl(dataUrl: string): string {
  const m = /^data:(image\/[a-z0-9.+-]+);/i.exec(dataUrl);
  return m?.[1] ?? "image/png";
}

/** Actualiza favicon del documento (data URL del logo o icono por defecto). */
export function setDocumentFavicon(logoDataUrl: string | null | undefined): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (logoDataUrl && logoDataUrl.startsWith("data:image")) {
    link.href = logoDataUrl;
    link.setAttribute("type", faviconTypeFromDataUrl(logoDataUrl));
  } else {
    link.href = DEFAULT_FAVICON_HREF;
    link.setAttribute("type", "image/svg+xml");
  }
}

/** Colores de marca en `:root` + favicon (login, app y tras guardar en Configuración). */
export function applyBrandingToDocument(b: BrandingConfig): void {
  document.documentElement.style.setProperty("--brand-primary", b.color_primario);
  document.documentElement.style.setProperty("--brand-secondary", b.color_secundario);
  setDocumentFavicon(b.logo_data_url);
}
