/** Parte de un pago mixto: código de medio + monto opcional. */
export type ParteMixta = {
  codigo: string;
  monto?: number;
};

export type MetodoPagoMixtoParseado = {
  partes: ParteMixta[];
};

/** Parsea `mixto:efectivo@5000+transferencia_nequi@3000` o `mixto:efectivo+tarjeta` (sin montos). */
export function parseMetodoPagoMixto(metodo: string): MetodoPagoMixtoParseado | null {
  const raw = metodo.trim();
  if (!raw.toLowerCase().startsWith("mixto:")) return null;
  const cuerpo = raw.slice(raw.indexOf(":") + 1);
  if (!cuerpo) return { partes: [] };
  const partes: ParteMixta[] = [];
  for (const segmento of cuerpo.split("+").filter(Boolean)) {
    const s = segmento.trim();
    const at = s.lastIndexOf("@");
    if (at > 0) {
      const codigo = s.slice(0, at).trim().toLowerCase();
      const monto = Number(s.slice(at + 1).replace(",", "."));
      if (codigo) {
        partes.push({
          codigo,
          monto: Number.isFinite(monto) && monto >= 0 ? monto : undefined,
        });
      }
    } else {
      partes.push({ codigo: s.toLowerCase() });
    }
  }
  return { partes };
}

export function buildMetodoPagoMixto(
  codigo1: string,
  monto1: number,
  codigo2: string,
  monto2: number
): string {
  const fmt = (c: string, m: number) => `${c}@${Math.round(m * 100) / 100}`;
  return `mixto:${fmt(codigo1, monto1)}+${fmt(codigo2, monto2)}`;
}
