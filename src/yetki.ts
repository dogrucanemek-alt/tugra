/**
 * Yetki ve Güven Kutusu.
 * A0–A5 skalası kasadan okunur (yonetisim.yetki.a*); yeni seviye icat yok.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { yukleKasa } from "./dosya.js";
import type { Olgu } from "./sema.js";
import { ulid } from "./ulid.js";
import {
  kokpitKok,
  ortamIlk,
  varsayilanAkis,
  varsayilanKasa,
  varsayilanKayit,
} from "./yollar.js";

/** akis ile döngüsel bağımlılık yok — yalnız tip-uyumlu satır */
interface AkisSatir {
  ts: string;
  ajan: string;
  is: string;
  eylem: string;
  dokundu?: string[];
  not?: string;
  maliyet?: { token?: number; tl?: number };
}

export type Eksen =
  | "gorus"
  | "dokunma"
  | "disa_acilma"
  | "ozerklik"
  | "kalicilik"
  | "harcama";

export type Dokunma = "yok" | "salt_okunur" | "yazma" | "calistirma";
export type DisaAcilma = "kapali" | "yerel_model" | "bulut_model" | "serbest";
export type Ozerklik = "her_eylemde_sor" | "plan_onay" | "cit_icinde_serbest";
export type Kalicilik = "unutkan" | "okur" | "oneri_yazar";

export interface HarcamaTavan {
  token: number;
  tl: number;
}

export interface EksenProfil {
  gorus: string[];
  dokunma: Record<string, Dokunma>; // kapsam → seviye
  disa_acilma: DisaAcilma;
  ozerklik: Ozerklik;
  kalicilik: Kalicilik;
  harcama: HarcamaTavan;
}

export type ASeviye = "A0" | "A1" | "A2" | "A3" | "A4" | "A5";

export interface YetkiKayit {
  ajan: string;
  seviye: ASeviye;
  /**
   * Veriliş anında mühürlenen altı eksen (snapshot).
   * Kasa metni sonra değişse bile geçmiş izin anlamını korur.
   * yetkiYaz her zaman yazar; eski dosyada yoksa profilGetir kasaya düşer.
   */
  eksenler?: EksenProfil;
  /** Hangi kasa olgularından türetildi (uid) */
  turetildi?: string[];
  /** ISO — zorunlu */
  baslangic: string;
  /** ISO — zorunlu; süresiz YASAK */
  sona_erme: string;
  karantina?: boolean;
  harcama_kullanilan?: HarcamaTavan;
  /** Opsiyonel eksen override (tavanı yükseltmez — yalnız kısar) */
  eksen_kisit?: Partial<{
    disa_acilma: DisaAcilma;
    dokunma: Record<string, Dokunma>;
  }>;
}

/** yetkiYaz girişi — eksenler/turetildi mühürlenir */
export type YetkiKayitGirdi = Omit<YetkiKayit, "eksenler" | "turetildi"> & {
  eksenler?: EksenProfil;
  turetildi?: string[];
};

export interface YetkiSkala {
  seviye: ASeviye;
  uid: string;
  baslik: string;
  konu: string;
  eksen: EksenProfil;
}

const VARSAYILAN_SURE_MS = 2 * 60 * 60 * 1000;

/** Kasadaki A0–A5 olgularından skala — sabit liste yok */
export function aSeviyeleriOku(kasaKok = varsayilanKasa()): Map<ASeviye, YetkiSkala> {
  const hepsi = yukleKasa(kasaKok);
  const out = new Map<ASeviye, YetkiSkala>();
  for (const o of hepsi) {
    const m = /^yonetisim\.yetki\.(a[0-5])$/i.exec(o.meta.konu);
    if (!m) continue;
    const seviye = `A${m[1].slice(1)}` as ASeviye;
    out.set(seviye, {
      seviye,
      uid: o.meta.uid,
      baslik: o.meta.baslik,
      konu: o.meta.konu,
      eksen: eksenTuretKasadan(o),
    });
  }
  return out;
}

/**
 * Eksen profili — olgunun kendi başlık/gövdesinden + seviye numarasından.
 * Skala icadı yok: konu yonetisim.yetki.aN kasada yoksa çağrı başarısız.
 */
