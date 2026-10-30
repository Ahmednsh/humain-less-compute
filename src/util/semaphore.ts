/** FIFO semaphore: `limit(fn)` runs fn once fewer than `n` tasks are active. */
export function semaphore(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => { active--; queue.shift()?.(); };
  return async fn => {
    if (active >= n) await new Promise<void>(resolve => queue.push(resolve));
    active++;
    try { return await fn(); } finally { release(); }
  };
}
