import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** kasa-motoru/ (dist veya src üstü) */
export function motorKok(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * English TUGRA_* first, then Turkish TUGRA_*, then TALAMUS_* / MULTI_.
 * Old names are not removed — cockpit and cron must keep working.
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
    ["TUGRA_HOME", "TUGRA_KOKPIT"],
    ["TUGRA_HOME", "TALAMUS_KOKPIT"],
    ["TUGRA_VAULT", "TUGRA_KASA"],
    ["TUGRA_VAULT", "TALAMUS_KASA"],
    ["TUGRA_EVENTS", "TUGRA_AKIS"],
    ["TUGRA_EVENTS", "TALAMUS_AKIS"],
    ["TUGRA_RECORDS", "TUGRA_KAYIT"],
    ["TUGRA_RECORDS", "TALAMUS_KAYIT"],
    ["TUGRA_AUTH", "TUGRA_YETKI"],
    ["TUGRA_AUTH", "TALAMUS_YETKI"],
    ["TUGRA_AUTH", "MULTI_YETKI"],
    ["TUGRA_TRANSCRIPTS", "TUGRA_TRANSKRIPT"],
    ["TUGRA_TRANSCRIPTS", "MULTI_TRANSKRIPT"],
  ];
  const out: string[] = [];
  for (const [yeni, eski] of ciftler) {
    if (!process.env[yeni] && process.env[eski]) {
      out.push(`${eski} is deprecated, use ${yeni}`);
    }
  }
  return out;
}

/** TUGRA_HOME → TUGRA_KOKPIT → TALAMUS_KOKPIT → parent of the motor */
export function kokpitKok(): string {
  const v = ortamIlk("TUGRA_HOME", "TUGRA_KOKPIT", "TALAMUS_KOKPIT");
  if (v) return resolve(v);
  return resolve(motorKok(), "..");
}

/** TUGRA_VAULT → TUGRA_KASA → TALAMUS_KASA → cockpit/kasa */
export function varsayilanKasa(): string {
  const v = ortamIlk("TUGRA_VAULT", "TUGRA_KASA", "TALAMUS_KASA");
  if (v) return resolve(v);
  return resolve(kokpitKok(), "kasa");
}

export function varsayilanAkis(): string {
  const v = ortamIlk("TUGRA_EVENTS", "TUGRA_AKIS", "TALAMUS_AKIS");
  if (v) return resolve(v);
  return resolve(kokpitKok(), "akis");
}

export function varsayilanKayit(): string {
  const v = ortamIlk("TUGRA_RECORDS", "TUGRA_KAYIT", "TALAMUS_KAYIT");
  if (v) return resolve(v);
  return resolve(kokpitKok(), "kayit");
}