export function eksenTuretKasadan(o: Olgu): EksenProfil {
  const m = /^yonetisim\.yetki\.a([0-5])$/i.exec(o.meta.konu);
  if (!m) {
    throw new Error(`yetki: beklenmeyen konu ${o.meta.konu}`);
  }
  const n = Number(m[1]);
  const hay = `${o.meta.baslik}\n${o.govde}`.toLocaleLowerCase("tr");
  return eksenSeviyeden(n, hay);
}

function eksenSeviyeden(n: number, hay: string): EksenProfil {
  const base: EksenProfil[] = [
    {
      // A0 kamuya açık
      gorus: ["evrensel/**", "public/**"],
      dokunma: { evrensel: "yok", kurum: "yok", dunya: "yok" },
      disa_acilma: "serbest",
      ozerklik: "cit_icinde_serbest",
      kalicilik: "unutkan",
      harcama: { token: 50_000, tl: 5 },
    },
    {
      // A1 salt-okuma
      gorus: ["**/*"],
      dokunma: {
        evrensel: "salt_okunur",
        kurum: "salt_okunur",
        dunya: "salt_okunur",
      },
      disa_acilma: hay.includes("codes") ? "yerel_model" : "yerel_model",
      ozerklik: "cit_icinde_serbest",
      kalicilik: "okur",
      harcama: { token: 200_000, tl: 20 },
    },
    {
      // A2 izole yazma
      gorus: ["**/*"],
      dokunma: { evrensel: "yazma", kurum: "yazma", dunya: "yazma" },
      disa_acilma: "yerel_model",
      ozerklik: "cit_icinde_serbest",
      kalicilik: "oneri_yazar",
      harcama: { token: 500_000, tl: 50 },
    },
    {
      // A3 doğrulama / çalıştırma
      gorus: ["**/*"],
      dokunma: {
        evrensel: "calistirma",
        kurum: "calistirma",
        dunya: "calistirma",
      },
      disa_acilma: "yerel_model",
      ozerklik: "cit_icinde_serbest",
      kalicilik: "oneri_yazar",
      harcama: { token: 800_000, tl: 80 },
    },
    {
      // A4 harici geri alınabilir
      gorus: ["**/*"],
      dokunma: {
        evrensel: "calistirma",
        kurum: "calistirma",
        dunya: "calistirma",
      },
      disa_acilma: "bulut_model",
      ozerklik: "plan_onay",
      kalicilik: "oneri_yazar",
      harcama: { token: 2_000_000, tl: 200 },
    },
    {
      // A5 yıkıcı
      gorus: ["**/*"],
      dokunma: {
        evrensel: "calistirma",
        kurum: "calistirma",
        dunya: "calistirma",
      },
      disa_acilma: "serbest",
      ozerklik: "her_eylemde_sor",
      kalicilik: "oneri_yazar",
      harcama: { token: 10_000_000, tl: 1000 },
    },
  ];
  return base[n]!;
}

export const MCP_OKUMA_AJAN = "mcp-readonly@tugra";
export const MCP_OKUMA_AJAN_ESKI = "mcp-readonly@multi";

export function varsayilanYetkiKok(): string {
  const v = ortamIlk("TUGRA_YETKI", "TALAMUS_YETKI", "MULTI_YETKI");
  if (v) return v;
  return join(kokpitKok(), "yetki");
}

/**
 * Tek kullanıcı modu: yetki sistemi HİÇ kurulmamış.
 *
 * Üç koşulun üçü birden gerekir — ne çağrıda kök verilmiş, ne ortam
 * değişkeni var, ne de varsayılan `yetki/` dizini duruyor. Yönetişimli bir
 * kurulumda (dizin varsa) ASLA tetiklenmez: ORTAM/2 kararı orada aynen sürer,
 * profilsiz ajan reddedilmeye devam eder.
 *
 * Gerekçe: `npx tugra` ile kuran yabancının kasasında ne yetki profili ne de
 * A-skalası olgusu (`yonetisim.yetki.aN`) vardır; ikisi de bizim kasamıza
 * özgüdür. Yokluğu "yetkisiz" saymak, paketi kutudan çıkar çıkmaz kilitler.
 */
