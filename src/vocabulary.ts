/**
 * Kelime dağarcığı — TEK KAYNAK.
 *
 * Ürünün dili İngilizce'ye taşınıyor (format standart olacaksa `raf_omru`
 * anahtarıyla olamaz). Göç sırasında iki şekil bir arada yaşayacağı için
 * eşleme tek yerde durur ve her iki yön de buradan TÜRETİLİR — aynı gerçeği
 * iki tabloda elle yazmak, birinin bayatlaması demektir.
 *
 * ⚠️ Kapsam: yalnızca ÜRÜNÜN SÖZLÜĞÜ (alan adları, enum değerleri).
 * Kullanıcının yazdığı içerik — başlık, iddia, gövde — ASLA çevrilmez.
 * Çevrilmiş bir iddia, kaynağına karşı doğrulanmış metin değildir; denetim
 * kaydını bozar. Bu ayrım ürünün tezidir, üslup tercihi değil.
 */

/** Olgu dosyasının frontmatter alanları (iç ad → tel/disk adı). */
export const FACT_FIELDS: Record<string, string> = {
  tur: "type",
  kapsam: "scope",
  dunya: "world",
  konu: "topic",
  baslik: "title",
  sahip: "owner",
  yazan: "author",
  tarih: "date",
  guven: "confidence",
  raf_omru: "shelf_life",
  dogrulandi: "verified",
  kaynak: "source",
  isaret: "pointer",
  alindi: "taken",
  miras: "inherited",
  kanit: "evidence",
  icerik_izi: "content_trace",
  baglar: "links",
  etki: "affects",
  yerine: "superseded_by",
  curuten: "invalidated_by",
  durum_notu: "state_note",
  sinir_notu: "boundary_note",
  curuk_notu: "rotten_note",
  bolunmedi: "not_split",
  uretici: "producer",
  yukseltme_bekliyor: "upgrade_pending",
  gezegen: "planet",
};

/** Yalnız cevapta geçen, diske yazılmayan alanlar. */
export const RESPONSE_FIELDS: Record<string, string> = {
  durum: "state",
  tazelik: "freshness",
  notlar: "notes",
  etiketler: "labels",
  sunum: "presentation",
  sonuclar: "results",
  toplam: "total",
  sinirUyarilari: "boundary_warnings",
  yerine_uid: "superseded_by",
  dis_kaynakli: "external_source",
  kaynak_turleri: "source_types",
  kaynak_daha: "source_more",
  indeks_tazelendi: "index_refreshed",
  olgu: "fact",
  izin: "allowed",
  yol: "path",
  karantina: "quarantined",
  neden: "reason",
  iddia: "claim",
  govde: "body",
  talep_id: "request_id",
  skor: "score",
};

export const WIRE_FIELDS: Record<string, string> = {
  ...FACT_FIELDS,
  ...RESPONSE_FIELDS,
};

export const TYPE_VALUES: Record<string, string> = {
  olgu: "fact",
  karar: "decision",
  kural: "rule",
  gozlem: "observation",
  sinir: "boundary",
};

export const SOURCE_TYPE_VALUES: Record<string, string> = {
  sql: "sql",
  dosya: "file",
  mail: "mail",
  olcum: "measurement",
  insan: "human",
  web: "web",
  pano: "clipboard",
  pencere: "window",
};

export const STATE_VALUES: Record<string, string> = {
  taze: "fresh",
  bayat: "stale",
  curuk: "rotten",
  emekli: "retired",
  yok: "not_found",
};

export const SCOPE_VALUES: Record<string, string> = {
  evrensel: "universal",
  kurum: "org",
  dunya: "world",
};

function tersine(m: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ic, dis] of Object.entries(m)) {
    // Aynı dış ada iki iç ad düşerse (yerine / yerine_uid) İLK tanım kazanır:
    // frontmatter alanı, cevap alanından önce gelir.
    if (!(dis in out)) out[dis] = ic;
  }
  return out;
}

export const FACT_FIELDS_IN = tersine(FACT_FIELDS);
export const RESPONSE_FIELDS_IN = tersine(RESPONSE_FIELDS);
export const TYPE_VALUES_IN = tersine(TYPE_VALUES);
export const SOURCE_TYPE_VALUES_IN = tersine(SOURCE_TYPE_VALUES);
export const SCOPE_VALUES_IN = tersine(SCOPE_VALUES);
export const STATE_VALUES_IN = tersine(STATE_VALUES);

function iceAl(v: unknown, harita: Record<string, string>): unknown {
  return typeof v === "string" ? (harita[v] ?? v) : v;
}

/**
 * Hoşgörülü okuyucu: frontmatter İngilizce de olabilir, Türkçe de.
 *
 * Göçün emniyet kemeri — dosyalar çevrilirken kasa hiç kırılmaz, iki şekil
 * yan yana durabilir. Bilinmeyen anahtara DOKUNULMAZ (şemanın kabul ettiği
 * ama yazıcının bilmediği alan sessizce kaybolmasın — 2026-08-03 `gezegen`
 * dersi).
 */
