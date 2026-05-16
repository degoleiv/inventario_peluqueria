/** Empleados con rol vendedor o tipo salario: remuneración fija mensual, sin comisiones por venta/cita. */
export function esSalarioFijo(rol: string | null | undefined, tipoComision?: string | null): boolean {
  const r = (rol ?? "").trim().toLowerCase();
  const t = (tipoComision ?? "").trim().toLowerCase();
  return r === "vendedor" || t === "salario";
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysInclusive(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/** Prorratea el salario mensual por días calendario dentro del rango [desde, hasta] (inclusive). */
export function calcularSalarioPeriodo(
  salarioMensual: number,
  desde: string,
  hasta: string
): number {
  const mensual = Number(salarioMensual);
  if (!Number.isFinite(mensual) || mensual <= 0) return 0;

  const start = parseIsoDate(desde);
  const end = parseIsoDate(hasta);
  if (end < start) return 0;

  let total = 0;
  let cy = start.getFullYear();
  let cm = start.getMonth();

  for (;;) {
    const monthStart = new Date(cy, cm, 1);
    const monthEnd = new Date(cy, cm + 1, 0);
    const daysInMonth = monthEnd.getDate();

    const segStart = start > monthStart ? start : monthStart;
    const segEnd = end < monthEnd ? end : monthEnd;

    if (segStart <= segEnd) {
      const days = daysInclusive(segStart, segEnd);
      total += mensual * (days / daysInMonth);
    }

    if (cy === end.getFullYear() && cm === end.getMonth()) break;
    cm += 1;
    if (cm > 11) {
      cm = 0;
      cy += 1;
    }
  }

  return Math.round(total * 100) / 100;
}
