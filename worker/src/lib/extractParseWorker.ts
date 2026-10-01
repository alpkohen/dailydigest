import { parentPort } from "node:worker_threads";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { stripStylesheets } from "./htmlSanitize.js";

interface ParseRequest {
  id: number;
  html: string;
  url: string;
}

interface ParseResponse {
  id: number;
  text: string | null;
  error?: string;
}

// Runs inside a worker thread (see parsePool.ts): JSDOM/Readability parse
// synchronously with no timeout of their own, so a pathological document can
// block an event loop forever. Isolating the parse here means the pool can
// kill a stuck worker without losing the rest of the pipeline.
parentPort?.on("message", (msg: ParseRequest) => {
  try {
    const dom = new JSDOM(stripStylesheets(msg.html), { url: msg.url });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.trim() || null;
    parentPort!.postMessage({ id: msg.id, text } satisfies ParseResponse);
  } catch (err) {
    parentPort!.postMessage({ id: msg.id, text: null, error: (err as Error).message } satisfies ParseResponse);
  }
});