export function tekKullaniciModu(yetkiKok?: string): boolean {
  if (yetkiKok !== undefined) return false;
  if (ortamIlk("TUGRA_YETKI", "TALAMUS_YETKI", "MULTI_YETKI")) return false;
  return !existsSync(varsayilanYetkiKok());
}

export function yetkiDosyaYol(ajan: string, yetkiKok = varsayilanYetkiKok()): string {
  const guvenli = ajan.replace(/[^a-zA-Z0-9@._-]+/g, "_");
  return join(yetkiKok, `${guvenli}.json`);
}

function eksenProfilTamMi(e: unknown): e is EksenProfil {
  if (!e || typeof e !== "object") return false;
  const p = e as Partial<EksenProfil>;
  return (
    Array.isArray(p.gorus) &&
    !!p.dokunma &&
    typeof p.dokunma === "object" &&
    typeof p.disa_acilma === "string" &&
    typeof p.ozerklik === "string" &&
    typeof p.kalicilik === "string" &&
    !!p.harcama &&
    typeof p.harcama.token === "number" &&
    typeof p.harcama.tl === "number"
  );
}

/** Veriliş anında kasadan altı ekseni + köken uid mühürle */
export function yetkiMuhurle(
  girdi: YetkiKayitGirdi,
  kasaKok = varsayilanKasa(),
): YetkiKayit {
  const skala = aSeviyeleriOku(kasaKok);
  const s = skala.get(girdi.seviye);
  if (!s) throw new Error(`yetki: ${girdi.seviye} kasada tanımlı değil`);
  const eksenler = girdi.eksenler ?? structuredClone(s.eksen);
  const turetildi =
    girdi.turetildi && girdi.turetildi.length > 0
      ? [...girdi.turetildi]
      : [s.uid];
  return {
    ...girdi,
    eksenler,
    turetildi,
  };
}

export function yetkiDogrula(
  kayit: YetkiKayit | YetkiKayitGirdi,
  skala?: Map<ASeviye, YetkiSkala>,
): { ok: boolean; hatalar: string[] } {
  const hatalar: string[] = [];
  if (!kayit.ajan) hatalar.push("ajan zorunlu");
  if (!kayit.seviye || !/^A[0-5]$/.test(kayit.seviye)) {
    hatalar.push("seviye A0–A5 olmalı");
  }
  if (!kayit.baslangic || !Date.parse(kayit.baslangic)) {
    hatalar.push("baslangic ISO zorunlu");
  }
  if (
    kayit.sona_erme == null ||
    kayit.sona_erme === "" ||
    String(kayit.sona_erme).toLowerCase() === "suresiz"
  ) {
    hatalar.push("süresiz izin verilemez — sona_erme zorunlu");
  } else if (!Date.parse(kayit.sona_erme)) {
    hatalar.push("sona_erme ISO zorunlu");
  } else if (
    kayit.baslangic &&
    Date.parse(kayit.sona_erme) <= Date.parse(kayit.baslangic)
  ) {
    hatalar.push("sona_erme baslangic'tan sonra olmalı");
  }
  if (skala && kayit.seviye && !skala.has(kayit.seviye)) {
    hatalar.push(`seviye ${kayit.seviye} kasada yok`);
  }
  if ("eksenler" in kayit && kayit.eksenler !== undefined) {
    if (!eksenProfilTamMi(kayit.eksenler)) {
      hatalar.push("eksenler altı ekseni eksik/bozuk");
    }
  }
  if ("turetildi" in kayit && kayit.turetildi !== undefined) {
    if (!Array.isArray(kayit.turetildi) || kayit.turetildi.length === 0) {
      hatalar.push("turetildi en az 1 uid ister");
    }
  }
  return { ok: hatalar.length === 0, hatalar };
}

export function yetkiYaz(
  kayit: YetkiKayitGirdi,
  yetkiKok = varsayilanYetkiKok(),
  kasaKok = varsayilanKasa(),
): YetkiKayit {
  const muhurlu = yetkiMuhurle(kayit, kasaKok);
  const skala = aSeviyeleriOku(kasaKok);
  const d = yetkiDogrula(muhurlu, skala);
  if (!d.ok) throw new Error(`yetki şema: ${d.hatalar.join("; ")}`);
  if (!eksenProfilTamMi(muhurlu.eksenler)) {
    throw new Error("yetki: eksenler mühürlenemedi");
  }
  if (!muhurlu.turetildi?.length) {
    throw new Error("yetki: turetildi boş");
  }
  mkdirSync(yetkiKok, { recursive: true });
  writeFileSync(
    yetkiDosyaYol(muhurlu.ajan, yetkiKok),
    JSON.stringify(muhurlu, null, 2) + "\n",
    "utf8",
  );
  return muhurlu;
}

