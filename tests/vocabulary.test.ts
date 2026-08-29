/**
 * Hoşgörülü okuyucu — göçün emniyet kemeri.
 *
 * Kasanın dili İngilizce'ye taşınıyor (patron kararı 2026-08-29): format
 * standart olacaksa `raf_omru`/`guven` anahtarlarıyla olamaz. 398 olgu +
 * 21 modül + kokpitin 4 dosyası tek hamlede çevrilemez; o yüzden ÖNCE
 * okuyucu iki şekli birden kabul eder. Böylece dosyalar çevrilirken kasa
 * hiçbir an kırılmaz ve göç geri alınabilir kalır.
 *
 * ⚠️ Çevrilen yalnız SÖZLÜK. Başlık, iddia ve gövde kullanıcının dilinde
 * kalır — çevrilmiş bir iddia kaynağına karşı doğrulanmış metin değildir.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { frontmatterYaz, parseOlguDosya, yukleKasa } from "../src/dosya.js";
import type { OlguMeta } from "../src/sema.js";
import { FACT_FIELDS } from "../src/vocabulary.js";

const TMPLER: string[] = [];
afterEach(() => {
  while (TMPLER.length) {
    try {
      rmSync(TMPLER.pop()!, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
});

const TURKCE = `---
uid: 01VOCABTEST0000000000000000
tur: kural
kapsam: kurum
dunya: null
konu: policy.shipping
baslik: "Kargo suresi 30 gundur"
sahip: patron
yazan: agent@example
tarih: 2026-08-01T00:00:00.000Z
guven: 0.9
raf_omru: 180g
dogrulandi: 2026-08-01
kaynak:
  - tur: dosya
    isaret: "policy/x.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: null
curuten: null
---

Kargo suresi teslimden itibaren 30 gundur.
`;

/** Aynı olgu, İngilizce sözlükle. İÇERİK birebir aynı — çeviri sözlükte. */
const INGILIZCE = `---
uid: 01VOCABTEST0000000000000000
type: rule
scope: org
world: null
topic: policy.shipping
title: "Kargo suresi 30 gundur"
owner: patron
author: agent@example
date: 2026-08-01T00:00:00.000Z
confidence: 0.9
shelf_life: 180g
verified: 2026-08-01
source:
  - type: file
    pointer: "policy/x.md#L1"
    taken: 2026-08-01
links: []
affects: []
superseded_by: null
invalidated_by: null
---

Kargo suresi teslimden itibaren 30 gundur.
`;

describe("hoşgörülü okuyucu: iki şekil de yüklenir", () => {
  it("İngilizce frontmatter, Türkçesiyle BİREBİR aynı meta üretir", () => {
    const tr = parseOlguDosya(TURKCE, "tr.md");
    const en = parseOlguDosya(INGILIZCE, "en.md");

    expect(en.meta).toEqual(tr.meta);
    expect(en.govde).toBe(tr.govde);
  });

  it("değerler de çevrilir: type/scope ve kaynak türü", () => {
    const en = parseOlguDosya(INGILIZCE, "en.md").meta;
    expect(en.tur).toBe("kural");
    expect(en.kapsam).toBe("kurum");
    expect(en.kaynak[0]!.tur).toBe("dosya");
    expect(en.kaynak[0]!.isaret).toBe("policy/x.md#L1");
  });

  it("kullanıcının içeriğine DOKUNULMAZ", () => {
    const en = parseOlguDosya(INGILIZCE, "en.md");
    expect(en.meta.baslik).toBe("Kargo suresi 30 gundur");
    expect(en.govde).toBe("Kargo suresi teslimden itibaren 30 gundur.");
  });

  it("bilinmeyen alan sessizce kaybolmaz", () => {
    const ek = INGILIZCE.replace(
      "invalidated_by: null",
      "invalidated_by: null\nbilinmeyen_alan: korunmali",
    );
    const m = parseOlguDosya(ek, "en.md").meta as unknown as Record<string, unknown>;
    expect(m.bilinmeyen_alan).toBe("korunmali");
  });

  it("karışık kasa: bir dosya Türkçe, biri İngilizce — ikisi de yüklenir", () => {
    const kasa = mkdtempSync(join(tmpdir(), "vocab-kasa-"));
    TMPLER.push(kasa);
    writeFileSync(join(kasa, "tr.md"), TURKCE, "utf8");
    writeFileSync(
      join(kasa, "en.md"),
      INGILIZCE.replace("01VOCABTEST0000000000000000", "01VOCABTEST0000000000000001"),
      "utf8",
    );

    const hepsi = yukleKasa(kasa);
    expect(hepsi).toHaveLength(2);
    expect(hepsi.every((o) => o.meta.tur === "kural")).toBe(true);
    expect(hepsi.every((o) => o.meta.kaynak[0]!.tur === "dosya")).toBe(true);
  });
});

