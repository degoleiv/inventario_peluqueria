import emojiMartDataEsJson from "../data/emoji-mart-es.json";
import emojiMartI18nEsJson from "@emoji-mart/data/i18n/es.json";

/** Datos de emoji-mart con nombres y palabras clave en español (CLDR). */
export const emojiMartDataEs = emojiMartDataEsJson;

/** Textos de interfaz del selector en español. */
export const emojiMartI18nEs = emojiMartI18nEsJson;

/** Props comunes para `@emoji-mart/react` en español. */
export const emojiMartPickerEsProps = {
  data: emojiMartDataEsJson,
  locale: "es" as const,
  i18n: emojiMartI18nEsJson,
};
