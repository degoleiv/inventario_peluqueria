/**
 * Combina @emoji-mart/data con anotaciones CLDR en español para búsqueda y nombres localizados.
 * Ejecutar: node scripts/build-emoji-data-es.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VS16 = "\ufe0f";
const ZWJ = "\u200d";
const strip = (emoji) => emoji.replaceAll(VS16, "").replaceAll(ZWJ, "");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const data = JSON.parse(
  fs.readFileSync(path.join(root, "node_modules/@emoji-mart/data/sets/15/native.json"), "utf8")
);
const esFull = JSON.parse(
  fs.readFileSync(
    path.join(root, "node_modules/cldr-annotations-full/annotations/es/annotations.json"),
    "utf8"
  )
);
const esDerived = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "node_modules/cldr-annotations-derived-full/annotationsDerived/es/annotations.json"
    ),
    "utf8"
  )
);

const fullMap = esFull.annotations?.annotations ?? esFull.annotations ?? {};
const derivedMap = esDerived.annotationsDerived?.annotations ?? esDerived.annotations ?? {};

function applyCldr(emojiData, cldrAnnotations) {
  const keys = Object.keys(cldrAnnotations);
  const native = strip(emojiData.skins?.[0]?.native ?? "");
  const matchKey = keys.find((k) => strip(k) === native);
  if (!matchKey) return;
  const ann = cldrAnnotations[matchKey];
  if (ann?.tts?.[0]) emojiData.name = ann.tts[0];
  if (Array.isArray(ann?.default) && ann.default.length > 0) {
    emojiData.keywords = [...new Set(ann.default.map((k) => String(k).trim()).filter(Boolean))];
  }
}

let localized = 0;
for (const emojiId of Object.keys(data.emojis)) {
  const emojiData = data.emojis[emojiId];
  applyCldr(emojiData, fullMap);
  applyCldr(emojiData, derivedMap);
  if (emojiData.keywords?.length) localized++;
}

const outDir = path.join(root, "src/data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "emoji-mart-es.json");
fs.writeFileSync(outPath, JSON.stringify(data));

console.log(`Escrito ${outPath} (${localized} emojis con palabras clave en español).`);
