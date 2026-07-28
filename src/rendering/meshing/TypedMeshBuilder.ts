/**
 * Growable typed mesh builders for culled-face meshing.
 * Avoids number[] → typed array copies on the hot path.
 */

export class FloatBuilder {
  private data: Float32Array;
  private length = 0;

  public constructor(initialCapacity = 256) {
    this.data = new Float32Array(Math.max(8, initialCapacity));
  }

  public get count(): number {
    return this.length;
  }

  public clear(): void {
    this.length = 0;
  }

  public push(value: number): void {
    this.ensure(1);
    this.data[this.length++] = value;
  }

  public push2(a: number, b: number): void {
    this.ensure(2);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
  }

  public push3(a: number, b: number, c: number): void {
    this.ensure(3);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }

  /** Returns a tightly sized copy suitable for transfer (does not retain builder ownership of the buffer). */
  public toArrayBuffer(): ArrayBuffer {
    const out = new Float32Array(this.length);
    out.set(this.data.subarray(0, this.length));
    return out.buffer;
  }

  /** Zero-copy view of filled region — only valid until next mutate/clear. */
  public view(): Float32Array {
    return this.data.subarray(0, this.length);
  }

  private ensure(extra: number): void {
    const need = this.length + extra;
    if (need <= this.data.length) return;
    let cap = this.data.length;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

export class IndexBuilder {
  private data: Uint32Array;
  private length = 0;

  public constructor(initialCapacity = 256) {
    this.data = new Uint32Array(Math.max(8, initialCapacity));
  }

  public get count(): number {
    return this.length;
  }

  public clear(): void {
    this.length = 0;
  }

  public push6(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ensure(6);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
    this.data[this.length++] = d;
    this.data[this.length++] = e;
    this.data[this.length++] = f;
  }

  public toArrayBuffer(preferUint16: boolean): { buffer: ArrayBuffer; indexType: 'uint16' | 'uint32' } {
    if (preferUint16 && this.length > 0) {
      let max = 0;
      for (let i = 0; i < this.length; i++) max = Math.max(max, this.data[i]!);
      if (max <= 65535) {
        const out = new Uint16Array(this.length);
        for (let i = 0; i < this.length; i++) out[i] = this.data[i]!;
        return { buffer: out.buffer, indexType: 'uint16' };
      }
    }
    const out = new Uint32Array(this.length);
    out.set(this.data.subarray(0, this.length));
    return { buffer: out.buffer, indexType: 'uint32' };
  }

  private ensure(extra: number): void {
    const need = this.length + extra;
    if (need <= this.data.length) return;
    let cap = this.data.length;
    while (cap < need) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
}

/** Leaf face cull statistics for one mesh build. */
export interface LeafCullStats {
  tested: number;
  culledOpaque: number;
  culledLeaves: number;
  emitted: number;
}

export function emptyLeafCullStats(): LeafCullStats {
  return { tested: 0, culledOpaque: 0, culledLeaves: 0, emitted: 0 };
}

export function accumulateLeafCullStats(target: LeafCullStats, add: LeafCullStats): void {
  target.tested += add.tested;
  target.culledOpaque += add.culledOpaque;
  target.culledLeaves += add.culledLeaves;
  target.emitted += add.emitted;
}
