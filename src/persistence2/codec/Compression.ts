/**
 * Deadlock-safe deflate compression/decompression built on the web Streams API.
 *
 * The old `RegionFileCodec` wrote all input, closed the writable side, and only
 * then read the readable side. For a transform whose output is larger than its
 * input (decompression) that pattern deadlocks on backpressure once the output
 * exceeds the stream's internal buffer (~16-40 KB; a full chunk is ~64 KB).
 *
 * Here the readable side is drained *concurrently* with the write, so
 * backpressure is always relieved and neither direction can stall. This is
 * verified by tests against full-size (>= 64 KB) payloads in both directions.
 */

async function runTransform(
  stream: CompressionStream | DecompressionStream,
  input: Uint8Array,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  // Copy into an ArrayBuffer-backed array so the write satisfies BufferSource
  // (the input may be ArrayBufferLike-backed). Drive the write to completion
  // concurrently with draining the output. The promise is awaited only after
  // the read loop finishes, so a write-side error still surfaces while the
  // readable side is being drained (no deadlock).
  const source = new Uint8Array(input);
  const writeDone = writer.write(source).then(() => writer.close());

  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      parts.push(value);
      total += value.byteLength;
    }
  }
  await writeDone;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** Compress bytes with RFC1950 deflate (zlib-wrapped). Never deadlocks on size. */
export function compressDeflate(input: Uint8Array): Promise<Uint8Array> {
  return runTransform(new CompressionStream('deflate'), input);
}

/** Decompress RFC1950 deflate (zlib-wrapped). Never deadlocks on size. */
export function decompressDeflate(input: Uint8Array): Promise<Uint8Array> {
  return runTransform(new DecompressionStream('deflate'), input);
}
