import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { yukleKasa } from "./dosya.js";
import { indeksSatirDisaYaz } from "./vocabulary.js";
import { durum, tazelik } from "./tarayici.js";
import type { Olgu, OlguMeta } from "./sema.js";

export interface IndeksSatir {
  uid: string;
  yol: string;
  tur: string;
  kapsam: string;
  dunya: string | null;
  konu: string;
  baslik: string;
  sahip: string;
  guven: number;
  raf_omru: string;
  dogrulandi: string | null;
  durum: string;
  yerine: string | null;
  curuten: string | null;
  iddia: string;
  /**
   * Motorun tazelik ölçüsü, 0..100. `null` = `dogrulandi` yok → BİLİNMİYOR.
   *
   * Neden indekste: ortam (`ortam/ana.js`) kendi tazelik formülünü yazıyordu ve
   * 291 olgunun 103'ünde motordan 0.3'ten fazla ayrışıyordu; ayrıca `dogrulandi`
   * yokken 0.35 UYDURUYORDU (motor null der — K2: uydurma yok). Türetilmiş
   * görünüm kendi ölçüsünü icat edemez; tek kaynak burasıdır.
   */
  tazelik: number | null;
  /**
   * Gezegen künyesi — YALNIZ `konu` `dunya.kunye*` olan kayıtlarda dolu.
   *
   * 🔴 Neden indekste: `dunyalar --json` ve ortam yalnız indeksi okur (kasanın
   * tamamını okumak ~2 MB ve 45 ms). Alan indekse yazılmayınca künye tanınıyor
   * ama **renk/ikon/ust boş geliyordu** — gezegen çizilir, kimliği kaybolurdu.
   * Ölçüldü 2026-08-03: 26 künye göç etti, 26'sının da rengi null'dı.
   */
  gezegen?: OlguMeta["gezegen"];
  /**
   * Taşınabilir kaynak özeti — tam nesne değil. Tez: her iddia kaynağını
   * taşır; indeks satırında yoksa ajan fact_read'e düşer.
   * 3'ten fazlası kırpılır; `kaynak_daha` gizlenen sayıyı söyler.
   */
  kaynak: { tur: string; isaret: string; alindi: string }[];
  kaynak_daha: number;
}

export const KAYNAK_INDEKS_UST = 3;

export function kaynakOzeti(
  kaynak: OlguMeta["kaynak"] | undefined,
): {
  kaynak: { tur: string; isaret: string; alindi: string }[];
  kaynak_daha: number;
} {
  const ozet = (kaynak ?? []).map((k) => ({
    tur: k.tur,
    isaret: k.isaret,
    alindi: k.alindi,
  }));
  if (ozet.length <= KAYNAK_INDEKS_UST) {
    return { kaynak: ozet, kaynak_daha: 0 };
  }
  return {
    kaynak: ozet.slice(0, KAYNAK_INDEKS_UST),
    kaynak_daha: ozet.length - KAYNAK_INDEKS_UST,
  };
}

