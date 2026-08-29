import {
  gunFarki,
  parseRafOmru,
  type Durum,
  type Olgu,
  type Tur,
} from "./sema.js";

/**
 * 0–100 tazelik puanı (onlydole/overdue formülü).
 * `durum` enum'u kalır (K5); bu türetilmiş skor.
 *
 * yas_gun         = dogrulandi'dan beri gün
 * kaynak_yasi_gun = en yeni kaynak.alindi yaşı (gün); kaynak yoksa 0
 * raf_omru suresiz → ttl cezası yok
 * dogrulandi null → null (K2: uydurma yok)
 */
export function tazelik(
  olgu: Olgu,
  simdi = new Date(),
): number | null {
  const dog = olgu.meta.dogrulandi;
  if (!dog || !/^\d{4}-\d{2}-\d{2}/.test(String(dog))) {
    return null;
  }

  const yas_gun = gunFarki(dog, simdi);
  let kaynak_yasi_gun: number | null = null;
  for (const k of olgu.meta.kaynak ?? []) {
    if (k.alindi && /^\d{4}-\d{2}-\d{2}/.test(k.alindi)) {
      const y = gunFarki(k.alindi, simdi);
      if (Number.isFinite(y)) {
        // en yeni kaynak = en küçük yaş
        if (kaynak_yasi_gun === null || y < kaynak_yasi_gun) {
          kaynak_yasi_gun = y;
        }
      }
    }
  }
  const kaynakYas = kaynak_yasi_gun ?? 0;

  const yas_cezasi = Math.min(
    30,
    Math.max(0, (yas_gun - kaynakYas) / 3),
  );

  let ttl_cezasi = 0;
  const raf = parseRafOmru(olgu.meta.raf_omru);
  if (raf.tur === "gun") {
    ttl_cezasi = Math.max(0, (yas_gun - raf.gun) * 2);
  }

  return Math.max(0, 100 - yas_cezasi - ttl_cezasi);
}

/** Test / denetim — cezaların bileşenleri */
export function tazelikBilesen(
  olgu: Olgu,
  simdi = new Date(),
): {
  tazelik: number | null;
  yas_gun: number | null;
  kaynak_yasi_gun: number;
  yas_cezasi: number;
  ttl_cezasi: number;
} | { tazelik: null } {
  const t = tazelik(olgu, simdi);
  if (t === null) return { tazelik: null };

  const yas_gun = gunFarki(olgu.meta.dogrulandi, simdi);
  let kaynak_yasi_gun: number | null = null;
  for (const k of olgu.meta.kaynak ?? []) {
    if (k.alindi && /^\d{4}-\d{2}-\d{2}/.test(k.alindi)) {
      const y = gunFarki(k.alindi, simdi);
      if (Number.isFinite(y) && (kaynak_yasi_gun === null || y < kaynak_yasi_gun)) {
        kaynak_yasi_gun = y;
      }
    }
  }
  const kaynakYas = kaynak_yasi_gun ?? 0;
  const yas_cezasi = Math.min(
    30,
    Math.max(0, (yas_gun - kaynakYas) / 3),
  );
  let ttl_cezasi = 0;
  const raf = parseRafOmru(olgu.meta.raf_omru);
  if (raf.tur === "gun") {
    ttl_cezasi = Math.max(0, (yas_gun - raf.gun) * 2);
  }
  return {
    tazelik: t,
    yas_gun,
    kaynak_yasi_gun: kaynakYas,
    yas_cezasi,
    ttl_cezasi,
  };
}

/**
 * Konu başına gösterilecek en fazla çift önerisi. Tavan üstü SESSİZCE
 * yutulmaz — kaç tanesinin gizlendiği listenin sonunda yazılır.
 */
export const ONERI_TAVANI = 5;

/** Aynı konuda birden fazla aktif olgu — bakılmalı (çelişki iddiası değil). */
export interface GozdenGecir {
  konu: string;
  uidler: string[];
  n: number;
  /** Çift önerisi — curuten alanı ASLA yazılmaz */
  oneriler: string[];
}

export interface DurumSonuc {
  uid: string;
  konu: string;
  durum: Durum;
  neden: string;
}

