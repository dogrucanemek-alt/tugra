import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** kasa-motoru/ (dist veya src üstü) */
export function motorKok(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * TUGRA_* birincil, TALAMUS_* / MULTI_* geri düşüş.
 * Eski adlar silinmez — kokpit ve cron kırılmasın.
 */
export function ortamIlk(...adlar: string[]): string | undefined {
  for (const a of adlar) {
    const v = process.env[a];
    if (v) return v;
  }
  return undefined;
}

/** Yalnız eski ad kuruluysa — doctor yüksek sesle söyler. */
export function eskiOrtamUyarilari(): string[] {
  const ciftler: [string, string][] = [
    ["TUGRA_KOKPIT", "TALAMUS_KOKPIT"],
    ["TUGRA_KASA", "TALAMUS_KASA"],
    ["TUGRA_AKIS", "TALAMUS_AKIS"],
    ["TUGRA_KAYIT", "TALAMUS_KAYIT"],
    ["TUGRA_YETKI", "TALAMUS_YETKI"],
    ["TUGRA_YETKI", "MULTI_YETKI"],
    ["TUGRA_TRANSKRIPT", "MULTI_TRANSKRIPT"],
  ];
  const out: string[] = [];
  for (const [yeni, eski] of ciftler) {
    if (!process.env[yeni] && process.env[eski]) {
      out.push(`${eski} is deprecated, use ${yeni}`);
    }
  }
  return out;
}

/** TUGRA_KOKPIT → TALAMUS_KOKPIT → motorun bir üstü */
export function kokpitKok(): string {
  const v = ortamIlk("TUGRA_KOKPIT", "TALAMUS_KOKPIT");
  if (v) return resolve(v);
  return resolve(motorKok(), "..");
}

/** TUGRA_KASA → TALAMUS_KASA → Kokpit/kasa */
export function varsayilanKasa(): string {
  const v = ortamIlk("TUGRA_KASA", "TALAMUS_KASA");
  if (v) return resolve(v);
  return resolve(kokpitKok(), "kasa");
}

export function varsayilanAkis(): string {
  const v = ortamIlk("TUGRA_AKIS", "TALAMUS_AKIS");
  if (v) return resolve(v);
  return resolve(kokpitKok(), "akis");
}

export function varsayilanKayit(): string {
  const v = ortamIlk("TUGRA_KAYIT", "TALAMUS_KAYIT");
  if (v) return resolve(v);
  return resolve(kokpitKok(), "kayit");
}