export function frontmatterIceAl(ham: unknown): unknown {
  if (!ham || typeof ham !== "object" || Array.isArray(ham)) return ham;
  const kayit = ham as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(kayit)) {
    const ic = FACT_FIELDS_IN[k] ?? k;
    if (ic === "tur") {
      out[ic] = iceAl(v, TYPE_VALUES_IN);
    } else if (ic === "kapsam") {
      out[ic] = iceAl(v, SCOPE_VALUES_IN);
    } else if (ic === "kaynak" && Array.isArray(v)) {
      out[ic] = v.map((k2) => {
        if (!k2 || typeof k2 !== "object") return k2;
        const alt: Record<string, unknown> = {};
        for (const [kk, vv] of Object.entries(k2 as Record<string, unknown>)) {
          const kic = FACT_FIELDS_IN[kk] ?? kk;
          alt[kic] = kic === "tur" ? iceAl(vv, SOURCE_TYPE_VALUES_IN) : vv;
        }
        return alt;
      });
    } else if (ic === "uretici" && v && typeof v === "object" && !Array.isArray(v)) {
      const alt: Record<string, unknown> = {};
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
        alt[FACT_FIELDS_IN[kk] ?? kk] = vv;
      }
      out[ic] = alt;
    } else {
      out[ic] = v;
    }
  }
  return out;
}

function disaYaz(v: unknown, harita: Record<string, string>): unknown {
  return typeof v === "string" ? (harita[v] ?? v) : v;
}

/**
 * Yazıcı: iç meta → disk İngilizce. Harita tek kaynak; alan listesi sabit değil.
 * Nesnede duran her alan (şema + bilinmeyen) yazılır — `gezegen` dersi.
 */
export function frontmatterDisaYaz(ham: unknown): unknown {
  if (!ham || typeof ham !== "object" || Array.isArray(ham)) return ham;
  const kayit = ham as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (kayit.uid !== undefined) out.uid = kayit.uid;

  for (const [ic, v] of Object.entries(kayit)) {
    if (ic === "uid" || v === undefined) continue;
    const dis = FACT_FIELDS[ic] ?? ic;
    if (ic === "tur") {
      out[dis] = disaYaz(v, TYPE_VALUES);
    } else if (ic === "kapsam") {
      out[dis] = disaYaz(v, SCOPE_VALUES);
    } else if (ic === "kaynak" && Array.isArray(v)) {
      out[dis] = v.map((k2) => {
        if (!k2 || typeof k2 !== "object") return k2;
        const alt: Record<string, unknown> = {};
        for (const [kk, vv] of Object.entries(k2 as Record<string, unknown>)) {
          if (vv === undefined) continue;
          const kdis = FACT_FIELDS[kk] ?? kk;
          alt[kdis] = kk === "tur" ? disaYaz(vv, SOURCE_TYPE_VALUES) : vv;
        }
        return alt;
      });
    } else if (ic === "uretici" && v && typeof v === "object" && !Array.isArray(v)) {
      const alt: Record<string, unknown> = {};
      for (const [kk, vv] of Object.entries(v as Record<string, unknown>)) {
        if (vv === undefined) continue;
        alt[FACT_FIELDS[kk] ?? kk] = vv;
      }
      out[dis] = alt;
    } else {
      out[dis] = v;
    }
  }
  return out;
}

function indeksAnahtarDis(ic: string): string {
  return FACT_FIELDS[ic] ?? RESPONSE_FIELDS[ic] ?? ic;
}

function indeksAnahtarIc(dis: string): string {
  return FACT_FIELDS_IN[dis] ?? RESPONSE_FIELDS_IN[dis] ?? dis;
}

/** İndeks satırı disk şekli — anahtarlar vocabulary'den türetilir. */
export function indeksSatirDisaYaz(
  s: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [ic, v] of Object.entries(s)) {
    if (v === undefined) continue;
    const dis = indeksAnahtarDis(ic);
    if (ic === "tur") out[dis] = disaYaz(v, TYPE_VALUES);
    else if (ic === "kapsam") out[dis] = disaYaz(v, SCOPE_VALUES);
    else if (ic === "durum") out[dis] = disaYaz(v, STATE_VALUES);
    else if (ic === "kaynak" && Array.isArray(v)) {
      out[dis] = v.map((k2) => {
        if (!k2 || typeof k2 !== "object") return k2;
        const alt: Record<string, unknown> = {};
        for (const [kk, vv] of Object.entries(k2 as Record<string, unknown>)) {
          if (vv === undefined) continue;
          const kdis = FACT_FIELDS[kk] ?? kk;
          alt[kdis] = kk === "tur" ? disaYaz(vv, SOURCE_TYPE_VALUES) : vv;
        }
        return alt;
      });
    } else out[dis] = v;
  }
  return out;
}

/** İndeks satırı hoşgörülü okuma — eski Türkçe ve yeni İngilizce. */
export function indeksSatirIceAl(ham: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ham)) {
    const ic = indeksAnahtarIc(k);
    if (ic === "tur") out[ic] = iceAl(v, TYPE_VALUES_IN);
    else if (ic === "kapsam") out[ic] = iceAl(v, SCOPE_VALUES_IN);
    else if (ic === "durum") out[ic] = iceAl(v, STATE_VALUES_IN);
    else if (ic === "kaynak" && Array.isArray(v)) {
      out[ic] = v.map((k2) => {
        if (!k2 || typeof k2 !== "object") return k2;
        const alt: Record<string, unknown> = {};
        for (const [kk, vv] of Object.entries(k2 as Record<string, unknown>)) {
          const kic = FACT_FIELDS_IN[kk] ?? kk;
          alt[kic] = kic === "tur" ? iceAl(vv, SOURCE_TYPE_VALUES_IN) : vv;
        }
        return alt;
      });
    } else out[ic] = v;
  }
  return out;
}
