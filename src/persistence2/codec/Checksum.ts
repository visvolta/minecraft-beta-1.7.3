/**
 * CRC32 (IEEE 802.3, reflected, polynomial 0xEDB88320) used as the integrity
 * marker for stored chunk payloads. Dependency-free and deterministic.
 */

const TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === undefined) break;
    crc = TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
