import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number): string {
  let t = ms;
  let out = "";
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(16);
  let out = "";
  // 80 bit → 16 Crockford chars
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 16) {
      bits -= 5;
      out += CROCKFORD[(acc >> bits) & 31];
    }
  }
  while (out.length < 16) out += CROCKFORD[0];
  return out.slice(0, 16);
}

/** ULID — 26 karakter, sıralı, asla değişmez (K6) */
export function ulid(now = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(s: string): boolean {
  return ULID_RE.test(s);
}
