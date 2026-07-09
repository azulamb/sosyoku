/** 無圧縮(STORED)ZIPの自前実装。読み込みは @azulamb/zipper を使うが、書き込みはここで組み立てる。 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array<ArrayBuffer>): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  private chunks: Uint8Array<ArrayBuffer>[] = [];
  private length = 0;

  writeBytes(bytes: Uint8Array<ArrayBuffer>) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  writeUint16(value: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, value, true);
    this.writeBytes(b);
  }

  writeUint32(value: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, value, true);
    this.writeBytes(b);
  }

  get size(): number {
    return this.length;
  }

  toUint8Array(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

export interface ZipEntryInput {
  path: string;
  data: Uint8Array<ArrayBuffer>;
}

export function createZip(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const localWriter = new ByteWriter();
  const centralWriter = new ByteWriter();
  const { time, date } = dosDateTime(new Date());

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const offset = localWriter.size;

    localWriter.writeUint32(0x04034b50);
    localWriter.writeUint16(20);
    localWriter.writeUint16(0x0800);
    localWriter.writeUint16(0);
    localWriter.writeUint16(time);
    localWriter.writeUint16(date);
    localWriter.writeUint32(crc);
    localWriter.writeUint32(entry.data.length);
    localWriter.writeUint32(entry.data.length);
    localWriter.writeUint16(nameBytes.length);
    localWriter.writeUint16(0);
    localWriter.writeBytes(nameBytes);
    localWriter.writeBytes(entry.data);

    centralWriter.writeUint32(0x02014b50);
    centralWriter.writeUint16(20);
    centralWriter.writeUint16(20);
    centralWriter.writeUint16(0x0800);
    centralWriter.writeUint16(0);
    centralWriter.writeUint16(time);
    centralWriter.writeUint16(date);
    centralWriter.writeUint32(crc);
    centralWriter.writeUint32(entry.data.length);
    centralWriter.writeUint32(entry.data.length);
    centralWriter.writeUint16(nameBytes.length);
    centralWriter.writeUint16(0);
    centralWriter.writeUint16(0);
    centralWriter.writeUint16(0);
    centralWriter.writeUint16(0);
    centralWriter.writeUint32(0);
    centralWriter.writeUint32(offset);
    centralWriter.writeBytes(nameBytes);
  }

  const centralOffset = localWriter.size;
  const centralSize = centralWriter.size;

  const eocdWriter = new ByteWriter();
  eocdWriter.writeUint32(0x06054b50);
  eocdWriter.writeUint16(0);
  eocdWriter.writeUint16(0);
  eocdWriter.writeUint16(entries.length);
  eocdWriter.writeUint16(entries.length);
  eocdWriter.writeUint32(centralSize);
  eocdWriter.writeUint32(centralOffset);
  eocdWriter.writeUint16(0);

  return new Blob(
    [localWriter.toUint8Array(), centralWriter.toUint8Array(), eocdWriter.toUint8Array()],
    { type: 'application/zip' },
  );
}
