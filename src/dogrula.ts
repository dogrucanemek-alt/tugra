import {
  KAPSAMLAR,
  KAYNAK_TURLERI,
  TURLER,
  type Kaynak,
  type Olgu,
  type OlguMeta,
  type Tur,
  parseRafOmru,
} from "./sema.js";
import { isUlid } from "./ulid.js";

/** Döngüsel işaret — kendi çıktısını kanıt saymak. mcp:// = hafıza:// */
function donguselIsaret(isaret: string): boolean {
  return (
    isaret.startsWith("hafıza://") ||
    isaret.startsWith("hafiza://") ||
    isaret.startsWith("mcp://")
  );
}

/** Gate #2: K1'i karşılayan kaynak var mı? */
export function k1KanitYeterli(tur: Tur, kaynak: Kaynak[]): boolean {
  if (tur === "gozlem") return true;
  if (tur === "kural") {
    // non-miras herhangi biri, veya hafıza:// / mcp:// (yalnız kuralda sayılır)
    return kaynak.some((k) => !k.miras || donguselIsaret(k.isaret));
  }
  // olgu | karar | sinir — kendi kanıt; hafıza:// ve mcp:// sayılmaz
  return kaynak.some((k) => !k.miras && !donguselIsaret(k.isaret));
}

export interface DogrulaHata {
  alan: string;
  mesaj: string;
}

export interface DogrulaSonuc {
  ok: boolean;
  hatalar: DogrulaHata[];
  /** K1: kaynak boşken olgu→gozlem düşürme önerisi */
  dusurulmusTur?: Tur;
}

function kayitKaynak(k: unknown, i: number, hatalar: DogrulaHata[]): void {
  if (!k || typeof k !== "object") {
    hatalar.push({ alan: `kaynak[${i}]`, mesaj: "must be an object" });
    return;
  }
  const r = k as Kaynak;
  if (!KAYNAK_TURLERI.includes(r.tur as (typeof KAYNAK_TURLERI)[number])) {
    hatalar.push({ alan: `kaynak[${i}].tur`, mesaj: `invalid: ${r.tur}` });
  }
  if (!r.isaret || typeof r.isaret !== "string") {
    hatalar.push({ alan: `kaynak[${i}].isaret`, mesaj: "required" });
  }
  if (!r.alindi || !/^\d{4}-\d{2}-\d{2}/.test(r.alindi)) {
    hatalar.push({
      alan: `kaynak[${i}].alindi`,
      mesaj: "YYYY-MM-DD expected",
    });
  }
}

/**
 * K1: kanıtsız olgu olgu değildir.
 * K3: frontmatter'da `durum` YASAK.
 * K9: curuten / yerine ayrı alanlar (ikisi birden olabilir ama anlamları ayrı).
 */
