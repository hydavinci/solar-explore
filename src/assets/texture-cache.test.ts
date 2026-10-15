import { describe, expect, it } from 'vitest';
import { TextureCache } from './texture-cache';

function fixture(budgetBytes = 100) {
  const pending = new Map<string, { resolve: (r: { dispose(): void }) => void; reject: (e: Error) => void }>();
  const disposed: string[] = [];
  const starts: string[] = [];
  const cache = new TextureCache<{ dispose(): void }>({
    budgetBytes, concurrency: 2,
    load: async request => {
      starts.push(request.key);
      return new Promise((resolve, reject) => pending.set(request.key, { resolve, reject }));
    },
  });
  const finish = async (key: string) => {
    pending.get(key)!.resolve({ dispose: () => disposed.push(key) });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  };
  return { cache, pending, disposed, starts, finish };
}
const request = (key: string, estimatedBytes = 30) => ({ key, url: key, estimatedBytes });

describe('texture resource ownership', () => {
  it('deduplicates leases and starts at most two concurrent decodes', async () => {
    const f = fixture();
    const a = f.cache.acquire(request('a')), again = f.cache.acquire(request('a'));
    const b = f.cache.acquire(request('b')), c = f.cache.acquire(request('c'));
    expect(f.starts).toEqual(['a', 'b']);
    await f.finish('a');
    expect(f.starts).toEqual(['a', 'b', 'c']);
    expect(a.getSnapshot().resource).toBe(again.getSnapshot().resource);
    a.release(); again.release(); b.release(); c.release(); f.cache.dispose();
  });
  it('evicts only unreferenced least-recently-used resources before reserving memory', async () => {
    const f = fixture(60);
    const a = f.cache.acquire(request('a')), b = f.cache.acquire(request('b'));
    await f.finish('a'); await f.finish('b');
    a.release();
    const c = f.cache.acquire(request('c'));
    expect(f.disposed).toEqual(['a']);
    expect(f.cache.stats().estimatedBytes).toBe(60);
    expect(b.getSnapshot().status).toBe('ready');
    await f.finish('c');
    b.release(); c.release(); f.cache.dispose();
    expect(f.disposed.sort()).toEqual(['a', 'b', 'c']);
  });
  it('waits rather than exceeding the budget when all decoded assets are leased', async () => {
    const f = fixture(30);
    const a = f.cache.acquire(request('a')), b = f.cache.acquire(request('b'));
    await f.finish('a');
    expect(f.starts).toEqual(['a']);
    expect(b.getSnapshot().status).toBe('queued');
    a.release();
    expect(f.starts).toEqual(['a', 'b']);
    expect(f.cache.stats().estimatedBytes).toBeLessThanOrEqual(30);
    b.release(); f.cache.dispose();
    await f.finish('b');
    expect(f.disposed).toEqual(['a', 'b']);
  });
  it('publishes a visible failure and retries the same live lease', async () => {
    const f = fixture();
    const a = f.cache.acquire(request('earth'));
    f.pending.get('earth')!.reject(new Error('offline'));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(a.getSnapshot().status).toBe('error');
    expect(a.getSnapshot().error?.message).toBe('offline');
    expect(f.cache.stats().estimatedBytes).toBe(0);
    f.cache.retryFailed();
    await f.finish('earth');
    expect(a.getSnapshot().status).toBe('ready');
    a.release(); f.cache.dispose();
  });
  it('cancels queued abandoned work and safely disposes late completions once', async () => {
    const f = fixture();
    const a = f.cache.acquire(request('a')), b = f.cache.acquire(request('b'));
    const c = f.cache.acquire(request('c'));
    c.release(); c.release(); f.cache.dispose(); f.cache.dispose();
    await f.finish('a'); await f.finish('b');
    expect(f.starts).toEqual(['a', 'b']);
    expect(f.disposed.sort()).toEqual(['a', 'b']);
    a.release(); b.release();
  });
  it('rejects requests that can never fit rather than leaving an infinite loading state', () => {
    const f = fixture(20);
    const lease = f.cache.acquire(request('oversize'));
    expect(lease.getSnapshot().status).toBe('error');
    expect(f.starts).toEqual([]);
    lease.release(); f.cache.dispose();
  });
});
