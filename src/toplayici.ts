import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { akisOku, type AkisOlay } from "./akis.js";
import { olguDosyaMetni } from "./dosya.js";
import { konuBelirleFromGirdi } from "./konu.js";
import {
  slugify,
  varsayilanRafOmru,
  type Olgu,
  type OlguMeta,
  type Tur,
} from "./sema.js";
import { ulid } from "./ulid.js";
import {
  varsayilanAkis,
  varsayilanKasa,
  varsayilanKayit,
} from "./yollar.js";

export interface AnlikAjan {
  ajan: string;
  is: string;
  eylem: string;
  durum: string;
  dunya?: string;
  dokundu?: string[];
  ts: string;
  not?: string;
}

export interface Yakinlik {
  dosya: string;
  ajanlar: string[];
  isler: string[];
}

export interface ToplayiciSonuc {
  anlik: AnlikAjan[];
  yakinlik: Yakinlik[];
  oneriler: string[];
  kayitYolu: string;
  olaySayisi: number;
  atlanan: number;
}

function isAnahtari(o: AkisOlay): string {
  return `${o.ajan}::${o.is}`;
}

/** Hangi ajan canlı / ne yapıyor */
export function anlikDurum(olaylar: AkisOlay[]): AnlikAjan[] {
  const son = new Map<string, AkisOlay>();
  for (const o of olaylar) {
    son.set(isAnahtari(o), o);
  }
  return [...son.values()]
    .filter((o) => o.durum === "basladi" || o.durum === "suruyor")
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .map((o) => ({
      ajan: o.ajan,
      is: o.is,
      eylem: o.eylem,
      durum: o.durum,
      dunya: o.dunya,
      dokundu: o.dokundu,
      ts: o.ts,
      not: o.not,
    }));
}

/** Aynı dosyaya dokunan ajanlar */
export function yakinlikHesapla(olaylar: AkisOlay[]): Yakinlik[] {
  const map = new Map<string, { ajanlar: Set<string>; isler: Set<string> }>();
  for (const o of olaylar) {
    for (const d of o.dokundu ?? []) {
      const g = map.get(d) ?? { ajanlar: new Set(), isler: new Set() };
      g.ajanlar.add(o.ajan);
      g.isler.add(o.is);
      map.set(d, g);
    }
  }
  return [...map.entries()]
    .filter(([, g]) => g.ajanlar.size >= 2)
    .map(([dosya, g]) => ({
      dosya,
      ajanlar: [...g.ajanlar].sort(),
      isler: [...g.isler].sort(),
    }))
    .sort((a, b) => b.ajanlar.length - a.ajanlar.length);
}

function isOlaylari(olaylar: AkisOlay[], is: string, ajan?: string): AkisOlay[] {
  return olaylar.filter(
    (o) => o.is === is && (ajan ? o.ajan === ajan : true),
  );
}

/**
 * durum:bitti → _oneriler/ taslağı.
 * Kasaya doğrudan YAZMAZ.
 */
export function kemiklesmeTaslagi(
  bitti: AkisOlay,
  tum: AkisOlay[],
  satirNo: number,
  gunDosya: string,
): Olgu {
  const ilgili = isOlaylari(tum, bitti.is, bitti.ajan);
  const kararMi = ilgili.some((o) => o.eylem === "karar");
  const tur: Tur = kararMi ? "karar" : "olgu";
  const dunya = bitti.dunya ?? "genel";
  const kapsam =
    dunya === "kurum" || !bitti.dunya
      ? ("kurum" as const)
      : ("dunya" as const);
  const baslik = [bitti.is, bitti.not].filter(Boolean).join(" — ").slice(0, 120);
  const konu = konuBelirleFromGirdi({
    description: baslik,
    dosyaAd: bitti.is,
    baslik,
    kapsam: kapsam === "kurum" ? "kurum" : "dunya",
    dunya: kapsam === "dunya" ? dunya : null,
  });

  const kaynak = ilgili.map((o, i) => ({
    tur: "olcum" as const,
    isaret: `akis://${gunDosya}#${satirNo > 0 ? satirNo : i + 1}`,
    alindi: (o.ts ?? bitti.ts).slice(0, 10),
  }));
  if (kaynak.length === 0) {
    kaynak.push({
      tur: "olcum",
      isaret: `akis://${gunDosya}#${satirNo}`,
      alindi: bitti.ts.slice(0, 10),
    });
  }

  const meta: OlguMeta = {
    uid: ulid(),
    tur,
    kapsam: kapsam === "kurum" ? "kurum" : "dunya",
    dunya: kapsam === "dunya" ? dunya : null,
    konu,
    baslik: baslik || bitti.is,
    sahip: "patron",
    yazan: bitti.ajan,
    tarih: bitti.ts,
    guven: typeof bitti.guven === "number" ? bitti.guven : 0.6,
    raf_omru: varsayilanRafOmru(tur, kapsam === "kurum" ? "kurum" : "dunya"),
    dogrulandi: bitti.ts.slice(0, 10),
    kaynak,
    baglar: [],
    etki: [],
    yerine: null,
    curuten: null,
    durum_notu: "toplayıcı kemikleşme taslağı — onay bekliyor",
  };

  const govde = `${meta.baslik}

**Neden:** akışta \`durum: bitti\` — ${ilgili.length} olay kemikleşti.
**Nasıl uygulanır:** \`_oneriler/\` onayından sonra kasaya alınır.

Dokunan: ${(bitti.dokundu ?? []).join(", ") || "—"}
`;

  return { meta, govde };
}

