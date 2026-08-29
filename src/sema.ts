/** Olgu kasası şema tanımları — Bölüm 1 */

export const TURLER = ["olgu", "karar", "kural", "gozlem", "sinir"] as const;
export type Tur = (typeof TURLER)[number];

export const KAPSAMLAR = ["evrensel", "kurum", "dunya"] as const;
export type Kapsam = (typeof KAPSAMLAR)[number];

export const KAYNAK_TURLERI = [
  "sql",
  "dosya",
  "mail",
  "olcum",
  "insan",
  "web",
  /** Bölüm 8 — işaret etme bağlamı */
  "pano",
  "pencere",
] as const;
export type KaynakTur = (typeof KAYNAK_TURLERI)[number];

export const DURUMLAR = ["taze", "bayat", "curuk", "emekli"] as const;
export type Durum = (typeof DURUMLAR)[number];

export interface Kaynak {
  tur: KaynakTur;
  isaret: string;
  alindi: string; // YYYY-MM-DD
  /** Gate #2: miras bağlam taşır, kanıt taşımaz */
  miras?: boolean;
  /** v1.1 — kaynağın o anki içeriğinden ≤200 karakter; tüketici eksikliği reddedemez */
  kanit?: string;
  /** v1.1 — `sha256:` + ilk 12 hex; tüketici eksikliği reddedemez */
  icerik_izi?: string;
}

export interface OlguMeta {
  uid: string;
  tur: Tur;
  kapsam: Kapsam;
  dunya: string | null;
  konu: string;
  baslik: string;
  sahip: string;
  yazan: string;
  tarih: string; // ISO 8601
  guven: number; // 0–1
  raf_omru: string; // "<n>g" | "suresiz"
  /** YYYY-MM-DD · null = bilinmiyor → bayat (Gate #2) */
  dogrulandi: string | null;
  kaynak: Kaynak[];
  baglar: string[];
  etki: string[];
  yerine: string | null;
  curuten: string | null;
  /** İzin verilen ek not alanı — durum DEĞİL (K3) */
  durum_notu?: string;
  /**
   * Plan B: demet göçü — içinde birden fazla iddia olabilir;
   * dokunulduğunda bölünecek. Durum alanı değil.
   */
  bolunmedi?: boolean;
  /**
   * Gate #5: gövdede sınır cümlesi var ama tür sinir değil —
   * K10 tetiklenmez; bilgi korunur.
   */
  sinir_notu?: string;
  /**
   * Gate #6 / K4: curuk yalnız açık karar.
   * Dolu + gerekçe (≥3 char) → durum=curuk; otomatik üretilmez.
   */
  curuk_notu?: string;
  /**
   * Bölüm 7 — kim/neyle üretti. Yoksa yükseltme kuyruğuna aday (kanit_yok).
   */
  uretici?: {
    tur: "deterministik" | "yerel_model" | "bulut_model" | "insan";
    ad: string;
    surum?: string;
  };
  /** Model imzalı iddialarda true — otomatik güven yükseltme yok */
  yukseltme_bekliyor?: boolean;
  /**
   * Holding galaksisi — gezegen künyesi. YALNIZ `konu === "dunya.kunye"` olan
   * kayıtlarda anlamlıdır; sıradan olgularda bulunmaz.
   *
   * 🔑 Neden şemada, neden bir `.ts` sabitinde değil: bir paneldeki bölüm
   * listesi elle tutulunca bayatlar — varlık kasada yaşarsa git'te izlenir,
   * bayatlarsa nöbetçi görür. Harita üretilir, elle çizilmez.
   */
  gezegen?: {
    /** Hex renk, `#rrggbb` */
    renk?: string;
    /** Tek emoji */
    ikon?: string;
    /** Üst gezegen adı — TEK KADEME (zincir yasak) */
    ust?: string;
    /** "Detaya in" hedefi (Faz 3) */
    yuzey?: string;
    /** Haritada kullanılacak kısa ad */
    kisa?: string;
  };
}

export interface Olgu {
  meta: OlguMeta;
  /** İddia + Neden + Nasıl uygulanır gövdesi */
  govde: string;
  /** Disk yolu (varsa) */
  yol?: string;
  /**
   * Okuma-yolu şema uyarıları. Yüklemeyi KIRMAZ — tek bozuk olgu kasayı
   * kilitlemesin. Yazma yolu (olguOner) sert reddeder.
   */
  uyarilar?: string[];
}

export type RafOmru =
  | { tur: "suresiz" }
  | { tur: "gun"; gun: number };

/** Raf ömrü varsayılanları (paket §4) */
export function varsayilanRafOmru(
  tur: Tur,
  kapsam: Kapsam,
  olcumMu = false,
): string {
  if (tur === "kural" && kapsam === "evrensel") return "suresiz";
  if (tur === "karar") return "suresiz";
  if (tur === "gozlem") return "14g";
  if (tur === "sinir") return "90g";
  if (tur === "olgu" && kapsam === "kurum") return olcumMu ? "30g" : "180g";
  if (tur === "olgu" && kapsam === "dunya") return "90g";
  if (tur === "olgu" && kapsam === "evrensel") return "180g";
  return "90g";
}

export function parseRafOmru(raw: string): RafOmru {
  if (raw === "suresiz") return { tur: "suresiz" };
  const m = /^(\d+)g$/.exec(raw.trim());
  if (!m) throw new Error(`Geçersiz raf_omru: ${raw}`);
  return { tur: "gun", gun: Number(m[1]) };
}

export function parseGun(isoDate: string): Date {
  // YYYY-MM-DD veya ISO datetime → gün başı (UTC+3 toleranslı: tarih kısmı)
  const day = isoDate.slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function gunFarki(
  from: string | null | undefined,
  to: Date = new Date(),
): number {
  if (!from || !/^\d{4}-\d{2}-\d{2}/.test(String(from))) {
    return Number.POSITIVE_INFINITY;
  }
  const a = parseGun(from).getTime();
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

export function slugify(baslik: string): string {
  return baslik
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function kapsamYolu(
  kapsam: Kapsam,
  dunya: string | null,
  slug: string,
): string {
  if (kapsam === "evrensel") return `evrensel/${slug}.md`;
  if (kapsam === "kurum") return `kurum/${slug}.md`;
  if (!dunya) throw new Error("kapsam=dunya iken dunya zorunlu");
  return `dunya/${dunya}/${slug}.md`;
}
