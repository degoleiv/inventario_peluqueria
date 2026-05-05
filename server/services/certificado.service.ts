import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser } from "puppeteer";
import { AppError } from "../lib/AppError.js";
import { usuariosRepo } from "../repositories/usuarios.js";
import { configuracionService } from "./configuracion.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, "../templates/certificado.html");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Decodifica `data:image/…` (base64 o SVG URL-encoded) para escribir un archivo junto al HTML del certificado. */
function parseDataUrlImage(dataUrl: string): { buffer: Buffer; ext: string } | null {
  const trimmed = dataUrl.trim();
  if (!trimmed.toLowerCase().startsWith("data:image/")) return null;

  const base64Re =
    /^data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml));base64,([\s\S]+)$/i;
  const m = base64Re.exec(trimmed);
  if (m) {
    const mime = m[1].toLowerCase();
    const b64 = m[2].replace(/\s/g, "");
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return null;
    }
    if (buffer.length === 0) return null;
    let ext = "png";
    if (mime.includes("svg")) ext = "svg";
    else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
    else if (mime.includes("webp")) ext = "webp";
    else if (mime.includes("gif")) ext = "gif";
    return { buffer, ext };
  }

  const svgUrlRe = /^data:image\/svg\+xml(?:;charset=[\w-]+)?,(.+)$/i;
  const m2 = svgUrlRe.exec(trimmed);
  if (m2) {
    try {
      const enc = m2[1];
      const decoded = decodeURIComponent(enc.replace(/\+/g, " "));
      const buffer = Buffer.from(decoded, "utf8");
      if (buffer.length === 0) return null;
      return { buffer, ext: "svg" };
    } catch {
      return null;
    }
  }

  return null;
}

/** Puppeteer: una instancia de navegador compartida entre solicitudes. */
let browserPromise: Promise<Browser> | null = null;

/**
 * Import dinámico: el API puede arrancar sin `puppeteer` en node_modules; solo falla al pedir un PDF.
 */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    let launch: typeof import("puppeteer").default.launch;
    try {
      launch = (await import("puppeteer")).default.launch;
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
      throw new AppError(
        code === "ERR_MODULE_NOT_FOUND"
          ? "Falta el paquete puppeteer: ejecutá npm install en la raíz del proyecto."
          : "No se pudo cargar puppeteer para generar PDFs.",
        503
      );
    }
    browserPromise = launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ],
    });
    process.once("beforeExit", async () => {
      try {
        const b = await browserPromise;
        await b.close();
      } catch {
        /* ignore */
      }
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function closeCertificadoBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } finally {
    browserPromise = null;
  }
}

export type CertificadoQuery = {
  cedula?: string;
  cargo?: string;
  salario?: string;
  fechaIngreso?: string;
  lugar?: string;
};

const CARGO_POR_ROL: Record<string, string> = {
  admin: "Administración / dirección",
  empleado: "Atención al cliente y servicios del salón",
};

function formatearFecha(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function renderTemplate(vars: Record<string, string>): string {
  let html = readFileSync(TEMPLATE_PATH, "utf-8");
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

export const certificadoService = {
  async generarPdf(empleadoId: number, query: CertificadoQuery): Promise<Buffer> {
    const u = usuariosRepo.findById(empleadoId);
    if (!u) {
      throw new AppError("Empleado no encontrado", 404);
    }

    const branding = configuracionService.getBranding();
    const tienda = configuracionService.getTienda();

    const nombre = escapeHtml((u.nombre?.trim() || u.email || `Usuario #${u.id}`).slice(0, 200));
    const cedula = escapeHtml(
      (query.cedula?.trim() || `DOC-${String(u.id).padStart(6, "0")} (referencia interna)`).slice(
        0,
        80
      )
    );
    const cargo = escapeHtml(
      (query.cargo?.trim() || CARGO_POR_ROL[u.rol] || `Rol: ${u.rol}`).slice(0, 120)
    );

    let salarioTexto = "";
    if (query.salario != null && String(query.salario).trim() !== "") {
      const s = escapeHtml(String(query.salario).trim().slice(0, 80));
      salarioTexto = `con una remuneración mensual bruta de <span class="dato">${s}</span>, `;
    }

    const fechaIngRaw =
      query.fechaIngreso?.trim() || u.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const fechaIngreso = escapeHtml(formatearFecha(fechaIngRaw.includes("T") ? fechaIngRaw : fechaIngRaw + "T12:00:00"));

    const empresa = escapeHtml((branding.nombre_negocio || tienda.nombre_comercial || "La empresa").slice(0, 120));
    const lugar = escapeHtml((query.lugar?.trim() || tienda.direccion?.split(",")[0]?.trim() || "Buenos Aires").slice(0, 80));

    const hoy = formatearFecha(new Date().toISOString());
    const fechaCertificado = escapeHtml(hoy);

    const parsedLogo =
      branding.logo_data_url && branding.logo_data_url.trim().startsWith("data:image")
        ? parseDataUrlImage(branding.logo_data_url)
        : null;

    let logoContenido: string;
    if (parsedLogo) {
      logoContenido = `<img class="logo-img" src="{{LOGO_FILE}}" alt="Logo" />`;
    } else {
      logoContenido = `<span class="logo-ph">Logo<br /><small>(placeholder)</small></span>`;
    }

    const firmaImagen =
      '<span class="muted" style="font-size:9pt;font-family:system-ui,sans-serif">Firma manuscrita / sello</span>';

    const vars: Record<string, string> = {
      nombre,
      cedula,
      cargo,
      salarioTexto,
      fechaIngreso,
      empresa,
      lugar,
      fechaCertificado,
      logoContenido,
      firmaImagen,
      referencia: `CERT-${empleadoId}-${Date.now().toString(36).toUpperCase()}`,
    };

    let html = renderTemplate(vars);
    if (parsedLogo) {
      const logoFile = `logo.${parsedLogo.ext}`;
      html = html.split("{{LOGO_FILE}}").join(encodeURI(logoFile));
    } else {
      html = html.split("{{LOGO_FILE}}").join("");
    }

    const workDir = mkdtempSync(join(tmpdir(), "cert-pdf-"));
    try {
      const htmlPath = join(workDir, "certificado.html");
      if (parsedLogo) {
        writeFileSync(join(workDir, `logo.${parsedLogo.ext}`), parsedLogo.buffer);
      }
      writeFileSync(htmlPath, html, "utf-8");
      const pageUrl = pathToFileURL(htmlPath).href;

      let page;
      try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.goto(pageUrl, { waitUntil: "load", timeout: 60_000 });
        if (parsedLogo) {
          await page
            .waitForFunction(
              () => {
                const img = document.querySelector("img.logo-img");
                return (
                  img instanceof HTMLImageElement &&
                  img.complete &&
                  (img.naturalWidth > 0 || img.naturalHeight > 0)
                );
              },
              { timeout: 15_000 }
            )
            .catch(() => {
              /* el PDF igual se genera; logo puede fallar si el archivo no es una imagen válida */
            });
        }
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: "18mm", right: "18mm", bottom: "22mm", left: "18mm" },
        });
        console.info(`[certificado] PDF generado empleado_id=${empleadoId} bytes=${pdf.length}`);
        return Buffer.from(pdf);
      } catch (e) {
        console.error("[certificado] Fallo al generar PDF:", e);
        throw new AppError(
          e instanceof Error ? `No se pudo generar el PDF: ${e.message}` : "Error al generar PDF",
          503
        );
      } finally {
        if (page) await page.close().catch(() => {});
      }
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  },
};
