import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Kapsam } from "./sema.js";
import { varsayilanKasa } from "./yollar.js";

/**
 * Konu haritası KODDA DEĞİL — kullanıcının kasasında.
 * Paket varsayılanı boş: uydurma yok, bilinmiyorsa geri düşüş.
 * Patronun 69 kuralı `kasa/_konu-haritasi.json`.
 */
export const KONU_HARITA_DOSYA = "_konu-haritasi.json";
export const DESEN_TAVAN = 200;

export interface KonuKuralHam {
  desen: string;
  bayrak?: string;
  konu: string;
  ornek?: string;
}

export interface KonuHaritaHam {
  harita?: KonuKuralHam[];
  alt_kirilim?: KonuKuralHam[];
  stem?: KonuKuralHam[];
  dunya?: KonuKuralHam[];
}

export type KonuHaritaDerli = {
  harita: ReadonlyArray<readonly [RegExp, string]>;
  alt_kirilim: ReadonlyArray<readonly [RegExp, string]>;
  stem: ReadonlyArray<readonly [RegExp, string]>;
  dunya: ReadonlyArray<readonly [RegExp, string]>;
};

const BOS: KonuHaritaDerli = { harita: [], alt_kirilim: [], stem: [], dunya: [] };
let aktif: KonuHaritaDerli = BOS;

function derle(
  kurallar: KonuKuralHam[],
  uyarilar: string[],
  kume: string,
): Array<readonly [RegExp, string]> {
  const out: Array<readonly [RegExp, string]> = [];
  for (const k of kurallar) {
    if (typeof k.desen !== "string" || typeof k.konu !== "string") {
      const m = `konu-haritasi: ${kume}: eksik desen/konu, atlandi`;
      console.error(m);
      uyarilar.push(m);
      continue;
    }
    if (k.desen.length > DESEN_TAVAN) {
      const m = `konu-haritasi: ${kume}: desen cok uzun (${k.desen.length}>${DESEN_TAVAN}), atlandi`;
      console.error(m);
      uyarilar.push(m);
      continue;
    }
    try {
      out.push([new RegExp(k.desen, k.bayrak ?? ""), k.konu]);
    } catch {
      const m = `konu-haritasi: ${kume}: bozuk desen, atlandi`;
      console.error(m);
      uyarilar.push(m);
    }
  }
  return out;
}

export function konuHaritasiSifirla(): void {
  aktif = BOS;
}

export function konuHaritasiKur(ham: KonuHaritaHam): string[] {
  const uyarilar: string[] = [];
  aktif = {
    harita: derle(ham.harita ?? [], uyarilar, "harita"),
    alt_kirilim: derle(ham.alt_kirilim ?? [], uyarilar, "alt_kirilim"),
    stem: derle(ham.stem ?? [], uyarilar, "stem"),
    dunya: derle(ham.dunya ?? [], uyarilar, "dunya"),
  };
  return uyarilar;
}

export function konuHaritasiYukle(kasaKok?: string): string[] {
  const yol = join(kasaKok ?? varsayilanKasa(), KONU_HARITA_DOSYA);
  if (!existsSync(yol)) {
    konuHaritasiSifirla();
    return [];
  }
  try {
    const ham = JSON.parse(readFileSync(yol, "utf8")) as KonuHaritaHam;
    return konuHaritasiKur(ham);
  } catch {
    const m = `konu-haritasi: dosya okunamadi, bos harita (${KONU_HARITA_DOSYA})`;
    console.error(m);
    konuHaritasiSifirla();
    return [m];
  }
}

export function konuHaritasiAktif(): KonuHaritaDerli {
  return aktif;
}

/**
 * Dosya adı stem YASAK — başlık/description'dan kısa konu slug.
 * Geniş kova regex'i YASAK (hepsi aynı stem'e yığılır); özgül kalıp veya kelime.
 */
export function konuStemKonudan(
  baslik: string,
  description?: string,
): string {
  const hay = `${description ?? ""}\n${baslik}`;
  for (const [re, stem] of aktif.stem) {
    if (re.test(hay)) return stem;
  }
  const words = baslik
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 3);
  return words.join(".") || "parca";
}

export interface KonuGirdi {
  description?: string;
  dosyaAd: string;
  baslik?: string;
  kapsam: Kapsam;
  dunya: string | null;
}

/** Yalnız dosya konusu — gövde YOK */
export function konuKaynakMetni(g: KonuGirdi): string {
  const ad = g.dosyaAd
    .replace(/\.md$/i, "")
    .replace(/^(feedback|reference|project|incident|idea)_/i, " ");
  return [g.description ?? "", ad, g.baslik ?? ""].join("\n");
}

/**
 * Gate #3 invariant #6: derinlik ≤3, `genel.genel` yok.
 */
export function konuNormalize(konu: string): string {
  const parts = konu.split(".").filter((p) => p.length > 0);
  const out: string[] = [];
  for (const p of parts) {
    if (p === "genel" && out[out.length - 1] === "genel") continue;
    out.push(p);
  }
  return (out.length > 3 ? out.slice(0, 3) : out).join(".") || "genel";
}

