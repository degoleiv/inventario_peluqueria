/** Tema claro/oscuro del documento para `emoji-mart` (`Picker` / `theme="auto"`). */

export function readDataTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function subscribeDataTheme(onStoreChange: () => void): () => void {
  const mo = new MutationObserver(onStoreChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