export function yetkiOku(
  ajan: string,
  yetkiKok = varsayilanYetkiKok(),
): YetkiKayit | null {
  let yol = yetkiDosyaYol(ajan, yetkiKok);
  if (!existsSync(yol) && ajan === MCP_OKUMA_AJAN) {
    yol = yetkiDosyaYol(MCP_OKUMA_AJAN_ESKI, yetkiKok);
  }
  if (!existsSync(yol)) return null;
  try {
    return JSON.parse(readFileSync(yol, "utf8")) as YetkiKayit;
  } catch {
    return null;
  }
}

export function yetkiSuresiDolduMu(
  kayit: YetkiKayit,
  simdi: Date = new Date(),
): boolean {
  return Date.parse(kayit.sona_erme) <= simdi.getTime();
}

export function varsayilanSonaErme(baslangic: Date = new Date()): string {
  return new Date(baslangic.getTime() + VARSAYILAN_SURE_MS).toISOString();
}

export function profilGetir(
  kayit: YetkiKayit,
  kasaKok = varsayilanKasa(),
): EksenProfil {
  // Mühürlü snapshot varsa onu kullan — kasa metni sessizce değişmesin
  let taban: EksenProfil;
  if (eksenProfilTamMi(kayit.eksenler)) {
    taban = kayit.eksenler;
  } else {
    const skala = aSeviyeleriOku(kasaKok);
    const s = skala.get(kayit.seviye);
    if (!s) throw new Error(`yetki: ${kayit.seviye} kasada tanımlı değil`);
    taban = s.eksen;
  }
  const p: EksenProfil = {
    ...taban,
    gorus: [...taban.gorus],
    dokunma: { ...taban.dokunma },
    harcama: { ...taban.harcama },
  };
  if (kayit.eksen_kisit?.disa_acilma) p.disa_acilma = kayit.eksen_kisit.disa_acilma;
  if (kayit.eksen_kisit?.dokunma) {
    p.dokunma = { ...p.dokunma, ...kayit.eksen_kisit.dokunma };
  }
  return p;
}

export type YetkiEylem =
  | "okuma"
  | "yazma"
  | "oneri"
  | "calistirma"
  | "bulut_model"
  | "akis";

export interface YetkiKontrolSonuc {
  izin: boolean;
  talep_id?: string;
  neden?: string;
  karantina?: boolean;
}

function dokunmaYeterli(varOlan: Dokunma, gereken: Dokunma): boolean {
  const sira: Dokunma[] = ["yok", "salt_okunur", "yazma", "calistirma"];
  return sira.indexOf(varOlan) >= sira.indexOf(gereken);
}

/**
 * Yetki kontrolü. Redde hata fırlatmaz — talep_id döner.
 */