export function konuBelirleFromGirdi(g: KonuGirdi): string {
  const haystack = konuKaynakMetni(g);
  for (const [re, konu] of aktif.harita) {
    if (re.test(haystack)) return konuNormalize(konu);
  }
  if (g.kapsam === "evrensel") return "calisma.genel";
  if (g.kapsam === "kurum") return "kurum.genel";
  const d = g.dunya ?? "genel";
  return konuNormalize(d === "genel" ? "dunya.genel" : `dunya.${d}.genel`);
}

/** @deprecated Gate #5 — konuBelirleFromGirdi kullan */
export function konuBelirle(
  metin: string,
  kapsam: Kapsam,
  dunya: string | null,
  kaynakAd: string,
): string {
  const ilkSatir = metin.split("\n").find((l) => l.trim().length > 10)?.trim() ?? "";
  return konuBelirleFromGirdi({
    description: undefined,
    dosyaAd: kaynakAd,
    baslik: ilkSatir.slice(0, 120),
    kapsam,
    dunya,
  });
}

const KOVA_TAVAN = 15;

/**
 * Hiçbir konu kovası >15 olmasın.
 * Taşanlar alt kırılım veya dosya gövdesi ile ayrılır.
 */
export function kovaTavaniUygula<
  T extends { meta: { konu: string; baslik: string }; kaynakDosya?: string },
>(
  items: T[],
  dosyaAdAl: (t: T) => string,
  descriptionAl: (t: T) => string | undefined,
): void {
  const grup = new Map<string, T[]>();
  for (const it of items) {
    const arr = grup.get(it.meta.konu) ?? [];
    arr.push(it);
    grup.set(it.meta.konu, arr);
  }

  for (const [konu, liste] of grup) {
    if (liste.length <= KOVA_TAVAN) continue;

    for (const it of liste) {
      const hay = [
        descriptionAl(it) ?? "",
        dosyaAdAl(it),
        it.meta.baslik,
      ].join("\n");

      let yeni: string | null = null;
      for (const [re, alt] of aktif.alt_kirilim) {
        if (re.test(hay) && alt !== konu) {
          yeni = alt;
          break;
        }
      }
      if (!yeni) {
        const stem = konuStemKonudan(it.meta.baslik, descriptionAl(it));
        yeni = `${konu}.${stem}`;
      }
      it.meta.konu = konuNormalize(yeni);
    }
  }

  /*
   * 🔴 GATE 2026-08-09 — BÖLME ÇALIŞIYORDU, NORMALIZE GERİ BİRLEŞTİRİYORDU.
   *
   * Bir kova 19'da takılıydı ve üç geçiş de onu çözemiyordu.
   * Sebep: ikinci geçiş `${konu}.${stem}` ile DERİNLİK ARTIRARAK bölüyordu
   * (üçüncü segment uzuyordu), `konuNormalize` ise derinliği
   * **≤3'e kırpıyordu** → bütün dallar aynı üç segmente geri düşüyordu.
   * Üçüncü geçiş (uid kuyruğu) hiç tetiklenmiyordu çünkü grubunu KIRPILMAMIŞ
   * konularla kuruyordu: kırpılmadan önce her olgu ayrı kovada görünüyordu.
   * 🔑 ***Ara adımda ölçülen küme, son adımdaki küme değildi.***
   *
   * Düzeltme: derinlik artırmak yerine SON SEGMENTİ değiştir (üçüncü geçişin
   * zaten doğru yaptığı gibi) ve normalize'ı her geçişte uygula — böylece her
   * geçiş gerçek kovayı görür.
   */
  const grup2 = new Map<string, T[]>();
  for (const it of items) {
    const arr = grup2.get(it.meta.konu) ?? [];
    arr.push(it);
    grup2.set(it.meta.konu, arr);
  }
  for (const [konu, liste] of grup2) {
    if (liste.length <= KOVA_TAVAN) continue;
    const baz = konu.split(".").slice(0, 2).join(".");
    for (const it of liste) {
      const stem = konuStemKonudan(it.meta.baslik, descriptionAl(it));
      it.meta.konu = konuNormalize(`${baz}.${stem}`);
    }
  }

  const grup3 = new Map<string, T[]>();
  for (const it of items) {
    const arr = grup3.get(it.meta.konu) ?? [];
    arr.push(it);
    grup3.set(it.meta.konu, arr);
  }
  for (const [konu, liste] of grup3) {
    if (liste.length <= KOVA_TAVAN) continue;
    for (const [i, it] of liste.entries()) {
      const uid = "uid" in it.meta ? String((it.meta as { uid: string }).uid) : "";
      const kuyruk = (uid.slice(-4) || `n${i}`).toLowerCase();
      const baz = konu.split(".").slice(0, 2).join(".");
      it.meta.konu = konuNormalize(`${baz}.${kuyruk}`);
    }
  }

  for (const it of items) {
    it.meta.konu = konuNormalize(it.meta.konu);
  }
}

export function kovaIstatistik(
  konular: string[],
): { konu: string; n: number }[] {
  const m = new Map<string, number>();
  for (const k of konular) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()]
    .map(([konu, n]) => ({ konu, n }))
    .sort((a, b) => b.n - a.n);
}

export { KOVA_TAVAN };
