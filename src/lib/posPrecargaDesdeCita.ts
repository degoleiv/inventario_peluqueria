/** Precarga del POS al venir desde una cita (React Router `location.state`). */

export type PosPreloadCitaServicio = {
  nombre: string;
  usuarioId: number | null;
  cantidad: number;
  valorUnitario: number;
};

export type PosPreloadCitaPayload = {
  v: 1;
  clienteId: number;
  citaId: number;
  servicio: string | null;
  inicioIso: string;
  usuarioId: number | null;
  /** Servicios realizados a precargar como líneas separadas en el POS. */
  servicios?: PosPreloadCitaServicio[];
};

function parseServicios(raw: unknown): PosPreloadCitaServicio[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const nombre =
        typeof r.nombre === "string" && r.nombre.trim() ? r.nombre.trim() : "";
      if (!nombre) return null;
      const cantidad = Math.max(1, Math.floor(Number(r.cantidad ?? 1)));
      const valorUnitario = Math.max(0, Number(r.valorUnitario ?? r.valor_unitario ?? 0));
      let usuarioId: number | null = null;
      if (r.usuarioId != null && r.usuarioId !== "") {
        const n = Number(r.usuarioId);
        if (Number.isFinite(n)) usuarioId = Math.floor(n);
      } else if (r.usuario_id != null && r.usuario_id !== "") {
        const n = Number(r.usuario_id);
        if (Number.isFinite(n)) usuarioId = Math.floor(n);
      }
      return {
        nombre,
        usuarioId,
        cantidad,
        valorUnitario: Number.isFinite(valorUnitario) ? valorUnitario : 0,
      };
    })
    .filter((x): x is PosPreloadCitaServicio => x !== null);
}

/** Misma convención que el servidor en `citaService.getCobroData` (texto en columna `citas.servicio`). */
export function lineasServicioDesdeTextoAgenda(
  servicioRaw: string | null | undefined,
  usuarioIdCita: number | null
): PosPreloadCitaServicio[] {
  const raw = (servicioRaw ?? "").trim();
  const nombres = raw
    .split(/\s*,\s*|\s*;\s*|\s+\u00B7\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const list = nombres.length > 0 ? nombres : raw ? [raw] : [];
  return list.map((nombre) => ({
    nombre,
    usuarioId: usuarioIdCita,
    cantidad: 1,
    valorUnitario: 0,
  }));
}

export function parsePosPreloadCita(raw: unknown): PosPreloadCitaPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PosPreloadCitaPayload> & { servicios?: unknown };
  if (p.v !== 1 || !Number.isFinite(Number(p.clienteId))) return null;
  return {
    v: 1,
    clienteId: Number(p.clienteId),
    citaId: Number.isFinite(Number(p.citaId)) ? Number(p.citaId) : 0,
    servicio: typeof p.servicio === "string" && p.servicio.trim() ? p.servicio.trim() : null,
    inicioIso: typeof p.inicioIso === "string" ? p.inicioIso : "",
    usuarioId:
      p.usuarioId != null && Number.isFinite(Number(p.usuarioId)) ? Number(p.usuarioId) : null,
    servicios: parseServicios(p.servicios),
  };
}
