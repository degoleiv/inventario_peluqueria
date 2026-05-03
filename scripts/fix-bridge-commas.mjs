import fs from "node:fs";
const p = "src/styles/bridge-design-system.css";
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
for (let i = 0; i < lines.length - 1; i++) {
  const line = lines[i];
  const next = lines[i + 1];
  if (!next || !line.trim()) continue;
  const t = line.trimEnd();
  if (t.endsWith("{") || t.endsWith(",") || t.endsWith("}") || t.startsWith("/*") || t.startsWith("*")) continue;
  if (t.startsWith("@")) continue;
  if (next.trim().startsWith("body.theme-default") && line.includes("body.theme-slate")) {
    lines[i] = line + ",";
  }
}
fs.writeFileSync(p, lines.join("\n"));
console.log("fixed trailing commas after slate lines before default");