export function dogrulaMeta(
  meta: Partial<OlguMeta> & Record<string, unknown>,
  opts: { izinVerGozlemBosKaynak?: boolean } = {},
): DogrulaSonuc {
  const hatalar: DogrulaHata[] = [];
  let dusurulmusTur: Tur | undefined;

  if ("durum" in meta && meta.durum !== undefined) {
    hatalar.push({
      alan: "durum",
      mesaj: "K3: durum is derived, do not write it",
    });
  }

  if (!meta.uid || typeof meta.uid !== "string" || !isUlid(meta.uid)) {
    hatalar.push({ alan: "uid", mesaj: "valid ULID required" });
  }

  if (!meta.tur || !TURLER.includes(meta.tur as Tur)) {
    hatalar.push({ alan: "tur", mesaj: `invalid: ${meta.tur}` });
  }

  if (!meta.kapsam || !KAPSAMLAR.includes(meta.kapsam as (typeof KAPSAMLAR)[number])) {
    hatalar.push({ alan: "kapsam", mesaj: `invalid: ${meta.kapsam}` });
  }

  if (meta.kapsam === "dunya") {
    if (!meta.dunya || typeof meta.dunya !== "string") {
      hatalar.push({ alan: "dunya", mesaj: "required when kapsam=dunya" });
    }
  } else if (meta.dunya != null) {
    hatalar.push({
      alan: "dunya",
      mesaj: "must be null when kapsam is not dunya",
    });
  }

  for (const alan of ["konu", "baslik", "sahip", "yazan"] as const) {
    if (!meta[alan] || typeof meta[alan] !== "string") {
      hatalar.push({ alan, mesaj: "required string" });
    }
  }

  if (typeof meta.guven !== "number" || meta.guven < 0 || meta.guven > 1) {
    hatalar.push({ alan: "guven", mesaj: "number in 0-1" });
  }

  if (!meta.raf_omru || typeof meta.raf_omru !== "string") {
    hatalar.push({ alan: "raf_omru", mesaj: "required" });
  } else {
    try {
      parseRafOmru(meta.raf_omru);
    } catch (e) {
      hatalar.push({
        alan: "raf_omru",
        mesaj: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!meta.tarih || typeof meta.tarih !== "string") {
    hatalar.push({ alan: "tarih", mesaj: "ISO 8601 required" });
  }
  // Gate #2: null bilinmiyor=bayat — geçerli; aksi YYYY-MM-DD
  if (
    meta.dogrulandi != null &&
    !/^\d{4}-\d{2}-\d{2}/.test(String(meta.dogrulandi))
  ) {
    hatalar.push({ alan: "dogrulandi", mesaj: "YYYY-MM-DD or null" });
  }

  const kaynak = Array.isArray(meta.kaynak) ? meta.kaynak : null;
  if (!kaynak) {
    hatalar.push({ alan: "kaynak", mesaj: "array required" });
  } else {
    kaynak.forEach((k, i) => kayitKaynak(k, i, hatalar));
    // K1 — Gate #2: kendi kanıt; hafıza:// yalnız kural
    if (
      meta.tur &&
      meta.tur !== "gozlem" &&
      !k1KanitYeterli(meta.tur as Tur, kaynak)
    ) {
      hatalar.push({
        alan: "kaynak",
        mesaj:
          "K1: olgu/karar/sinir require own (non-miras, non-hafiza://) evidence; kural allows non-miras or hafiza://",
      });
      dusurulmusTur = "gozlem";
    }
  }

  if (meta.yerine != null && meta.yerine !== null) {
    if (typeof meta.yerine !== "string" || !isUlid(meta.yerine)) {
      hatalar.push({ alan: "yerine", mesaj: "ULID or null" });
    }
  }
  if (meta.curuten != null && meta.curuten !== null) {
    if (typeof meta.curuten !== "string" || !isUlid(meta.curuten)) {
      hatalar.push({ alan: "curuten", mesaj: "ULID or null" });
    }
  }

  // K9: yerine = eskime, curuten = çürütülme — aynı anlam yüklenemez
  if (
    meta.yerine &&
    meta.curuten &&
    meta.yerine === meta.curuten
  ) {
    hatalar.push({
      alan: "yerine/curuten",
      mesaj: "K9: same uid cannot be both yerine and curuten",
    });
  }

  if (!Array.isArray(meta.baglar)) {
    hatalar.push({ alan: "baglar", mesaj: "array required" });
  }
  if (!Array.isArray(meta.etki)) {
    hatalar.push({ alan: "etki", mesaj: "array required" });
  }

  return { ok: hatalar.length === 0, hatalar, dusurulmusTur };
}

/**
 * Okuma-yolu şema uyarısı. K1/K3/K9 politika değil — yalnız şekil:
 * zorunlu alan, enum, guven 0–1, tarih biçimi. Fail-open: olgu yüklenir.
 */
export function semaUyarilari(
  meta: Record<string, unknown>,
  yol?: string,
): { yol?: string; alan: string; mesaj: string }[] {
  const out: { yol?: string; alan: string; mesaj: string }[] = [];
  const uy = (alan: string, mesaj: string) => out.push({ yol, alan, mesaj });

  for (const alan of [
    "uid",
    "tur",
    "kapsam",
    "konu",
    "baslik",
    "sahip",
    "yazan",
    "tarih",
  ] as const) {
    if (meta[alan] == null || meta[alan] === "") uy(alan, "required");
  }

  if (meta.tur != null && !TURLER.includes(meta.tur as Tur)) {
    uy("tur", `invalid: ${meta.tur}`);
  }
  if (
    meta.kapsam != null &&
    !KAPSAMLAR.includes(meta.kapsam as (typeof KAPSAMLAR)[number])
  ) {
    uy("kapsam", `invalid: ${meta.kapsam}`);
  }
  if (typeof meta.guven !== "number" || meta.guven < 0 || meta.guven > 1) {
    uy("guven", `out of 0-1: ${String(meta.guven)}`);
  }
  if (meta.tarih != null && !/^\d{4}-\d{2}-\d{2}/.test(String(meta.tarih))) {
    uy("tarih", "ISO/YYYY-MM-DD expected");
  }
  if (
    meta.dogrulandi != null &&
    !/^\d{4}-\d{2}-\d{2}/.test(String(meta.dogrulandi))
  ) {
    uy("dogrulandi", "YYYY-MM-DD or null");
  }
  if (!Array.isArray(meta.kaynak)) {
    uy("kaynak", "array required");
  } else {
    meta.kaynak.forEach((k, i) => {
      if (!k || typeof k !== "object") {
        uy(`kaynak[${i}]`, "must be an object");
        return;
      }
      const r = k as { tur?: string; alindi?: string };
      if (
        r.tur != null &&
        !KAYNAK_TURLERI.includes(r.tur as (typeof KAYNAK_TURLERI)[number])
      ) {
        uy(`kaynak[${i}].tur`, `invalid: ${r.tur}`);
      }
      if (r.alindi != null && !/^\d{4}-\d{2}-\d{2}/.test(r.alindi)) {
        uy(`kaynak[${i}].alindi`, "YYYY-MM-DD expected");
      }
    });
  }
  return out;
}

export function dogrulaOlgu(olgu: Olgu): DogrulaSonuc {
  const r = dogrulaMeta(olgu.meta as OlguMeta & Record<string, unknown>);
  if (!olgu.govde || !olgu.govde.trim()) {
    r.hatalar.push({ alan: "govde", mesaj: "must not be empty" });
    r.ok = false;
  }
  return r;
}

/** K1 yardımcı: yetersiz/miras-only/hafıza-döngü → gozlem (göç için) */
export function k1Dusur(meta: OlguMeta): OlguMeta {
  if (meta.tur === "gozlem") return meta;
  if (!k1KanitYeterli(meta.tur, meta.kaynak ?? [])) {
    return { ...meta, tur: "gozlem", raf_omru: "14g" };
  }
  return meta;
}