function emekliMi(olgu: Olgu, hepsi: Olgu[]): boolean {
  // K9/K5: curuten dolu → emekli; başka olgu yerine: bu uid → emekli
  if (olgu.meta.curuten) return true;
  return hepsi.some((o) => o.meta.yerine === olgu.meta.uid);
}

/**
 * K4 (Gate #6): aynı konuda N≥2 aktif sert tür → gözden geçir listesi.
 * Otomatik `curuk` YOK. Semantik çelişki Bölüm 10'da.
 */
export function gozdenGecir(hepsi: Olgu[]): GozdenGecir[] {
  const grup = new Map<string, Olgu[]>();
  for (const o of hepsi) {
    if (emekliMi(o, hepsi)) continue;
    if (o.meta.tur === "gozlem" || o.meta.tur === "sinir") continue;
    const arr = grup.get(o.meta.konu) ?? [];
    arr.push(o);
    grup.set(o.meta.konu, arr);
  }

  const out: GozdenGecir[] = [];
  for (const [konu, liste] of grup) {
    if (liste.length < 2) continue;
    const sirali = [...liste].sort((a, b) =>
      a.meta.tarih.localeCompare(b.meta.tarih),
    );
    /* GATE 2026-08-28: tavansız her ikili üretiliyordu — canlı kasada ölçüldü,
     * 29 grup / **447 öneri**, tek konuda 66. Okunmayan liste, olmayan listedir;
     * gürültü nöbetçinin en pahalı arızası. Tavan konur ama gizlenen sayı
     * GÖRÜNÜR kalır (bastırılan bulgu deseninin aynısı).
     * Sıra: en YENİ olguyu içeren çiftler önce — çelişki tipik olarak yeni
     * bilginin eskiyi geçersizleştirmesiyle doğar. */
    const ciftler: { eski: string; yeni: string; sira: number }[] = [];
    for (let i = 0; i < sirali.length; i++) {
      for (let j = i + 1; j < sirali.length; j++) {
        ciftler.push({
          eski: sirali[i]!.meta.uid,
          yeni: sirali[j]!.meta.uid,
          sira: j,
        });
      }
    }
    ciftler.sort((a, b) => b.sira - a.sira || a.eski.localeCompare(b.eski));
    const gosterilen = ciftler.slice(0, ONERI_TAVANI);
    const oneriler = gosterilen.map(
      (c) =>
        `aday: ${c.eski} ↔ ${c.yeni} — biri diğerini çürütüyorsa \`curuten\` elle yazılmalı; yeni olansa ${c.yeni}`,
    );
    if (ciftler.length > gosterilen.length) {
      oneriler.push(
        `… ${ciftler.length} çiftten ${gosterilen.length}'i gösterildi, ${ciftler.length - gosterilen.length} tanesi gizlendi (konuda ${sirali.length} aktif olgu var — önce bunları ayıkla)`,
      );
    }
    out.push({
      konu,
      uidler: liste.map((o) => o.meta.uid),
      n: liste.length,
      oneriler,
    });
  }
  return out.sort((a, b) => b.n - a.n || a.konu.localeCompare(b.konu, "tr"));
}

/** @deprecated Gate #6 — gozdenGecir kullan */
export const celiski = gozdenGecir;

/** Açık karar: curuk_notu dolu + gerekçe → curuk; aksi halde otomatik curuk yok */
export function acikCurukMu(olgu: Olgu): boolean {
  const not = olgu.meta.curuk_notu?.trim();
  return !!not && not.length >= 3;
}

