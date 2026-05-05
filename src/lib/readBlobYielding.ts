import { yieldToMain } from "./yieldToMain";

/**
 * Construye un `Blob` leyendo el cuerpo por trozos y cediendo al hilo principal entre lecturas,
 * para evitar un único bloqueo largo de `Response.blob()` en PDFs grandes.
 */
export async function readResponseAsBlobYielding(res: Response): Promise<Blob> {
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  if (!res.body) {
    await yieldToMain();
    return res.blob();
  }
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) parts.push(value);
    await yieldToMain();
  }
  return new Blob(parts, { type: mime });
}