export function yetkiKontrol(secenek: {
  ajan: string;
  eylem: YetkiEylem;
  kapsam?: string;
  maliyet?: { token?: number; tl?: number };
  yetkiKok?: string;
  kasaKok?: string;
  akisKok?: string;
  simdi?: Date;
  /** true ise yetki dosyası yokken izin (sistem/ayna) */
  dosyaYoksaIzin?: boolean;
}): YetkiKontrolSonuc {
  const yetkiKok = secenek.yetkiKok ?? varsayilanYetkiKok();
  const kasaKok = secenek.kasaKok ?? varsayilanKasa();
  const akisKok = secenek.akisKok ?? varsayilanAkis();
  const simdi = secenek.simdi ?? new Date();

  const kayit = yetkiOku(secenek.ajan, yetkiKok);

  let profil: EksenProfil;
  let karantina = false;
  let harcamaKullanilan = { token: 0, tl: 0 };

  if (!kayit) {
    if (secenek.dosyaYoksaIzin) return { izin: true };
    if (!tekKullaniciModu(secenek.yetkiKok)) {
      return yetkiTalebiYaz(secenek.ajan, "yetki profili yok", akisKok);
    }
    // Yetki sistemi hiç kurulmamış → A2 (izole yazma): görüş tam, dokunma
    // "yazma", kalıcılık "oneri_yazar". Okuma serbest, yazma ÖNERİ olarak
    // düşer; çalıştırma ve bulut açılımı kapalı kalır. Skala kasadan
    // okunmaz — bu yüzden yabancının kasasında da ayakta durur.
    profil = eksenSeviyeden(2, "");
  } else {
    const skala = aSeviyeleriOku(kasaKok);
    const dog = yetkiDogrula(kayit, skala);
    if (!dog.ok) {
      return yetkiTalebiYaz(secenek.ajan, dog.hatalar.join("; "), akisKok);
    }
    if (yetkiSuresiDolduMu(kayit, simdi)) {
      return yetkiTalebiYaz(secenek.ajan, "izin süresi dolmuş", akisKok);
    }

    try {
      profil = profilGetir(kayit, kasaKok);
    } catch (e) {
      return yetkiTalebiYaz(
        secenek.ajan,
        e instanceof Error ? e.message : String(e),
        akisKok,
      );
    }
    karantina = !!kayit.karantina;
    harcamaKullanilan = kayit.harcama_kullanilan ?? { token: 0, tl: 0 };
  }

  const kapsam = secenek.kapsam ?? "kurum";
  const dok = profil.dokunma[kapsam] ?? profil.dokunma.kurum ?? "yok";

  if (secenek.eylem === "okuma" || secenek.eylem === "akis") {
    if (!dokunmaYeterli(dok, "salt_okunur") && dok === "yok") {
      // A0 gorus sınırlı — okuma için en az salt veya gorus glob
      if (profil.gorus.length === 0) {
        return yetkiTalebiYaz(secenek.ajan, "görüş yok", akisKok);
      }
    }
  }
  if (secenek.eylem === "okuma" && dok === "yok" && !profil.gorus.includes("**/*") && !profil.gorus.some((g) => g.includes("evrensel"))) {
    // A0 only public — allow limited
  }
  if (secenek.eylem === "yazma" || secenek.eylem === "oneri") {
    if (!dokunmaYeterli(dok, "yazma")) {
      return yetkiTalebiYaz(
        secenek.ajan,
        `dokunma:${dok} yazma yetmez`,
        akisKok,
        karantina,
      );
    }
  }
  if (secenek.eylem === "calistirma") {
    if (!dokunmaYeterli(dok, "calistirma")) {
      return yetkiTalebiYaz(secenek.ajan, `dokunma:${dok} çalıştırma yetmez`, akisKok);
    }
  }
  if (secenek.eylem === "bulut_model") {
    if (profil.disa_acilma === "kapali" || profil.disa_acilma === "yerel_model") {
      return yetkiTalebiYaz(
        secenek.ajan,
        `disa_acilma:${profil.disa_acilma} bulut yasak`,
        akisKok,
      );
    }
  }

  const kul = harcamaKullanilan;
  const ekToken = secenek.maliyet?.token ?? 0;
  const ekTl = secenek.maliyet?.tl ?? 0;
  if (kul.token + ekToken > profil.harcama.token || kul.tl + ekTl > profil.harcama.tl) {
    return yetkiTalebiYaz(secenek.ajan, "harcama tavanı aşıldı", akisKok);
  }

  return { izin: true, karantina };
}

function yetkiTalebiYaz(
  ajan: string,
  neden: string,
  akisKok: string,
  karantina?: boolean,
): YetkiKontrolSonuc {
  const talep_id = ulid();
  const ts = new Date().toISOString();
  const olay = {
    v: 1,
    ts,
    ajan,
    is: "yetki",
    eylem: "yetki_talebi",
    durum: "hata",
    not: neden.slice(0, 200),
    talep_id,
    bloke: neden.slice(0, 80),
  };
  mkdirSync(akisKok, { recursive: true });
  appendFileSync(
    join(akisKok, `${ts.slice(0, 10)}.jsonl`),
    JSON.stringify(olay) + "\n",
    "utf8",
  );
  return { izin: false, talep_id, neden, karantina };
}

