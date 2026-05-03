import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

    let logoContenido: string;
    if (branding.logo_data_url && branding.logo_data_url.startsWith("data:image")) {
      logoContenido = `<img src="${branding.logo_data_url}" alt="Logo" />`;
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

    const html = renderTemplate(vars);

    let page;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
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
  },
};
