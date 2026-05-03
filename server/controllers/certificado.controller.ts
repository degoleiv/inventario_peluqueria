import type { Request, Response } from "express";
import { certificadoService } from "../services/certificado.service.js";

function parseEmpleadoId(req: Request, res: Response): number | null {
  const raw = req.params.idEmpleado ?? req.params.id;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "id de empleado inválido" });
    return null;
  }
  return Math.floor(id);
}

export const certificadoController = {
  async generar(req: Request, res: Response): Promise<void> {
    const id = parseEmpleadoId(req, res);
    if (id == null) return;

    const q = req.query as Record<string, string | undefined>;
    const pdf = await certificadoService.generarPdf(id, {
      cedula: q.cedula,
      cargo: q.cargo,
      salario: q.salario,
      fechaIngreso: q.fechaIngreso,
      lugar: q.lugar,
    });

    const download = q.descargar === "1" || q.download === "1";
    const nombreArchivo = `certificado-laboral-${id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${nombreArchivo}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`
    );
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  },
};
