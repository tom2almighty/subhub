// Minimal, zero-dependency QR Code matrix generator (ISO/IEC 18004, Byte mode, EC Level M, Versions 1-14).

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const factor = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] = next[j]! ^ poly[j]!;
      next[j + 1] = next[j + 1]! ^ gfMul(poly[j]!, factor);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Array<number>(data.length + ecCount).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i]!;
  for (let i = 0; i < data.length; i++) {
    const coef = res[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] = res[i + j]! ^ gfMul(gen[j]!, coef);
      }
    }
  }
  return res.slice(data.length);
}

interface VersionSpec {
  version: number;
  totalCodewords: number;
  ecPerBlock: number;
  blocks: [number, number][]; // [count, dataCodewordsPerBlock]
  alignment: number[];
}

// Error correction Level M specs for versions 1..14 (supports up to 528 bytes)
const VERSIONS: VersionSpec[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 10, blocks: [[1, 16]], alignment: [] },
  { version: 2, totalCodewords: 44, ecPerBlock: 16, blocks: [[1, 28]], alignment: [6, 18] },
  { version: 3, totalCodewords: 70, ecPerBlock: 26, blocks: [[1, 44]], alignment: [6, 22] },
  { version: 4, totalCodewords: 100, ecPerBlock: 18, blocks: [[2, 32]], alignment: [6, 26] },
  { version: 5, totalCodewords: 134, ecPerBlock: 24, blocks: [[2, 43]], alignment: [6, 30] },
  { version: 6, totalCodewords: 172, ecPerBlock: 16, blocks: [[4, 27]], alignment: [6, 34] },
  { version: 7, totalCodewords: 196, ecPerBlock: 18, blocks: [[4, 31]], alignment: [6, 22, 38] },
  {
    version: 8,
    totalCodewords: 242,
    ecPerBlock: 22,
    blocks: [
      [2, 38],
      [2, 39],
    ],
    alignment: [6, 24, 42],
  },
  {
    version: 9,
    totalCodewords: 292,
    ecPerBlock: 22,
    blocks: [
      [3, 36],
      [2, 37],
    ],
    alignment: [6, 26, 46],
  },
  {
    version: 10,
    totalCodewords: 346,
    ecPerBlock: 26,
    blocks: [
      [4, 43],
      [1, 44],
    ],
    alignment: [6, 28, 50],
  },
  {
    version: 11,
    totalCodewords: 404,
    ecPerBlock: 30,
    blocks: [
      [1, 50],
      [4, 51],
    ],
    alignment: [6, 30, 54],
  },
  {
    version: 12,
    totalCodewords: 466,
    ecPerBlock: 22,
    blocks: [
      [6, 36],
      [2, 37],
    ],
    alignment: [6, 32, 58],
  },
  {
    version: 13,
    totalCodewords: 532,
    ecPerBlock: 22,
    blocks: [
      [8, 37],
      [1, 38],
    ],
    alignment: [6, 34, 62],
  },
  {
    version: 14,
    totalCodewords: 581,
    ecPerBlock: 24,
    blocks: [
      [4, 40],
      [5, 41],
    ],
    alignment: [6, 26, 46, 66],
  },
];

const VERSION_INFO_BITS: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
  11: 0x0bbf6,
  12: 0x0c762,
  13: 0x0d847,
  14: 0x0e60d,
};

// Format info for EC Level M (00) + mask 0..7, pre-masked with 0x5412
const FORMAT_INFO_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

function encodeData(bytes: Uint8Array, spec: VersionSpec): number[] {
  const totalData = spec.blocks.reduce((sum, [c, d]) => sum + c * d, 0);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  const maxBits = totalData * 8;
  const terminator = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminator; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2]!, 8);
    padIdx++;
  }

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | bits[i + j]!;
    dataCodewords.push(val);
  }

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const [count, len] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const slice = dataCodewords.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, spec.ecPerBlock));
    }
  }

  const result: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]!);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) result.push(block[i]!);
    }
  }
  return result;
}

function createMatrix(size: number) {
  const modules = Array.from({ length: size }, () => new Int8Array(size)); // 0/1
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));
  return { modules, reserved };
}

function placeFinder(
  modules: Int8Array[],
  reserved: Uint8Array[],
  row: number,
  col: number,
  size: number,
) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      reserved[rr]![cc] = 1;
      const inOuter = r === 0 || r === 6 || c === 0 || c === 6;
      const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      const inBounds = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      modules[rr]![cc] = inBounds && (inOuter || inInner) ? 1 : 0;
    }
  }
}

