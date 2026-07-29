const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

/** ISO date-time string en hora local (sin sufijo Z) para que SQLite `date()` extraiga el día correcto. */
export function localNow(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
  );
}

/** Fecha local `YYYY-MM-DD`. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Normaliza parámetros de rango a `YYYY-MM-DD` (inclusivo por día calendario). */
export function rangoDiaCalendario(desde: string, hasta: string): { desde: string; hasta: string } {
  return { desde: desde.trim().slice(0, 10), hasta: hasta.trim().slice(0, 10) };
}

/** Condición SQL para filtrar `ventas.fecha` (ISO local con hora) por día calendario. */
export const SQL_VENTAS_EN_RANGO_DIA = `substr(fecha, 1, 10) >= ? AND substr(fecha, 1, 10) <= ?`;
