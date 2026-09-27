import { francAll } from "franc";

const ISO_639_3_TO_1: Record<string, string> = {
  tur: "tr",
  eng: "en",
  deu: "de",
  fra: "fr",
  rus: "ru",
  ara: "ar",
  spa: "es",
};

/** Detects the dominant language of a text; falls back to `fallback` when the text is too short to classify. */
export function detectLanguage(text: string, fallback = "en"): string {
  const [top] = francAll(text, { minLength: 20 });
  if (!top || top[0] === "und") return fallback;
  return ISO_639_3_TO_1[top[0]] ?? top[0];
}
