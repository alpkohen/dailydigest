/** Runs `worker` over `items` with at most `concurrency` in flight at once. */
export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
}
