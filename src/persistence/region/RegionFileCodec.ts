import { RegionCorruptionError } from './RegionCorruptionError.ts';

const SECTOR_SIZE = 4096;

export class RegionFileCodec {
  private buffer: Uint8Array;
  private readonly offsets = new Int32Array(1024);
  private readonly timestamps = new Int32Array(1024);
  private readonly freeSectors: boolean[] = [];

  public constructor(data?: Uint8Array) {
    if (data && data.length > 0) {
      if (data.length < SECTOR_SIZE * 2) {
        throw new RegionCorruptionError('Region file too small to contain headers.', data);
      }
      this.buffer = new Uint8Array(data);
      this.parseHeaders();
    } else {
      this.buffer = new Uint8Array(SECTOR_SIZE * 2);
      this.freeSectors.push(false, false); // Header sectors
    }
  }

  private parseHeaders(): void {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);

    const totalSectors = Math.ceil(this.buffer.length / SECTOR_SIZE);
    for (let i = 0; i < totalSectors; i++) {
      this.freeSectors.push(true);
    }
    this.freeSectors[0] = false;
    this.freeSectors[1] = false;

    for (let i = 0; i < 1024; i++) {
      const offsetData = view.getInt32(i * 4, false);
      this.offsets[i] = offsetData;

      if (offsetData !== 0) {
        const sectorOffset = (offsetData >> 8) & 0xFFFFFF;
        const sectorCount = offsetData & 0xFF;

        if (sectorOffset + sectorCount <= this.freeSectors.length) {
          for (let s = 0; s < sectorCount; s++) {
            this.freeSectors[sectorOffset + s] = false;
          }
        }
      }

      this.timestamps[i] = view.getInt32(SECTOR_SIZE + i * 4, false);
    }
  }

  public getRawBuffer(): Uint8Array {
    return this.buffer;
  }

  private getTableIndex(x: number, z: number): number {
    return (x & 31) + (z & 31) * 32;
  }

  public async getChunkData(x: number, z: number): Promise<Uint8Array | undefined> {
    const index = this.getTableIndex(x, z);
    const offsetData = this.offsets[index]!;
    if (offsetData === 0) return undefined;

    const sectorOffset = (offsetData >> 8) & 0xFFFFFF;
    const sectorCount = offsetData & 0xFF;

    if (sectorOffset + sectorCount > Math.ceil(this.buffer.length / SECTOR_SIZE)) {
      throw new RegionCorruptionError(`Sector out of bounds for chunk ${x},${z}`, this.buffer.slice(), sectorOffset, sectorCount);
    }

    const start = sectorOffset * SECTOR_SIZE;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    const length = view.getInt32(start, false);

    if (length > sectorCount * SECTOR_SIZE) {
      throw new RegionCorruptionError(`Invalid chunk length: ${length} > ${sectorCount * SECTOR_SIZE}`, this.buffer.slice(start, start + sectorCount * SECTOR_SIZE), sectorOffset, sectorCount);
    }

    const version = view.getUint8(start + 4);
    if (version !== 2) {
      throw new RegionCorruptionError(`Unknown compression version: ${version}`, this.buffer.slice(start, start + sectorCount * SECTOR_SIZE), sectorOffset, sectorCount);
    }

    const compressed = this.buffer.slice(start + 5, start + 4 + length);

    try {
      const stream = new DecompressionStream('deflate');
      const writer = stream.writable.getWriter();
      writer.write(compressed as any).catch(() => {});
      writer.close().catch(() => {});
      const reader = stream.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      let total = 0;
      for (const c of chunks) total += c.length;
      const result = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
      }
      return result;
    } catch (err) {
      throw new RegionCorruptionError('Failed to decompress chunk data', compressed, sectorOffset, sectorCount);
    }
  }

  public async setChunkData(x: number, z: number, data: Uint8Array, timestamp: number): Promise<void> {
    const stream = new CompressionStream('deflate');
    const writer = stream.writable.getWriter();
    writer.write(data as any).catch(() => {});
    writer.close().catch(() => {});
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    let compressedLength = 0;
    for (const c of chunks) compressedLength += c.length;

    const requiredBytes = compressedLength + 5;
    const requiredSectors = Math.ceil(requiredBytes / SECTOR_SIZE);

    const index = this.getTableIndex(x, z);
    const offsetData = this.offsets[index] ?? 0;
    let sectorOffset = (offsetData >> 8) & 0xFFFFFF;
    const currentSectorCount = offsetData & 0xFF;

    if (sectorOffset !== 0 && currentSectorCount >= requiredSectors) {
      this.writeSectorData(sectorOffset, compressedLength, chunks, currentSectorCount);
      this.updateTimestamp(index, timestamp);
    } else {
      if (sectorOffset !== 0) {
        for (let i = 0; i < currentSectorCount; i++) {
          this.freeSectors[sectorOffset + i] = true;
        }
      }

      let foundOffset = -1;
      let count = 0;
      for (let i = 2; i < this.freeSectors.length; i++) {
        if (this.freeSectors[i]) {
          if (count === 0) foundOffset = i;
          count++;
          if (count >= requiredSectors) break;
        } else {
          count = 0;
        }
      }

      if (count >= requiredSectors) {
        sectorOffset = foundOffset;
      } else {
        sectorOffset = this.freeSectors.length;
        this.growFile(requiredSectors);
      }

      for (let i = 0; i < requiredSectors; i++) {
        this.freeSectors[sectorOffset + i] = false;
      }

      this.writeSectorData(sectorOffset, compressedLength, chunks, requiredSectors);
      this.updateOffset(index, sectorOffset, requiredSectors);
      this.updateTimestamp(index, timestamp);
    }
  }

  private writeSectorData(sectorOffset: number, compressedLength: number, chunks: Uint8Array[], allocatedSectors: number): void {
    const start = sectorOffset * SECTOR_SIZE;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    view.setInt32(start, compressedLength + 1, false);
    view.setUint8(start + 4, 2);
    let currentOffset = start + 5;
    for (const c of chunks) {
      this.buffer.set(c, currentOffset);
      currentOffset += c.length;
    }
    const endOfData = start + 5 + compressedLength;
    const endOfSectorSpan = start + allocatedSectors * SECTOR_SIZE;
    this.buffer.fill(0, endOfData, endOfSectorSpan);
  }

  private updateOffset(index: number, sectorOffset: number, sectorCount: number): void {
    const offsetData = (sectorOffset << 8) | (sectorCount & 0xFF);
    this.offsets[index] = offsetData;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    view.setInt32(index * 4, offsetData, false);
  }

  private updateTimestamp(index: number, timestamp: number): void {
    this.timestamps[index] = timestamp;
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    view.setInt32(SECTOR_SIZE + index * 4, timestamp, false);
  }

  private growFile(sectors: number): void {
    const newBuffer = new Uint8Array(this.buffer.length + sectors * SECTOR_SIZE);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    for (let i = 0; i < sectors; i++) {
      this.freeSectors.push(true);
    }
  }
}