/** K3 — durum türetilir, yazılmaz */
export function durum(olgu: Olgu, hepsi: Olgu[], simdi = new Date()): DurumSonuc {
  if (emekliMi(olgu, hepsi)) {
    const neden = olgu.meta.curuten
      ? `curuten=${olgu.meta.curuten}`
      : `yerine ile geçersiz kılındı`;
    return { uid: olgu.meta.uid, konu: olgu.meta.konu, durum: "emekli", neden };
  }

  if (acikCurukMu(olgu)) {
    return {
      uid: olgu.meta.uid,
      konu: olgu.meta.konu,
      durum: "curuk",
      neden: `açık karar: ${olgu.meta.curuk_notu!.trim()}`,
    };
  }

  const raf = parseRafOmru(olgu.meta.raf_omru);

  // Gate #2: dogrulandi bilinmiyor → bayat (suresiz bile taze sayılmaz)
  const dog = olgu.meta.dogrulandi;
  if (!dog || !/^\d{4}-\d{2}-\d{2}/.test(String(dog))) {
    return {
      uid: olgu.meta.uid,
      konu: olgu.meta.konu,
      durum: "bayat",
      neden: "dogrulandi bilinmiyor",
    };
  }

  if (raf.tur === "suresiz") {
    return {
      uid: olgu.meta.uid,
      konu: olgu.meta.konu,
      durum: "taze",
      neden: "suresiz",
    };
  }

  const yas = gunFarki(dog, simdi);
  if (yas > raf.gun) {
    return {
      uid: olgu.meta.uid,
      konu: olgu.meta.konu,
      durum: "bayat",
      neden: `${yas}g > raf ${raf.gun}g`,
    };
  }

  return {
    uid: olgu.meta.uid,
    konu: olgu.meta.konu,
    durum: "taze",
    neden: `${yas}g ≤ ${raf.gun}g`,
  };
}

export function durumlar(hepsi: Olgu[], simdi = new Date()): DurumSonuc[] {
  return hepsi.map((o) => durum(o, hepsi, simdi));
}

/** K10: sinir türü — o konuda iddia üretmek yasak */
export function sinirlar(hepsi: Olgu[]): Olgu[] {
  return hepsi.filter(
    (o) => o.meta.tur === "sinir" && !emekliMi(o, hepsi),
  );
}

export function sinirUyarisi(
  hepsi: Olgu[],
  konu: string,
  yazilanTur: Tur,
): string | null {
  if (yazilanTur === "sinir" || yazilanTur === "gozlem") return null;
  const engel = sinirlar(hepsi).find((s) => s.meta.konu === konu);
  if (!engel) return null;
  return `K10: konu '${konu}' üzerinde aktif sinir var (uid=${engel.meta.uid}) — iddia üretmek yasak`;
}

export function gozdenGecirMarkdown(
  hepsi: Olgu[],
  liste: GozdenGecir[] = gozdenGecir(hepsi),
): string {
  const byUid = new Map(hepsi.map((o) => [o.meta.uid, o]));
  const bloklar = liste.map((g, i) => {
    const uyeler = g.uidler
      .map((uid) => byUid.get(uid))
      .filter((o): o is Olgu => !!o);
    const satırlar = uyeler
      .map(
        (o) =>
          `- **${o.meta.baslik}**\n  - uid: \`${o.meta.uid}\` · tur: \`${o.meta.tur}\` · yol: \`${o.yol ?? "?"}\``,
      )
      .join("\n");
    const oneriBlok = g.oneriler?.length
      ? "\n" + g.oneriler.map((s) => `- ${s}`).join("\n") + "\n"
      : "";
    return `## ${i + 1}. \`${g.konu}\` — ${g.n} olgu, bakılmalı

${satırlar}
${oneriBlok}`;
  });

  return `# Gözden geçir listesi (Gate #6 / K4)

**Grup:** ${liste.length}
**Anlam:** aynı \`konu\` altında birden fazla aktif olgu — çelişki iddiası **değil**, inceleme kuyruğu.
**curuk:** yalnız açık \`curuk_notu\` + gerekçe ile; bu tarama otomatik curuk üretmez.

${liste.length === 0 ? "_Bakılacak grup yok._\n" : bloklar.join("\n---\n\n")}
`;
}

export function taraHepsi(hepsi: Olgu[], simdi = new Date()) {
  const d = durumlar(hepsi, simdi);
  const otomatikCuruk = d.filter(
    (x) => x.durum === "curuk" && !hepsi.find((o) => o.meta.uid === x.uid)?.meta.curuk_notu,
  );
  return {
    durumlar: d,
    gozdenGecir: gozdenGecir(hepsi),
    sinirlar: sinirlar(hepsi).map((o) => ({
      uid: o.meta.uid,
      konu: o.meta.konu,
      baslik: o.meta.baslik,
    })),
    otomatikCurukSayisi: otomatikCuruk.length,
    curukSayisi: d.filter((x) => x.durum === "curuk").length,
  };
}