function placeAlignment(modules: Int8Array[], reserved: Uint8Array[], row: number, col: number) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      reserved[row + r]![col + c] = 1;
      const isEdge = Math.abs(r) === 2 || Math.abs(c) === 2;
      const isCenter = r === 0 && c === 0;
      modules[row + r]![col + c] = isEdge || isCenter ? 1 : 0;
    }
  }
}

function writeFormatInfo(modules: Int8Array[], size: number, mask: number) {
  const bits = FORMAT_INFO_M[mask]!;
  for (let i = 0; i < 15; i++) {
    const bit = (bits >> i) & 1;
    if (i < 6) modules[i]![8] = bit;
    else if (i < 8) modules[i + 1]![8] = bit;
    else modules[size - 15 + i]![8] = bit;

    if (i < 8) modules[8]![size - 1 - i] = bit;
    else if (i < 9) modules[8]![15 - i] = bit;
    else modules[8]![14 - i] = bit;
  }
}

function applyMaskPattern(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function penaltyScore(modules: Int8Array[], size: number): number {
  let score = 0;
  // Rule 1: consecutive runs
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r]![c] === modules[r]![c - 1]) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r]![c] === modules[r - 1]![c]) {
        run++;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
      } else run = 1;
    }
  }
  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r]![c];
      if (v === modules[r]![c + 1] && v === modules[r + 1]![c] && v === modules[r + 1]![c + 1]) {
        score += 3;
      }
    }
  }
  return score;
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSIONS.find((v) => {
    const cap = v.blocks.reduce((s, [c, d]) => s + c * d, 0);
    const headerBytes = v.version <= 9 ? 2 : 3;
    return bytes.length + headerBytes <= cap;
  });
  if (!spec) {
    throw new Error('QR code content is too long');
  }

  const size = spec.version * 4 + 17;
  const codewords = encodeData(bytes, spec);
  const { modules, reserved } = createMatrix(size);

  placeFinder(modules, reserved, 0, 0, size);
  placeFinder(modules, reserved, size - 7, 0, size);
  placeFinder(modules, reserved, 0, size - 7, size);

  for (let i = 8; i < size - 8; i++) {
    reserved[6]![i] = 1;
    reserved[i]![6] = 1;
    modules[6]![i] = i % 2 === 0 ? 1 : 0;
    modules[i]![6] = i % 2 === 0 ? 1 : 0;
  }

  for (const r of spec.alignment) {
    for (const c of spec.alignment) {
      if (reserved[r]![c]) continue;
      placeAlignment(modules, reserved, r, c);
    }
  }

  // Reserve format info & dark module
  modules[size - 8]![8] = 1;
  reserved[size - 8]![8] = 1;
  for (let i = 0; i < 9; i++) {
    reserved[8]![i] = 1;
    reserved[i]![8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8]![size - 1 - i] = 1;
    reserved[size - 1 - i]![8] = 1;
  }

  if (spec.version >= 7) {
    const vBits = VERSION_INFO_BITS[spec.version]!;
    for (let i = 0; i < 18; i++) {
      const bit = (vBits >> i) & 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      modules[r]![c] = bit;
      reserved[r]![c] = 1;
      modules[c]![r] = bit;
      reserved[c]![r] = 1;
    }
  }

  // Place data bits
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (reserved[row]![c]) continue;
        let bit = 0;
        if (bitIndex < totalBits) {
          const cw = codewords[bitIndex >> 3]!;
          bit = (cw >> (7 - (bitIndex & 7))) & 1;
          bitIndex++;
        }
        modules[row]![c] = bit;
      }
    }
    up = !up;
  }

  // Evaluate masks 0..7
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = modules.map((row) => new Int8Array(row));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r]![c] && applyMaskPattern(mask, r, c)) {
          candidate[r]![c] = candidate[r]![c]! ^ 1;
        }
      }
    }
    writeFormatInfo(candidate, size, mask);
    const score = penaltyScore(candidate, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r]![c] && applyMaskPattern(bestMask, r, c)) {
        modules[r]![c] = modules[r]![c]! ^ 1;
      }
    }
  }
  writeFormatInfo(modules, size, bestMask);

  return modules.map((row) => Array.from(row, (v) => v === 1));
}
