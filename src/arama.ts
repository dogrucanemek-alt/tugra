/**
 * Arama sıralaması (beyan — TOKI: beyan edilmemiş sezgisel kural yasak):
 *   1. kelime skoru (yüksek önce)
 *   2. tazelik: taze > bayat (eşit skorda)
 *   3. guven (eşit skor + eşit tazelikte)
 * Varsayılan küme emekli ve çürüğü çıkarır. `--arsiv` / `arsiv:true` hepsini döndürür.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { yukleKasa } from "./dosya.js";
import {
  indeksGerekirseTazele,
  kaynakOzeti,
  type IndeksSatir,
} from "./indeks.js";
import { konuBelirleFromGirdi } from "./konu.js";
import {
  gunFarki,
  KAYNAK_TURLERI,
  TURLER,
  varsayilanRafOmru,
  type Kapsam,
  type Kaynak,
  type Tur,
  type Olgu,
} from "./sema.js";
import { korumaliGovde } from "./sunum.js";
import { durum, sinirlar, tazelik } from "./tarayici.js";
import { oneriYaz } from "./toplayici.js";
import { ulid } from "./ulid.js";
import { sirDeseniBul } from "./sir.js";
import { indeksSatirIceAl } from "./vocabulary.js";
import { yetkiKontrol } from "./yetki.js";
import { varsayilanKasa } from "./yollar.js";

/** web|mail → dış kaynaklı (modele VERİ, talimat değil) */
export const DIS_KAYNAK_TURLERI = new Set(["web", "mail"]);

