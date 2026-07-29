import type { ReactNode } from "react";

/** Convierte dígitos keycap (3️⃣) a ASCII plano. */
export function normalizeKeycapDigits(text: string): string {
  return text
    .replace(/(\d)\uFE0F?\u20E3/gu, "$1")
    .replace(/\uFE0F/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const VOLUMEN_RE =
  /^(.*?)\s+(\d+(?:[.,]\d+)?\s*(?:ml|mL|ML|l|L|g|gr|kg|oz))\s*(.*)$/u;

export type ProductoNombrePartes = {
  /** Texto plano para búsqueda / value del select */
  label: string;
  /** Nodo con el volumen en cursiva entre paréntesis */
  labelNode: ReactNode;
};

/**
 * Separa el volumen final del nombre (p. ej. "300 ml") y lo formatea
 * como cursiva entre paréntesis: Nombre *(300 ml)*.
 */
export function formatProductoNombreSelect(nombre: string): ProductoNombrePartes {
  const raw = normalizeKeycapDigits(nombre || "");
  if (!raw) return { label: "", labelNode: "" };

  const m = raw.match(VOLUMEN_RE);
  if (!m) return { label: raw, labelNode: raw };

  const base = m[1]!.trim();
  const volumen = m[2]!.replace(/\s+/g, " ").trim();
  const trailing = m[3]!.trim(); // p. ej. "(copia)"
  if (!base) return { label: raw, labelNode: raw };

  const mid = trailing ? ` ${trailing}` : "";
  const label = `${base}${mid} (${volumen})`;
  const labelNode = (
    <>
      {base}
      {mid}
      {" "}
      <em className="producto-nombre-vol">({volumen})</em>
    </>
  );
  return { label, labelNode };
}
