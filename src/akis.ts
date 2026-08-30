import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { yetkiKontrol } from "./yetki.js";
import { varsayilanAkis } from "./yollar.js";

export const EYLEMLER = [
  "okuma",
  "yazma",
  "arama",
  "calistirma",
  "karar",
  "bekleme",
  "yetki_talebi",
] as const;
export type Eylem = (typeof EYLEMLER)[number];

export const DURUMLAR_AKIS = ["basladi", "suruyor", "bitti", "hata"] as const;
export type AkisDurum = (typeof DURUMLAR_AKIS)[number];

/** Akış olayı v1 — bilinmeyen alanlar korunur */
export interface AkisOlay {
  v: 1;
  ts: string;
  ajan: string;
  is: string;
  eylem: Eylem;
  durum: AkisDurum;
  dunya?: string;
  dokundu?: string[];
  guven?: number;
  maliyet?: { token?: number; tl?: number; [k: string]: unknown };
  bloke?: string | null;
  not?: string;
  [k: string]: unknown;
}

export interface AkisOkumaSonuc {
  olaylar: AkisOlay[];
  /** Bozuk / eksik zorunlu alan — atlandı */
  atlanan: number;
  dosyalar: string[];
}

const ZORUNLU = ["v", "ts", "ajan", "is", "eylem", "durum"] as const;

export function gunDosyaAdi(ts: string | Date = new Date()): string {
  const d =
    typeof ts === "string"
      ? ts.slice(0, 10)
      : ts.toISOString().slice(0, 10);
  return `${d}.jsonl`;
}

export function olayGecerliMi(o: unknown): o is AkisOlay {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  for (const k of ZORUNLU) {
    if (r[k] === undefined || r[k] === null || r[k] === "") return false;
  }
  if (r.v !== 1 && r.v !== "1") return false;
  if (typeof r.ts !== "string") return false;
  if (typeof r.ajan !== "string") return false;
  if (typeof r.is !== "string") return false;
  if (typeof r.eylem !== "string") return false;
  if (typeof r.durum !== "string") return false;
  if (!EYLEMLER.includes(r.eylem as Eylem)) return false;
  if (!DURUMLAR_AKIS.includes(r.durum as AkisDurum)) return false;
  return true;
}

/** Gevşek parse — bozuk satır atlanır */
export function satirParse(satir: string): AkisOlay | null {
  const t = satir.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t) as unknown;
    if (!olayGecerliMi(o)) return null;
    const n = { ...o, v: 1 as const };
    if (typeof n.not === "string" && n.not.length > 200) {
      n.not = n.not.slice(0, 200);
    }
    return n;
  } catch {
    return null;
  }
}

export type AkisBildirSonuc =
  | { izin: true; yol: string; satirNo: number }
  | { izin: false; talep_id: string; neden: string };

export function akisBildir(
  olay: Partial<AkisOlay> &
    Pick<AkisOlay, "ajan" | "is" | "eylem" | "durum">,
  akisKok = varsayilanAkis(),
  secenek: {
    atlaYetki?: boolean;
    yetkiKok?: string;
    kasaKok?: string;
    /** Varsayılan true: ayna/cron profilsiz telemetri yazar. MCP false geçer. */
    dosyaYoksaIzin?: boolean;
  } = {},
): AkisBildirSonuc {
  // yetki_talebi kendisi kontrol dışı
  if (!secenek.atlaYetki && olay.eylem !== "yetki_talebi") {
    const k = yetkiKontrol({
      ajan: olay.ajan,
      eylem: "akis",
      maliyet: olay.maliyet,
      yetkiKok: secenek.yetkiKok,
      kasaKok: secenek.kasaKok,
      akisKok,
      dosyaYoksaIzin: secenek.dosyaYoksaIzin ?? true,
    });
    if (!k.izin) {
      return {
        izin: false,
        talep_id: k.talep_id ?? "none",
        neden: k.neden ?? "yetki yok",
      };
    }
  }

  const tam: AkisOlay = {
    v: 1,
    ts: olay.ts ?? new Date().toISOString(),
    ajan: olay.ajan,
    is: olay.is,
    eylem: olay.eylem,
    durum: olay.durum,
    ...(olay.dunya !== undefined ? { dunya: olay.dunya } : {}),
    ...(olay.dokundu ? { dokundu: olay.dokundu } : {}),
    ...(olay.guven !== undefined ? { guven: olay.guven } : {}),
    ...(olay.maliyet ? { maliyet: olay.maliyet } : {}),
    ...(olay.bloke !== undefined ? { bloke: olay.bloke } : {}),
    ...(olay.not ? { not: olay.not.slice(0, 200) } : {}),
  };
  for (const [k, v] of Object.entries(olay)) {
    if (!(k in tam) && v !== undefined) (tam as Record<string, unknown>)[k] = v;
  }
  if (!olayGecerliMi(tam)) {
    throw new Error("event_report: required field missing or invalid");
  }

  mkdirSync(akisKok, { recursive: true });
  const ad = gunDosyaAdi(tam.ts);
  const yol = join(akisKok, ad);
  const onceki = existsSync(yol)
    ? readFileSync(yol, "utf8").split(/\r?\n/).filter((l) => l.trim()).length
    : 0;
  appendFileSync(yol, JSON.stringify(tam) + "\n", "utf8");
  return { izin: true, yol, satirNo: onceki + 1 };
}

export function akisOku(akisKok = varsayilanAkis()): AkisOkumaSonuc {
  if (!existsSync(akisKok)) {
    return { olaylar: [], atlanan: 0, dosyalar: [] };
  }
  const dosyalar = readdirSync(akisKok)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  const olaylar: AkisOlay[] = [];
  let atlanan = 0;
  for (const f of dosyalar) {
    const metin = readFileSync(join(akisKok, f), "utf8");
    for (const line of metin.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const o = satirParse(line);
      if (o) olaylar.push(o);
      else atlanan++;
    }
  }
  return { olaylar, atlanan, dosyalar };
}