function iddiaIlkCumle(govde: string): string {
  const ilk = govde.split(/\n\n+/)[0] ?? "";
  return ilk.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function indeksSatirlari(hepsi: Olgu[]): IndeksSatir[] {
  return hepsi.map((o) => {
    const d = durum(o, hepsi);
    return {
      uid: o.meta.uid,
      yol: o.yol ?? "",
      tur: o.meta.tur,
      kapsam: o.meta.kapsam,
      dunya: o.meta.dunya,
      konu: o.meta.konu,
      baslik: o.meta.baslik,
      sahip: o.meta.sahip,
      guven: o.meta.guven,
      raf_omru: o.meta.raf_omru,
      dogrulandi: o.meta.dogrulandi,
      durum: d.durum,
      yerine: o.meta.yerine,
      curuten: o.meta.curuten,
      iddia: iddiaIlkCumle(o.govde),
      tazelik: tazelik(o),
      ...(o.meta.gezegen ? { gezegen: o.meta.gezegen } : {}),
      ...kaynakOzeti(o.meta.kaynak),
    };
  });
}

/** uid → yol haritası (K6) */
export function uidYolHaritasi(hepsi: Olgu[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of hepsi) {
    if (o.yol) m.set(o.meta.uid, o.yol);
  }
  return m;
}

/**
 * İndeksin ÜRETİM MANTIĞI sürümü. Dışlama kuralı / alan seti / skorlama girdisi
 * değiştiğinde ARTIR. Sebep (ölçülmüş vaka): `_oneriler` dışlaması eklendiğinde
 * indeks dosyası diskte eskisi gibi durdu; kod değişikliği kasa .md mtime'ını
 * DEĞİŞTİRMEDİĞİ için mtime tabanlı tazelik bunu göremedi ve arama 10 saat boyunca
 * kabul edilmemiş taslakları döndürdü. Sürüm damgası o kapıyı kapatır.
 */
export const INDEKS_SURUM = 6; // 6: disk anahtarları İngilizce (vocabulary)

interface IndeksMeta {
  surum: number;
  /** İndekste kaç satır var (= geçerli olgu sayısı) */
  satir: number;
  /**
   * Üretim anında ağaçta kaç `.md` vardı. **Artık kapı DEĞİL, rapor alanı.**
   * ⚠️ `satir` ile KARŞILAŞTIRILMAZ: kasada olgu olmayan .md'ler de var
   * (ölçüldü: 293 dosya / 291 olgu). İki farklı kümeyi eşitlemek her çağrıda
   * yeniden üretim tetikler — B6-K1 ve B7-K1 ile aynı hata ailesi.
   */
  mdSayi: number;
  /** Üretim anındaki kasa içerik parmak izi — tazeliğin TEK içerik kapısı */
  icerikHash?: string;
  /**
   * Üretilen `_indeks.ndjson`'ın KENDİ hash'i — türev önbelleğin bütünlüğü.
   *
   * 🔴 Bu alan bir GERİLEMEDEN doğdu (2026-07-28): mtime kapısı kaldırılınca
   * `b0-indeks` testi kırmızıya döndü. Sebep: eski mtime karşılaştırması,
   * indeks dosyasının **kurcalanmasını** kazara yakalıyordu (elle yazılan sahte
   * satır + eski mtime → yeniden üretim). İçerik hash'i yalnız KASAYA bakar;
   * kasa değişmediyse bozuk indekse güvenirdi. Türev önbellek kendi bütünlüğünü
   * de kanıtlamak zorunda — yarım yazılmış dosya da bu kapıya takılır.
   */
  indeksHash?: string;
  uretim: string;
}

function metinHash(metin: string): string {
  return createHash("sha256").update(metin, "utf8").digest("hex").slice(0, 32);
}

function metaYolu(kasaKok: string): string {
  return join(kasaKok, "_indeks.meta.json");
}

/**
 * `_indeks.ndjson` üret — türetilmiş, elle yazılmaz, idempotent.
 * Yanına sürüm/sayı damgası yazar (`_indeks.meta.json`).
 */
export function uretIndeks(kasaKok: string): IndeksSatir[] {
  const hepsi = yukleKasa(kasaKok);
  const satirlar = indeksSatirlari(hepsi);
  const yol = join(kasaKok, "_indeks.ndjson");
  const metin =
    satirlar.map((s) => JSON.stringify(indeksSatirDisaYaz(s as unknown as Record<string, unknown>))).join("\n") +
    (satirlar.length ? "\n" : "");
  writeFileSync(yol, metin, "utf8");
  const pi = kasaParmakIzi(kasaKok);
  const meta: IndeksMeta = {
    surum: INDEKS_SURUM,
    satir: satirlar.length,
    mdSayi: pi.sayi,
    icerikHash: pi.hash,
    indeksHash: metinHash(metin),
    uretim: new Date().toISOString(),
  };
  writeFileSync(metaYolu(kasaKok), JSON.stringify(meta), "utf8");
  return satirlar;
}

/**
 * Kasa ağacındaki en yeni .md mtime (`_oneriler` / `_karantina` hariç).
 * ORTAM/3 B0 — indeks bayatlık ölçümü.
 */
export function kasaTarama(kasaKok: string): { enYeni: number; sayi: number } {
  let enYeni = 0;
  let sayi = 0;
  const gez = (dizin: string): void => {
    let girdiler;
    try {
      girdiler = readdirSync(dizin, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of girdiler) {
      if (e.name === "_karantina" || e.name === "_oneriler") continue;
      if (e.name.startsWith(".")) continue;
      const y = join(dizin, e.name);
      if (e.isDirectory()) gez(y);
      else if (e.name.endsWith(".md")) {
        sayi++;
        try {
          enYeni = Math.max(enYeni, statSync(y).mtimeMs);
        } catch {
          /* yoksay */
        }
      }
    }
  };
  gez(kasaKok);
  return { enYeni, sayi };
}

export function kasaEnYeniMdMtime(kasaKok: string): number {
  return kasaTarama(kasaKok).enYeni;
}

/**
 * Kasanın İÇERİK parmak izi: yol + dosya içeriği hash'lerinin sırayla toplamı.
 *
 * 🔑 NEDEN (dışarıdan alınan fikir — Zilliz `memsearch`, 2026-07-28):
 * indeks tazeliğini `mtime` ile ölçmek üç kör nokta doğurdu ve üç ayrı kapıyla
 * yamandı (mtime + sayı + sürüm). İçerik hash'i o kapıların İHTİYACINI ortadan
 * kaldırır çünkü soruyu doğru sorar: *"dosyaların içeriği değişti mi?"*
 *   - ekleme/silme  → yol listesi değişir  → hash değişir
 *   - düzenleme     → içerik değişir       → hash değişir
 *   - mtime oynama  → içerik AYNI          → hash AYNI (gereksiz üretim yok)
 *
 * ⚠️ Kod (üretim mantığı) değişimini hâlâ göremez — o `INDEKS_SURUM`'ün işi.
 * İki ayrı soru, iki ayrı kapı. Birleştirmek yanlış küme hatası olurdu.
 *
 * Ölçüldü (canlı kasa): 293 dosya · 2,15 MB · **45 ms**. Önbellek EKLENMEDİ:
 * önbellek geçersizleştirme hatasını çözen mekanizmanın kendi önbelleğine
 * ihtiyaç duyması, çözdüğü sorunu geri getirirdi.
 */
export function kasaParmakIzi(kasaKok: string): { hash: string; sayi: number } {
  const yollar: { bagil: string; tam: string }[] = [];
  const gez = (dizin: string): void => {
    let girdiler;
    try {
      girdiler = readdirSync(dizin, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of girdiler) {
      if (e.name === "_karantina" || e.name === "_oneriler") continue;
      if (e.name.startsWith(".")) continue;
      const y = join(dizin, e.name);
      if (e.isDirectory()) gez(y);
      else if (e.name.endsWith(".md")) {
        yollar.push({ bagil: y.slice(kasaKok.length).replace(/\\/g, "/"), tam: y });
      }
    }
  };
  gez(kasaKok);
  // Sıra dosya sistemine bırakılmaz: aynı içerik her cihazda aynı hash vermeli.
  yollar.sort((a, b) => (a.bagil < b.bagil ? -1 : a.bagil > b.bagil ? 1 : 0));

  const h = createHash("sha256");
  for (const y of yollar) {
    h.update(y.bagil);
    h.update("\0");
    try {
      h.update(createHash("sha256").update(readFileSync(y.tam)).digest());
    } catch {
      h.update("OKUNAMADI");
    }
    h.update("\n");
  }
  return { hash: h.digest("hex").slice(0, 32), sayi: yollar.length };
}

/**
 * İndeks bayatsa yeniden üret. Koruma en alt katmanda — CLI / MCP / kokpit ortak.
 *
 * ÜÇ KAPI, ÜÇ AYRI SORU (eskiden de üçtü ama ikisi aynı soruyu yarım soruyordu):
 *  1. `sürüm`       — ÜRETİM MANTIĞI değişti mi? (kod .md'lere dokunmaz)
 *  2. `indeks_bozuk`— TÜREV ÖNBELLEK bozuldu mu? (kurcalama / yarım yazım)
 *  3. `icerik`      — KASA değişti mi? (ekleme · silme · düzenleme, tek hash'te)
 *
 * 🔴 Eski hâli mtime + sayı + sürüm idi ve ikisi de SEZGİSELDİ:
 *    - mtime silmeyi göremiyordu (dosya gidince "en yeni mtime" DÜŞER, kapı
 *      sessizce geçer) → bu yüzden `sayı` kapısı eklenmişti;
 *    - `sayı` da aynı boyda bir düzenlemeyi göremezdi, mtime'a muhtaçtı.
 *    İkisi birbirinin açığını kapatmaya çalışan yamalardı. İçerik hash'i
 *    doğru soruyu bir kez sorar. (Fikir: Zilliz `memsearch`, 2026-07-28.)
 */
export function indeksGerekirseTazele(
  kasaKok: string,
): { tazelendi: boolean; olgu: number; sebep: string } {
  const indeksYol = join(kasaKok, "_indeks.ndjson");
  const uret = (sebep: string) => {
    const s = uretIndeks(kasaKok);
    return { tazelendi: true, olgu: s.length, sebep };
  };
  if (!existsSync(indeksYol)) return uret("indeks_yok");

  let meta: IndeksMeta | null = null;
  try {
    meta = JSON.parse(readFileSync(metaYolu(kasaKok), "utf8")) as IndeksMeta;
  } catch {
    meta = null;
  }
  // Damgasız indeks = eski sürümden kalma; mantığı bilinmiyor → güvenme.
  if (!meta || meta.surum !== INDEKS_SURUM) return uret("surum");
  // İçerik damgası olmayan indeks de güvenilmez: neyden üretildiği bilinmiyor.
  if (!meta.icerikHash || !meta.indeksHash) return uret("damga_yok");

  // 3. kapı: türev önbelleğin KENDİ bütünlüğü (kurcalama / yarım yazım).
  try {
    if (metinHash(readFileSync(indeksYol, "utf8")) !== meta.indeksHash) {
      return uret("indeks_bozuk");
    }
  } catch {
    return uret("indeks_okunamadi");
  }

  if (kasaParmakIzi(kasaKok).hash !== meta.icerikHash) return uret("icerik");
  return { tazelendi: false, olgu: 0, sebep: "taze" };
}
