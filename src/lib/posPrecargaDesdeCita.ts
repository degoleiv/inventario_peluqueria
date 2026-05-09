/** Precarga del POS al venir desde una cita (React Router `location.state`). */

export type PosPreloadCitaPayload = {
  v: 1;
  clienteId: number;
  citaId: number;
  servicio: string | null;
  inicioIso: string;
  usuarioId: number | null;
};

export function parsePosPreloadCita(raw: unknown): PosPreloadCitaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PosPreloadCitaPayload>;
  if (p.v !== 1 || !Number.isFinite(Number(p.clienteId))) return null;
  return {
    v: 1,
    clienteId: Number(p.clienteId),
    citaId: Number.isFinite(Number(p.citaId)) ? Number(p.citaId) : 0,
    servicio: typeof p.servicio === "string" && p.servicio.trim() ? p.servicio.trim() : null,
    inicioIso: typeof p.inicioIso === "string" ? p.inicioIso : "",
    usuarioId:
      p.usuarioId != null && Number.isFinite(Number(p.usuarioId)) ? Number(p.usuarioId) : null,
  };
}
