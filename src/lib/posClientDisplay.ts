/** Vista cliente del POS: solo datos seguros para mostrar al público. */

export type PosClienteLine = {
  nombre: string;
  cantidad: number;
  importe: number;
};

export type PosClienteSnapshot = {
  lines: PosClienteLine[];
  subtotal: number;
};

const CHANNEL_NAME = "peluqueria-pos-cliente-v1";
/** localStorage (compartido entre ventanas del mismo origen) para estado inicial al abrir la pantalla cliente. */
export const POS_CLIENTE_STORAGE_KEY = "peluqueria_pos_cliente_snapshot_v1";

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function publishPosClienteDisplay(snapshot: PosClienteSnapshot): void {
  try {
    localStorage.setItem(POS_CLIENTE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
  try {
    getChannel()?.postMessage(snapshot);
  } catch {
    /* ignore */
  }
}

export function readPosClienteDisplaySnapshot(): PosClienteSnapshot | null {
  try {
    const raw = localStorage.getItem(POS_CLIENTE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PosClienteSnapshot;
    if (!p || !Array.isArray(p.lines) || typeof p.subtotal !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function subscribePosClienteDisplay(
  onMessage: (snapshot: PosClienteSnapshot) => void
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (ev: MessageEvent<PosClienteSnapshot>) => {
    const d = ev.data;
    if (!d || !Array.isArray(d.lines) || typeof d.subtotal !== "number") return;
    onMessage(d);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

/** Si BroadcastChannel no está disponible, otro tab actualiza localStorage y dispara `storage` aquí. */
export function subscribePosClienteStorage(onChange: () => void): () => void {
  const fn = (e: StorageEvent) => {
    if (e.key === POS_CLIENTE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", fn);
  return () => window.removeEventListener("storage", fn);
}
