import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AppError } from "../lib/AppError.js";
import { usuariosRepo } from "../repositories/usuarios.js";
import { configuracionService } from "./configuracion.service.js";

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

const A4_W = 595.28;
const A4_H = 841.89;
const M = 50;
const USABLE_W = A4_W - 2 * M;

const COL_HEAD = rgb(44 / 255, 62 / 255, 80 / 255);
const COL_BODY = rgb(26 / 255, 26 / 255, 26 / 255);
const COL_MUTED = rgb(92 / 255, 108 / 255, 125 / 255);

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

/** Texto visible en PDF (sin HTML); recorta y quita saltos raros. */
function textoPdf(s: string, maxLen: number): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function wrapToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      line = trial;
    } else {
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
      } else {
        let rest = word;
        while (rest.length > 0) {
          let i = rest.length;
          while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > maxWidth) i--;
          lines.push(rest.slice(0, i));
          rest = rest.slice(i);
        }
        line = "";
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  x: number,
  yStart: number,
  size: number,
  lineHeight: number,
  color: ReturnType<typeof rgb>
): number {
  let y = yStart;
  for (const ln of lines) {
    page.drawText(ln, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

/** Decodifica `data:image/…` (PNG/JPEG) para incrustar en el PDF. */
function parseDataUrlImage(dataUrl: string): { buffer: Uint8Array; kind: "png" | "jpg" } | null {
  const trimmed = dataUrl.trim();
  if (!trimmed.toLowerCase().startsWith("data:image/")) return null;

  const base64Re =
    /^data:(image\/(?:png|jpeg|jpg));base64,([\s\S]+)$/i;
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
    const kind = mime.includes("png") ? "png" : "jpg";
    return { buffer: new Uint8Array(buffer), kind };
  }
  return null;
}

export const certificadoService = {
  async generarPdf(empleadoId: number, query: CertificadoQuery): Promise<Buffer> {
    const u = await usuariosRepo.findById(empleadoId);
    if (!u) {
      throw new AppError("Empleado no encontrado", 404);
    }

    const branding = await configuracionService.getBranding();
    const tienda = await configuracionService.getTienda();
    const certEmisor = await configuracionService.getCertificadoLaboral();

    const nombre = textoPdf(u.nombre?.trim() || u.email || `Usuario #${u.id}`, 200);
    const cedula = textoPdf(
      query.cedula?.trim() || `DOC-${String(u.id).padStart(6, "0")} (referencia interna)`,
      80
    );
    const cargo = textoPdf(query.cargo?.trim() || CARGO_POR_ROL[u.rol] || `Rol: ${u.rol}`, 120);

    let salarioPdf = "";
    if (query.salario != null && String(query.salario).trim() !== "") {
      salarioPdf = `con una remuneración mensual bruta de ${textoPdf(String(query.salario).trim(), 80)}, `;
    }

    const fechaIngRaw =
      query.fechaIngreso?.trim() || u.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const fechaIngreso = formatearFecha(
      fechaIngRaw.includes("T") ? fechaIngRaw : `${fechaIngRaw}T12:00:00`
    );

    const empresa = textoPdf(branding.nombre_negocio || tienda.nombre_comercial || "La empresa", 120);
    const lugar = textoPdf(
      query.lugar?.trim() ||
        certEmisor.ciudad_certificado?.trim() ||
        tienda.direccion?.split(",")[0]?.trim() ||
        "Buenos Aires",
      80
    );

    const nombreExpide = textoPdf(certEmisor.nombre_quien_expide || "", 120);
    const parsedFirma =
      certEmisor.firma_data_url && certEmisor.firma_data_url.trim().startsWith("data:image")
        ? parseDataUrlImage(certEmisor.firma_data_url)
        : null;

    const fechaCertificado = formatearFecha(new Date().toISOString());
    const referencia = `CERT-${empleadoId}-${Date.now().toString(36).toUpperCase()}`;

    const parsedLogo =
      branding.logo_data_url && branding.logo_data_url.trim().startsWith("data:image")
        ? parseDataUrlImage(branding.logo_data_url)
        : null;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_W, A4_H]);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    let y = A4_H - M;

    const logoSize = 72;
    const logoX = A4_W - M - logoSize;

    if (parsedLogo) {
      try {
        const embedded =
          parsedLogo.kind === "png"
            ? await pdfDoc.embedPng(parsedLogo.buffer)
            : await pdfDoc.embedJpg(parsedLogo.buffer);
        const scale = Math.min(logoSize / embedded.width, logoSize / embedded.height, 1);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        const imgBottom = A4_H - M - h;
        page.drawImage(embedded, {
          x: logoX + (logoSize - w) / 2,
          y: imgBottom,
          width: w,
          height: h,
        });
      } catch {
        /* logo inválido: seguimos sin imagen */
      }
    }

    const empresaMaxW = USABLE_W - logoSize - 24;
    const empresaLines = wrapToWidth(empresa, fontBold, 15, empresaMaxW);
    y = drawLines(page, fontBold, empresaLines, M, y, 15, 18, COL_HEAD);

    y -= 4;
    y = drawLines(
      page,
      font,
      ["Certificado expedido para fines laborales"],
      M,
      y,
      9,
      11,
      COL_MUTED
    );

    y -= 14;
    page.drawLine({
      start: { x: M, y },
      end: { x: A4_W - M, y },
      thickness: 1.2,
      color: COL_HEAD,
    });
    y -= 26;

    const titulo = "CERTIFICADO LABORAL";
    const tituloW = fontBold.widthOfTextAtSize(titulo, 12);
    page.drawText(titulo, {
      x: (A4_W - tituloW) / 2,
      y,
      size: 12,
      font: fontBold,
      color: COL_HEAD,
    });
    y -= 28;

    const introSuscriptor =
      nombreExpide.length > 0
        ? `Quien suscribe, ${nombreExpide}, en representación de ${empresa}, certifica que`
        : `Quien suscribe, en representación de ${empresa}, certifica que`;
    const p1 = `${introSuscriptor} ${nombre}, identificado(a) con documento de ciudadanía N.º ${cedula}, desempeña el cargo de ${cargo}, ${salarioPdf}habiendo ingresado en nuestra organización el día ${fechaIngreso}.`;
    const lines1 = wrapToWidth(p1, font, 11, USABLE_W);
    y = drawLines(page, font, lines1, M, y, 11, 15, COL_BODY);

    y -= 6;
    const p2 = `El presente certificado se expide a solicitud del interesado(a), en la ciudad de ${lugar}, a los ${fechaCertificado}.`;
    const lines2 = wrapToWidth(p2, font, 11, USABLE_W);
    y = drawLines(page, font, lines2, M, y, 11, 15, COL_BODY);

    y -= 28;

    if (parsedFirma) {
      try {
        const emb =
          parsedFirma.kind === "png"
            ? await pdfDoc.embedPng(parsedFirma.buffer)
            : await pdfDoc.embedJpg(parsedFirma.buffer);
        const maxW = 200;
        const maxH = 56;
        const sc = Math.min(maxW / emb.width, maxH / emb.height, 1);
        const w = emb.width * sc;
        const h = emb.height * sc;
        const imgBottom = y - h;
        page.drawImage(emb, { x: M, y: imgBottom, width: w, height: h });
        y = imgBottom - 10;
      } catch {
        /* firma inválida: solo línea y nombre */
      }
    }

    page.drawText("Firma y sello", {
      x: M,
      y,
      size: 8,
      font,
      color: COL_MUTED,
    });
    y -= 12;
    page.drawLine({
      start: { x: M, y },
      end: { x: M + 220, y },
      thickness: 0.8,
      color: COL_HEAD,
    });
    y -= 10;
    const pieFirmaNombre = nombreExpide.length > 0 ? nombreExpide : "Representación de la empresa";
    const pieLines = wrapToWidth(pieFirmaNombre, fontBold, 10, 220);
    y = drawLines(page, fontBold, pieLines, M, y, 10, 13, COL_HEAD);

    y -= 18;
    const pie1 = `Documento generado electrónicamente · Ref. ${referencia} · Válido sin enmiendas ni tachaduras.`;
    y = drawLines(page, font, wrapToWidth(pie1, font, 8.5, USABLE_W), M, y, 8.5, 11, COL_MUTED);

    y -= 4;
    const pie2 =
      "Este documento no constituye compromiso contractual adicional. Para mayor información, contactar administración.";
    y = drawLines(
      page,
      font,
      wrapToWidth(pie2, font, 8, USABLE_W),
      M,
      y,
      8,
      11,
      rgb(138 / 255, 150 / 255, 160 / 255)
    );

    const bytes = await pdfDoc.save();
    console.info(`[certificado] PDF (pdf-lib) empleado_id=${empleadoId} bytes=${bytes.length}`);
    return Buffer.from(bytes);
  },
};
