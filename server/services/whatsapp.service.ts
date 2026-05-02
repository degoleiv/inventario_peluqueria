import { AppError } from "../lib/AppError.js";
import { db } from "../db.js";

/** RF-11: recordatorio de cita (stub; conectar proveedor real con env). */
export async function enviarRecordatorioCita(citaId: number) {
  const row = db
    .prepare(
      `SELECT c.*, cl.telefono, cl.nombre AS cliente_nombre
       FROM citas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`
    )
    .get(citaId) as
    | { telefono: string | null; cliente_nombre: string; inicio: string }
    | undefined;
  if (!row) throw new AppError("Cita no encontrada", 404);
  if (!row.telefono?.trim()) {
    throw new AppError("El cliente no tiene teléfono", 400);
  }
  const url = process.env.WHATSAPP_WEBHOOK_URL?.trim();
  if (!url) {
    return {
      ok: false,
      motivo: "WHATSAPP_WEBHOOK_URL no configurada",
      destino: row.telefono,
    };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: row.telefono,
        body: `Recordatorio: cita el ${row.inicio} — ${row.cliente_nombre}`,
        cita_id: citaId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return { ok: true };
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "Error enviando WhatsApp", 502);
  }
}