export function oneriYaz(
  olgu: Olgu,
  kasaKok: string,
  secenek: { karantina?: boolean } = {},
): string {
  const klasor = secenek.karantina ? "_karantina" : "_oneriler";
  const dir = join(kasaKok, klasor);
  mkdirSync(dir, { recursive: true });
  const slug = slugify(olgu.meta.baslik) || olgu.meta.uid.slice(0, 8);
  const rel = `${klasor}/${slug}-${olgu.meta.uid.slice(-6)}.md`;
  writeFileSync(join(kasaKok, rel), olguDosyaMetni(olgu), "utf8");
  return rel;
}

/** Halka tampon — son maxDosya gün dosyası */
export function kayitHalka(
  olaylar: AkisOlay[],
  kayitKok: string,
  maxDosya = 14,
): string {
  mkdirSync(kayitKok, { recursive: true });
  const ad = `toplayici-${new Date().toISOString().slice(0, 10)}.jsonl`;
  const yol = join(kayitKok, ad);
  const metin = olaylar.map((o) => JSON.stringify(o)).join("\n");
  appendFileSync(yol, (metin ? metin + "\n" : ""), "utf8");

  const dosyalar = readdirSync(kayitKok)
    .filter((f) => f.startsWith("toplayici-") && f.endsWith(".jsonl"))
    .sort();
  while (dosyalar.length > maxDosya) {
    const eski = dosyalar.shift()!;
    try {
      unlinkSync(join(kayitKok, eski));
    } catch {
      /* ignore */
    }
  }
  return yol;
}

export function toplayiciCalistir(secenek: {
  akisKok?: string;
  kasaKok?: string;
  kayitKok?: string;
  /** true ise bitti olaylarından öneri yazar */
  kemikles?: boolean;
} = {}): ToplayiciSonuc {
  const akisKok = secenek.akisKok ?? varsayilanAkis();
  const kasaKok = secenek.kasaKok ?? varsayilanKasa();
  const kayitKok = secenek.kayitKok ?? varsayilanKayit();
  const kemikles = secenek.kemikles !== false;

  const { olaylar, atlanan, dosyalar } = akisOku(akisKok);
  const anlik = anlikDurum(olaylar);
  const yakinlik = yakinlikHesapla(olaylar);
  const oneriler: string[] = [];

  if (kemikles) {
    const bitenler = olaylar.filter((o) => o.durum === "bitti");
    // aynı is+ajan için bir öneri
    const gorulen = new Set<string>();
    for (const b of bitenler) {
      const key = isAnahtari(b);
      if (gorulen.has(key)) continue;
      gorulen.add(key);
      const gun = (b.ts ?? "").slice(0, 10) || dosyalar[0]?.replace(/\.jsonl$/, "") || "bilinmiyor";
      const taslak = kemiklesmeTaslagi(b, olaylar, 0, `${gun}.jsonl`);
      oneriler.push(oneriYaz(taslak, kasaKok));
    }
  }

  const kayitYolu = kayitHalka(olaylar, kayitKok);
  // anlık durum snapshot (kokpit için)
  const anlikYol = join(kayitKok, "anlik.json");
  writeFileSync(
    anlikYol,
    JSON.stringify({ ts: new Date().toISOString(), anlik, yakinlik }, null, 2),
    "utf8",
  );

  return {
    anlik,
    yakinlik,
    oneriler,
    kayitYolu,
    olaySayisi: olaylar.length,
    atlanan,
  };
}

export function kasaIcineDustuMu(yol: string): boolean {
  return yol.includes("_oneriler") || yol.startsWith("_oneriler");
}

export function oneriKasayaDegil(yol: string, kasaKok: string): boolean {
  if (!yol.includes("_oneriler")) return false;
  const abs = join(kasaKok, yol);
  return existsSync(abs) && !yol.match(/^evrensel\/|^kurum\/|^dunya\//);
}
