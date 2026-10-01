import { Worker } from "node:worker_threads";

const WORKER_PATH = new URL("./extractParseWorker.js", import.meta.url);
const PARSE_TIMEOUT_MS = 10_000;

interface ParseResponse {
  id: number;
  text: string | null;
  error?: string;
}

/**
 * One persistent worker thread plus a hard per-call timeout. A hung parse
 * blocks that thread's event loop forever (nothing it's running will ever
 * yield back), so the only way to reclaim it is `terminate()` - a plain
 * `Promise.race` on its own does not help, since the main thread is a
 * different event loop and keeps running regardless, but the dead worker
 * would otherwise sit there accepting messages it can never answer.
 */
class ParseWorker {
  private worker: Worker;
  private pending = new Map<number, (text: string | null) => void>();
  private nextId = 0;

  constructor() {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = new Worker(WORKER_PATH);
    worker.on("message", (msg: ParseResponse) => {
      const resolve = this.pending.get(msg.id);
      if (!resolve) return;
      this.pending.delete(msg.id);
      resolve(msg.error ? null : msg.text);
    });
    // A worker that crashes outright (rather than hanging) leaves no message
    // coming for whatever it was mid-task on; replacing it here means the
    // *next* parse() call gets a fresh worker instead of posting into the
    // void. Already-pending calls on the dead worker still resolve via
    // their own timeout below.
    worker.on("exit", () => {
      if (this.worker === worker) this.worker = this.spawn();
    });
    worker.on("error", (err) => {
      console.error("parsePool: worker error:", err);
    });
    return worker;
  }

  parse(html: string, url: string): Promise<string | null> {
    const id = this.nextId++;
    const worker = this.worker;

    const result = new Promise<string | null>((resolve) => {
      this.pending.set(id, resolve);
    });
    worker.postMessage({ id, html, url });

    const timeout = new Promise<string | null>((resolve) => {
      setTimeout(() => {
        if (!this.pending.delete(id)) return;
        if (this.worker === worker) {
          void worker.terminate();
          this.worker = this.spawn();
        }
        resolve(null);
      }, PARSE_TIMEOUT_MS);
    });

    return Promise.race([result, timeout]);
  }

  destroy(): Promise<number> {
    return this.worker.terminate();
  }
}

/** Round-robins parse calls across a small fixed pool for real multi-core throughput. */
export class ParsePool {
  private workers: ParseWorker[];
  private cursor = 0;

  constructor(size: number) {
    this.workers = Array.from({ length: size }, () => new ParseWorker());
  }

  parse(html: string, url: string): Promise<string | null> {
    const worker = this.workers[this.cursor % this.workers.length]!;
    this.cursor++;
    return worker.parse(html, url);
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.destroy()));
  }
}