/** FACT_FIELDS iç adları — yazıcı bunları diske anahtar olarak basmamalı. */
const TURKCE_ANAHTAR = Object.entries(FACT_FIELDS)
  .filter(([ic, dis]) => ic !== dis)
  .map(([ic]) => ic);

function yamlAnahtarlari(fm: string): string[] {
  const keys: string[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
      keys.push(k);
      walk(vv);
    }
  };
  walk(YAML.parse(fm));
  return keys;
}

function doluMeta(): OlguMeta {
  return {
    uid: "01YAYIN1AYAZ00000000000001",
    tur: "kural",
    kapsam: "kurum",
    dunya: "test",
    konu: "policy.shipping",
    baslik: "Kargo suresi 30 gundur",
    sahip: "patron",
    yazan: "agent@example",
    tarih: "2026-08-01T00:00:00.000Z",
    guven: 0.9,
    raf_omru: "180g",
    dogrulandi: "2026-08-01",
    kaynak: [
      {
        tur: "dosya",
        isaret: "policy/x.md#L1",
        alindi: "2026-08-01",
        miras: true,
        kanit: "shelf excerpt",
        icerik_izi: "sha256:abcdef123456",
      },
    ],
    baglar: ["01YAYIN1AYAZ00000000000002"],
    etki: ["policy.returns"],
    yerine: null,
    curuten: null,
    durum_notu: "draft from fact_propose",
    bolunmedi: true,
    sinir_notu: "do not infer",
    curuk_notu: "replaced by later measurement",
    uretici: { tur: "insan", ad: "emek", surum: "1" },
    yukseltme_bekliyor: true,
    gezegen: { renk: "#123456", ikon: "🧪", ust: "ornek", yuzey: "panel", kisa: "tst" },
  };
}

describe("YAYIN/1 A: yazıcı İngilizce", () => {
  it("yaz → oku: her alan hayatta (round-trip)", () => {
    const meta = doluMeta();
    const geri = parseOlguDosya(`---\n${frontmatterYaz(meta)}\n---\n\nGovde.\n`).meta;
    expect(geri).toEqual(meta);
  });

  it("yazılan frontmatter'da Türkçe anahtar yok", () => {
    const fm = frontmatterYaz(doluMeta());
    const anahtarlar = yamlAnahtarlari(fm);
    const sizan = anahtarlar.filter((k) => TURKCE_ANAHTAR.includes(k));
    expect(sizan).toEqual([]);
    expect(fm).toContain("type: rule");
    expect(fm).toContain("scope: org");
    expect(fm).toContain("confidence: 0.9");
    expect(fm).toContain("shelf_life: 180g");
    expect(fm).toContain("type: file");
    expect(fm).toContain("pointer: policy/x.md#L1");
    expect(fm).toContain("planet:");
  });

  it("opsiyonel alan bekçisi: şemadaki her opsiyonel alan yazılıp geri okunur", () => {
    const opsiyonel: (keyof OlguMeta)[] = [
      "durum_notu",
      "bolunmedi",
      "sinir_notu",
      "curuk_notu",
      "uretici",
      "yukseltme_bekliyor",
      "gezegen",
    ];
    const meta = doluMeta();
    const geri = parseOlguDosya(`---\n${frontmatterYaz(meta)}\n---\n\nGovde.\n`).meta;
    for (const alan of opsiyonel) {
      expect(geri[alan], alan).toEqual(meta[alan]);
    }
    const kaynak = geri.kaynak[0]!;
    expect(kaynak.miras).toBe(true);
    expect(kaynak.kanit).toBe("shelf excerpt");
    expect(kaynak.icerik_izi).toBe("sha256:abcdef123456");
  });
});