export interface GeriAlMadde {
  ts: string;
  eylem: string;
  is: string;
  dokundu?: string[];
  not?: string;
}

/** Liste üretir — uygulamaz */
export function geriAl(
  ajan: string,
  dakika: number,
  kayitKok = varsayilanKayit(),
  simdi: Date = new Date(),
): { ajan: string; maddeler: GeriAlMadde[]; onay: "bekliyor" } {
  const kesim = simdi.getTime() - dakika * 60_000;
  const maddeler: GeriAlMadde[] = [];
  if (!existsSync(kayitKok)) {
    return { ajan, maddeler, onay: "bekliyor" };
  }
  for (const f of readdirSync(kayitKok).filter((x) => x.endsWith(".jsonl"))) {
    const metin = readFileSync(join(kayitKok, f), "utf8");
    for (const satir of metin.split(/\r?\n/)) {
      if (!satir.trim()) continue;
      try {
        const o = JSON.parse(satir) as AkisSatir;
        if (o.ajan !== ajan) continue;
        if (Date.parse(o.ts) < kesim) continue;
        maddeler.push({
          ts: o.ts,
          eylem: o.eylem,
          is: o.is,
          dokundu: o.dokundu,
          not: o.not,
        });
      } catch {
        /* atla */
      }
    }
  }
  maddeler.sort((a, b) => b.ts.localeCompare(a.ts));
  return { ajan, maddeler, onay: "bekliyor" };
}

/** Kullanılmamış eksenleri listeler — kısma önerisi */
export function fazlaYetki(
  ajan: string,
  sonNGun: number,
  yetkiKok = varsayilanYetkiKok(),
  akisKok = varsayilanAkis(),
  kasaKok = varsayilanKasa(),
): { ajan: string; onerilen_kisit: string[]; kanit: string[] } {
  const kayit = yetkiOku(ajan, yetkiKok);
  if (!kayit) return { ajan, onerilen_kisit: ["profil yok"], kanit: [] };
  const profil = profilGetir(kayit, kasaKok);
  const olaylar: AkisSatir[] = [];
  if (existsSync(akisKok)) {
    for (const f of readdirSync(akisKok).filter((x) => x.endsWith(".jsonl"))) {
      for (const line of readFileSync(join(akisKok, f), "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          olaylar.push(JSON.parse(line) as AkisSatir);
        } catch {
          /* atla */
        }
      }
    }
  }
  const kesim = Date.now() - sonNGun * 86_400_000;
  const ilgili = olaylar.filter(
    (o) => o.ajan === ajan && Date.parse(o.ts) >= kesim,
  );
  const kanit: string[] = [];
  const onerilen: string[] = [];
  const yazdi = ilgili.some((o) => o.eylem === "yazma");
  const bulut = ilgili.some((o) => /bulut|openai|anthropic|gpt/i.test(o.not ?? ""));
  if (!yazdi && dokunmaYeterli(profil.dokunma.kurum ?? "yok", "yazma")) {
    onerilen.push("dokunma.kurum → salt_okunur");
    kanit.push(`${sonNGun}g yazma eylemi yok`);
  }
  if (!bulut && (profil.disa_acilma === "bulut_model" || profil.disa_acilma === "serbest")) {
    onerilen.push("disa_acilma → yerel_model");
    kanit.push(`${sonNGun}g bulut kullanımı yok`);
  }
  if (profil.harcama.token > 100_000 && ilgili.every((o) => !o.maliyet?.token)) {
    onerilen.push("harcama.token tavanını düşür");
    kanit.push("token maliyeti bildirilmemiş");
  }
  return { ajan, onerilen_kisit: onerilen, kanit };
}

export function harcamaEkle(
  ajan: string,
  ek: HarcamaTavan,
  yetkiKok = varsayilanYetkiKok(),
): void {
  const kayit = yetkiOku(ajan, yetkiKok);
  if (!kayit) return;
  const kul = kayit.harcama_kullanilan ?? { token: 0, tl: 0 };
  kayit.harcama_kullanilan = {
    token: kul.token + ek.token,
    tl: kul.tl + ek.tl,
  };
  writeFileSync(yetkiDosyaYol(ajan, yetkiKok), JSON.stringify(kayit, null, 2) + "\n", "utf8");
}
