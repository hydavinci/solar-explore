export interface TextureRequest { key: string; url: string; estimatedBytes: number; label?: string }
export type TextureStatus = 'queued' | 'loading' | 'ready' | 'error';
export interface TextureSnapshot<T> { status: TextureStatus; resource: T | null; error: Error | null }
export interface TextureLease<T> { getSnapshot(): TextureSnapshot<T>; release(): void }
interface Entry<T> {
  request: TextureRequest;
  snapshot: TextureSnapshot<T>;
  refs: number;
  used: number;
  reserved: boolean;
  abort: AbortController;
}

/** Reservations include in-flight decodes and mipmaps, not just completed GPU textures. */
export class TextureCache<T extends { dispose(): void }> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly listeners = new Set<() => void>();
  private active = 0;
  private bytes = 0;
  private sequence = 0;
  private dead = false;
  private pumping = false;
  private readonly budget: number;
  private readonly concurrency: number;
  constructor(private readonly options: {
    load(request: TextureRequest, signal: AbortSignal): Promise<T>;
    budgetBytes?: number;
    concurrency?: number;
  }) {
    this.budget = options.budgetBytes ?? 256 * 1024 * 1024;
    this.concurrency = options.concurrency ?? 2;
    if (!(this.budget > 0) || !(this.concurrency >= 1)) throw new Error('Invalid texture cache limits');
  }
  acquire(request: TextureRequest): TextureLease<T> {
    if (this.dead) throw new Error('Texture cache has been disposed');
    let entry = this.entries.get(request.key);
    if (!entry) {
      const invalid = !Number.isFinite(request.estimatedBytes) || request.estimatedBytes <= 0 || request.estimatedBytes > this.budget;
      entry = { request, refs: 0, used: ++this.sequence, reserved: false, abort: new AbortController(),
        snapshot: { status: invalid ? 'error' : 'queued', resource: null,
          error: invalid ? new Error(`纹理超过缓存预算：${request.label ?? request.key}`) : null } };
      this.entries.set(request.key, entry);
    }
    entry.refs++;
    entry.used = ++this.sequence;
    const leased = entry;
    this.pump();
    let released = false;
    return {
      getSnapshot: () => leased.snapshot,
      release: () => {
        if (released) return;
        released = true; leased.refs--; leased.used = ++this.sequence;
        if (!leased.refs && ['queued', 'error'].includes(leased.snapshot.status)) this.entries.delete(request.key);
        this.pump();
      },
    };
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private publish() { if (!this.dead) this.listeners.forEach(listener => listener()); }
  stats() {
    const values = [...this.entries.values()];
    return { estimatedBytes: this.bytes, ready: values.filter(e => e.snapshot.status === 'ready').length,
      loading: this.active, queued: values.filter(e => e.snapshot.status === 'queued').length,
      errors: values.filter(e => e.refs > 0 && e.snapshot.status === 'error')
        .map(e => ({ request: e.request, error: e.snapshot.error! })) };
  }
  retryFailed() {
    for (const entry of this.entries.values()) {
      if (entry.snapshot.status === 'error' && entry.refs && entry.request.estimatedBytes <= this.budget) {
        entry.snapshot = { status: 'queued', resource: null, error: null };
      }
    }
    this.pump();
  }
  forEachReady(visit: (resource: T) => void) {
    for (const entry of this.entries.values()) if (entry.snapshot.resource) visit(entry.snapshot.resource);
  }
  private makeRoom(bytes: number) {
    const candidates = [...this.entries.values()].filter(e => !e.refs && e.snapshot.status === 'ready').sort((a, b) => a.used - b.used);
    while (this.bytes + bytes > this.budget && candidates.length) {
      const oldest = candidates.shift()!;
      oldest.snapshot.resource!.dispose();
      this.bytes -= oldest.request.estimatedBytes;
      this.entries.delete(oldest.request.key);
    }
    return this.bytes + bytes <= this.budget;
  }
  private pump() {
    if (this.dead || this.pumping) return;
    this.pumping = true;
    for (const entry of this.entries.values()) {
      if (this.active >= this.concurrency) break;
      if (!entry.refs || entry.snapshot.status !== 'queued' || !this.makeRoom(entry.request.estimatedBytes)) continue;
      this.active++; this.bytes += entry.request.estimatedBytes; entry.reserved = true;
      entry.snapshot = { status: 'loading', resource: null, error: null };
      let loading: Promise<T>;
      try { loading = this.options.load(entry.request, entry.abort.signal); }
      catch (error) { loading = Promise.reject(error); }
      void loading.then(resource => {
        if (this.dead) { resource.dispose(); return; }
        entry.snapshot = { status: 'ready', resource, error: null };
      }, error => {
        if (!this.dead) {
          entry.snapshot = { status: 'error', resource: null, error: error instanceof Error ? error : new Error(String(error)) };
          if (entry.reserved) { this.bytes -= entry.request.estimatedBytes; entry.reserved = false; }
          if (!entry.refs) this.entries.delete(entry.request.key);
        }
      }).finally(() => {
        this.active--;
        this.pump();
        this.publish();
      });
    }
    this.pumping = false;
    this.publish();
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const entry of this.entries.values()) {
      entry.abort.abort();
      entry.snapshot.resource?.dispose();
    }
    this.entries.clear(); this.listeners.clear(); this.bytes = 0;
  }
}