export function kaynakTurleriSirali(
  kaynak: { tur: string }[] | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of kaynak ?? []) {
    const t = String(k.tur || "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function disKaynakliMi(turler: string[]): boolean {
  return turler.some((t) => DIS_KAYNAK_TURLERI.has(t));
}

/** Emekli olgunun yerine geçen uid (yerine: eski → yenide; tersine bak) */
/** AramaSonuc.yerine_uid — bu emekliyse yerine geçen */
export function yerineUidBul(
  olguUid: string,
  hepsi: { meta: { uid: string; yerine: string | null } }[],
): string | null {
  const gecen = hepsi.find((o) => o.meta.yerine === olguUid);
  return gecen?.meta.uid ?? null;
}

export interface AramaSonuc {
  uid: string;
  baslik: string;
  konu: string;
  tur: string;
  kapsam: string;
  dunya: string | null;
  durum: string;
  guven: number;
  /**
   * 🔴 EKLENDİ 2026-07-28: sonuç `durum` (taze/bayat) veriyordu ama
   * **ne zaman doğrulandığını** ve **raf ömrünü** vermiyordu.
   *
   * Bu sistemin ana tezi "bu bilgiye hâlâ güvenilir mi" — ve cevabı okuyan
   * ajan tam bu iki alanı görmeden karar veremez. Araştırmanın (arXiv
   * 2606.26511) önerdiği "staleness penalty against time of last verification"
   * hesabı bu alan olmadan yapılamaz.
   *
   * Bir hafıza formatı, taşıdığı bilginin yaşını taşımıyorsa hafıza değil arşivdir.
   */
  dogrulandi: string | null;
  raf_omru: string | null;
  iddia: string;
  etiketler: string[];
  notlar: string[];
  /** KASA/1 — köken (sıralı, tekrarsız) */
  kaynak_turleri: string[];
  /** web|mail varsa true */
  dis_kaynakli: boolean;
  /** 0–100 · dogrulandi yoksa null */
  tazelik: number | null;
  /** emekliyse yerine geçen uid */
  yerine_uid: string | null;
  /** Taşınabilir kaynak özeti — en fazla 3; fazlası `kaynak_daha`. */
  kaynak: { tur: string; isaret: string; alindi: string }[];
  kaynak_daha: number;
}

export interface AramaCevap {
  sonuclar: AramaSonuc[];
  sinirUyarilari: string[];
  toplam: number;
  /** Yanıt düzeyi — boş sorgu notu. Sonuç notları `AramaSonuc.notlar`. */
  notlar?: string[];
}

/**
 * Arama katlaması: bulma işi, anlam işi değil. Diyakritik düşer, ı=i.
 * `toLocaleLowerCase("tr")` büyük I'yi ı yapar — Invoice bulunamaz.
 */
export function aramaKatla(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase();
}

function tokenler(sorgu: string): string[] {
  return aramaKatla(sorgu)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Sınır gövdesi: tam kelime, en az 4 harf.
 * Gövde uzun; "to"/"in" her sınırda uyarır, insan yok saymayı öğrenir.
 */
function sinirGovdeKelime(govdeKatli: string, t: string): boolean {
  if (t.length < 4) return false;
  const kac = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${kac}(?:[^a-z0-9]|$)`).test(govdeKatli);
}

function semaNotIngilizce(u: string): string {
  const en = u
    .replace(/0–1 dışı/g, "out of 0-1")
    .replace(/geçersiz/g, "invalid")
    .replace(/dizi zorunlu/g, "array required")
    .replace(/zorunlu/g, "required")
    .replace(/nesne olmalı/g, "must be an object")
    .replace(/YYYY-MM-DD veya null/g, "YYYY-MM-DD or null")
    .replace(/ISO\/YYYY-MM-DD beklenir/g, "ISO/YYYY-MM-DD expected")
    .replace(/YYYY-MM-DD beklenir/g, "YYYY-MM-DD expected");
  return `schema: ${en}`;
}

function skor(satir: IndeksSatir, toks: string[]): number {
  const hay = aramaKatla(`${satir.baslik} ${satir.konu} ${satir.iddia} ${satir.tur}`);
  let s = 0;
  for (const t of toks) {
    if (hay.includes(t)) s += t.length >= 4 ? 3 : 1;
  }
  return s;
}

/** Kabul edilmemiş taslak / karantina — indekste ne olursa olsun aramaya girmez. */
const KASA_DISI = /(^|[\\/])_(oneriler|karantina)[\\/]/;

export function indeksYukle(kasaKok: string): IndeksSatir[] {
  // ORTAM/3 B0 — 1. kemer: bayatsa yeniden üret (sürüm/sayı/mtime).
  indeksGerekirseTazele(kasaKok);
  const yol = join(kasaKok, "_indeks.ndjson");
  if (!existsSync(yol)) return [];
  return readFileSync(yol, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map(
      (l) =>
        indeksSatirIceAl(JSON.parse(l) as Record<string, unknown>) as unknown as IndeksSatir,
    )
    // 2. kemer: tazelemeye GÜVENME. Elle düzenlenmiş, yarım yazılmış ya da eski
    // sürümden kalma bir indeks satırı buraya kadar gelse bile burada elenir.
    // (Asıl vakada 70 kabul edilmemiş taslak modele MCP üzerinden verilmişti.)
    .filter((s) => !KASA_DISI.test(s.yol ?? ""));
}

export function olguAra(
  sorgu: string,
  opts: {
    kasaKok?: string;
    kapsam?: Kapsam | string;
    dunya?: string;
    konu?: string;
    limit?: number;
    /** emekli + çürük dahil — denetim/arşiv. Varsayılan: aktif küme. */
    arsiv?: boolean;
    ajan?: string;
    yetkiKok?: string;
    akisKok?: string;
    /** A0–A5 skala kasası (yazma/arama hedefinden ayrı) */
    skalaKasa?: string;
  } = {},
): AramaCevap {
  const kasaKok = opts.kasaKok ?? varsayilanKasa();
  if (opts.ajan) {
    const k = yetkiKontrol({
      ajan: opts.ajan,
      eylem: "okuma",
      kapsam: typeof opts.kapsam === "string" ? opts.kapsam : "kurum",
      yetkiKok: opts.yetkiKok,
      kasaKok: opts.skalaKasa ?? kasaKok,
      akisKok: opts.akisKok,
      dosyaYoksaIzin: false,
    });
    if (!k.izin) {
      return {
        sonuclar: [],
        sinirUyarilari: [`yetki yok: ${k.neden} (talep ${k.talep_id})`],
        toplam: 0,
      };
    }
  }
  const limit = opts.limit ?? 10;
  const toks = tokenler(sorgu);
  const indeks = indeksYukle(kasaKok);
  const hepsi = yukleKasa(kasaKok);
  const aktifSinirlar = sinirlar(hepsi);

  // Token yok + konu yok = arama değil. Sessizce "ilk 10 olgu" uydurma.
  if (!toks.length && !opts.konu) {
    return {
      sonuclar: [],
      sinirUyarilari: [],
      toplam: 0,
      notlar: ["empty query — not a search; no results invented"],
    };
  }

  let adaylar = indeks;
  if (opts.kapsam) {
    adaylar = adaylar.filter((s) => s.kapsam === opts.kapsam);
  }
  if (opts.dunya) {
    adaylar = adaylar.filter((s) => s.dunya === opts.dunya);
  }
  if (opts.konu) {
    const k = aramaKatla(opts.konu);
    adaylar = adaylar.filter(
      (s) =>
        aramaKatla(s.konu) === k ||
        aramaKatla(s.konu).includes(k),
    );
  }

  function olguDurum(s: (typeof adaylar)[number]): string {
    const olgu = hepsi.find((o) => o.meta.uid === s.uid);
    return olgu ? durum(olgu, hepsi).durum : s.durum;
  }

  if (!opts.arsiv) {
    adaylar = adaylar.filter((s) => {
      const d = olguDurum(s);
      return d !== "emekli" && d !== "curuk";
    });
  }

  function tazelikSirasi(d: string): number {
    // taze > bayat; arşivde emekli/çürük en geride
    if (d === "taze") return 2;
    if (d === "bayat") return 1;
    return 0;
  }

  const puanliHepsi = adaylar
    .map((s) => ({
      s,
      skor: toks.length ? skor(s, toks) : 1,
      d: olguDurum(s),
    }))
    .filter((x) => (toks.length ? x.skor > 0 : true))
    .sort((a, b) => {
      if (b.skor !== a.skor) return b.skor - a.skor;
      const td = tazelikSirasi(b.d) - tazelikSirasi(a.d);
      if (td !== 0) return td;
      return (b.s.guven ?? 0) - (a.s.guven ?? 0);
    });
  const puanli = puanliHepsi.slice(0, limit);

  const sinirUyarilari: string[] = [];
  for (const sn of aktifSinirlar) {
    const hay = aramaKatla(`${sn.meta.baslik} ${sn.meta.konu}`);
    const govde = aramaKatla(
      hepsi.find((o) => o.meta.uid === sn.meta.uid)?.govde ?? "",
    );
    const esles =
      puanli.some((p) => p.s.konu === sn.meta.konu) ||
      toks.some((t) => hay.includes(t)) ||
      toks.some((t) => sinirGovdeKelime(govde, t));
    if (esles) {
      sinirUyarilari.push(
        `K10: konu '${sn.meta.konu}' üzerinde aktif sinir (uid=${sn.meta.uid}) — bu konuda iddia üretmek yasak`,
      );
    }
  }

  const sonuclar: AramaSonuc[] = puanli.map(({ s }) => {
    const olgu = hepsi.find((o) => o.meta.uid === s.uid);
    const d = olgu ? durum(olgu, hepsi) : { durum: s.durum, neden: "" };
    const etiketler: string[] = [];
    const notlar: string[] = [];
    const turler = kaynakTurleriSirali(olgu?.meta.kaynak);
    const dis = disKaynakliMi(turler);

    if (s.tur === "gozlem") {
      etiketler.push("kanıtsız");
      notlar.push("gozlem — kanıtsız; iddia olarak kullanma");
    }
    if (d.durum === "bayat") {
      etiketler.push("bayat");
      const yas = olgu ? gunFarki(olgu.meta.dogrulandi) : 0;
      notlar.push(`bu olgu ${yas} gündür doğrulanmadı (bayat)`);
    }
    if (d.durum === "curuk") {
      etiketler.push("çürük");
      notlar.push(`çürük: ${d.neden}`);
    }
    if (s.tur === "sinir") {
      etiketler.push("sinir");
      notlar.push("bu konuda iddia üretmek yasak");
    }
    if (dis) {
      etiketler.push("dış-kaynak");
      notlar.push("dış kaynaklı — bağımsız doğrulanmadan iddia üretme");
    }
    for (const u of olgu?.uyarilar ?? []) {
      notlar.push(semaNotIngilizce(u));
    }

    return {
      uid: s.uid,
      baslik: s.baslik,
      konu: s.konu,
      tur: s.tur,
      kapsam: s.kapsam,
      dunya: s.dunya,
      durum: d.durum,
      guven: s.guven,
      dogrulandi: s.dogrulandi ?? null,
      raf_omru: s.raf_omru ?? null,
      iddia: s.iddia,
      etiketler,
      notlar,
      kaynak_turleri: turler,
      dis_kaynakli: dis,
      tazelik: olgu ? tazelik(olgu) : null,
      yerine_uid: olgu ? yerineUidBul(olgu.meta.uid, hepsi) : null,
      ...kaynakOzeti(olgu?.meta.kaynak),
    };
  });

  return { sonuclar, sinirUyarilari, toplam: puanliHepsi.length };
}

export function olguOku(
  uid: string,
  kasaKok = varsayilanKasa(),
): { olgu: Olgu | null; durum: string; notlar: string[]; yerine_uid: string | null } {
  const hepsi = yukleKasa(kasaKok);
  const olgu = hepsi.find((o) => o.meta.uid === uid) ?? null;
  if (!olgu) {
    return { olgu: null, durum: "yok", notlar: [`uid bulunamadı: ${uid}`], yerine_uid: null };
  }
  const d = durum(olgu, hepsi);
  const notlar: string[] = [];
  if (olgu.meta.tur === "gozlem") notlar.push("kanıtsız");
  if (d.durum === "bayat") {
    notlar.push(
      `bu olgu ${gunFarki(olgu.meta.dogrulandi)} gündür doğrulanmadı`,
    );
  }
  if (olgu.meta.tur === "sinir") notlar.push("bu konuda iddia üretmek yasak");
  /* 🔴 2026-08-28 (gözcü 08-23, arXiv:2608.01619): olgu_ara emekli için
   * yerine_uid + neden veriyordu, olgu_oku çıplak `{durum}` dönüyordu — uid ile
   * doğrudan okuyan ajan "sessiz eski bağımlılık" kuruyordu. Tek gerçek,
   * iki okuyucuda da aynı söylenir. */
  const yerineUid = yerineUidBul(olgu.meta.uid, hepsi);
  if (d.durum === "emekli") {
    notlar.push(
      yerineUid ? `emekli — yerine ${yerineUid} geçti (${d.neden})` : `emekli — ${d.neden}`,
    );
  }
  return { olgu, durum: d.durum, notlar, yerine_uid: yerineUid };
}

/** MCP ajan yüzeyi — gövde sunum katmanından geçer. CLI ham kalır. */
export function olguOkuMcp(
  uid: string,
  kasaKok = varsayilanKasa(),
): ReturnType<typeof olguOku> & { dis_kaynakli?: boolean } {
  const r = olguOku(uid, kasaKok);
  if (!r.olgu) return r;
  const turler = kaynakTurleriSirali(r.olgu.meta.kaynak);
  const dis = disKaynakliMi(turler);
  return {
    ...r,
    olgu: { ...r.olgu, govde: korumaliGovde(r.olgu.govde, dis) },
    dis_kaynakli: dis,
  };
}

function kaynakNormalize(girdi?: OlguOnerKaynak[]): Kaynak[] {
  if (!girdi?.length) return [];
  const bugun = new Date().toISOString().slice(0, 10);
  return girdi.map((k) => ({
    tur: k.tur as Kaynak["tur"],
    isaret: k.isaret,
    alindi: k.alindi && /^\d{4}-\d{2}-\d{2}/.test(k.alindi) ? k.alindi : bugun,
    ...(k.miras ? { miras: true } : {}),
    ...(k.kanit ? { kanit: k.kanit } : {}),
    ...(k.icerik_izi ? { icerik_izi: k.icerik_izi } : {}),
  }));
}

export type OlguOnerSonuc =
  | { izin: true; yol: string; karantina: boolean }
  | { izin: false; talep_id: string; neden: string };

export type OlguOnerKaynak = {
  tur: string;
  isaret: string;
  alindi?: string;
  miras?: boolean;
  kanit?: string;
  icerik_izi?: string;
};

export function olguOner(
  taslak: {
    baslik: string;
    govde: string;
    konu?: string;
    dunya?: string;
    tur?: string;
    ajan?: string;
    /** Ajan gerçek kanıt verebilir; yoksa kaynak: [] — mcp:// enjekte edilmez */
    kaynak?: OlguOnerKaynak[];
  },
  kasaKok = varsayilanKasa(),
  secenek: {
    yetkiKok?: string;
    akisKok?: string;
    /** A0–A5 skalasının okunacağı kasa (yazma hedefinden ayrı) */
    skalaKasa?: string;
  } = {},
): OlguOnerSonuc {
  const ajan = taslak.ajan ?? "mcp@olgu_oner";
  const turHam = taslak.tur ?? "olgu";
  if (!TURLER.includes(turHam as Tur)) {
    return { izin: false, talep_id: "yok", neden: "geçersiz tur" };
  }
  if (
    taslak.kaynak?.some(
      (k) =>
        !KAYNAK_TURLERI.includes(k.tur as (typeof KAYNAK_TURLERI)[number]),
    )
  ) {
    return { izin: false, talep_id: "yok", neden: "geçersiz kaynak.tur" };
  }
  const tur = turHam as Tur;
  const dunya = taslak.dunya ?? null;
  const kapsam: Kapsam = dunya ? "dunya" : "kurum";
  const skalaKasa = secenek.skalaKasa ?? varsayilanKasa();

  // Sır yazılmadan durur — yetki/akis kaydına da düşmesin diye yazmadan ÖNCE.
  const sirMetin = [
    taslak.baslik ?? "",
    taslak.govde ?? "",
    ...(taslak.kaynak ?? []).map((k) => `${k.isaret ?? ""}\n${k.kanit ?? ""}`),
  ].join("\n");
  const sirAd = sirDeseniBul(sirMetin);
  if (sirAd) {
    return {
      izin: false,
      talep_id: "yok",
      neden: `sır deseni: yazılmadı (${sirAd})`,
    };
  }

  const k = yetkiKontrol({
    ajan,
    eylem: "oneri",
    kapsam,
    yetkiKok: secenek.yetkiKok,
    kasaKok: skalaKasa,
    akisKok: secenek.akisKok,
    dosyaYoksaIzin: false,
  });
  if (!k.izin) {
    return {
      izin: false,
      talep_id: k.talep_id ?? "yok",
      neden: k.neden ?? "yetki yok",
    };
  }

  const konu =
    taslak.konu ??
    konuBelirleFromGirdi({
      description: taslak.baslik,
      dosyaAd: taslak.baslik,
      baslik: taslak.baslik,
      kapsam,
      dunya,
    });

  const olgu: Olgu = {
    meta: {
      uid: ulid(),
      tur,
      kapsam,
      dunya,
      konu,
      baslik: taslak.baslik.slice(0, 120),
      sahip: "patron",
      yazan: ajan,
      tarih: new Date().toISOString(),
      guven: 0.5,
      raf_omru: varsayilanRafOmru(tur, kapsam),
      // K2: bir ajanın öneri yazması DOĞRULAMA DEĞİLDİR. Buraya bugünün tarihini
      // koymak taslağı "bugün doğrulanmış" diye doğurur ve bayatlama saatini
      // sıfırlar — spec'in kendi deyimiyle "null ile bugünün tarihi aynı şey
      // değildir; ikincisi bir yalandır". Tarihi yalnız insan onayı yazar.
      dogrulandi: null,
      // K1: sahte mcp://olgu_oner enjeksiyonu yok. Ajan kaynak vermezse
      // boş dizi — taslak karantinada/öneride bekler; yükseltme k1KanitYeterli
      // ile kanit_yok kuyruğuna düşer.
      kaynak: kaynakNormalize(taslak.kaynak),
      baglar: [],
      etki: [],
      yerine: null,
      curuten: null,
      durum_notu: tur === "sinir"
        ? "BOUNDARY PROPOSAL — human approval required"
        : k.karantina
          ? "quarantined — awaiting approval"
          : "draft from fact_propose",
    },
    govde: taslak.govde,
  };
  // sinir: ajan güveninden bağımsız HER ZAMAN karantina — sahte sınır zehri.
  const karantina = !!k.karantina || tur === "sinir";
  const yol = oneriYaz(olgu, kasaKok, { karantina });
  return { izin: true, yol, karantina };
}
