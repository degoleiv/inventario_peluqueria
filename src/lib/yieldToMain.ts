/**
 * Devuelve control al hilo principal (pintado, input) antes de trabajo costoso
 * como `Response.blob()` o crear URLs de objetos grandes.
 */
export async function yieldToMain(): Promise<void> {
  const sch = typeof scheduler !== "undefined" ? scheduler : undefined;
  if (sch && typeof sch.yield === "function") {
    await sch.yield();
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
