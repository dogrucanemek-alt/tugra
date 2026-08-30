/**
 * YAYIN/10 — jsonCevap tek kapı. Desen listesi yok; çıkan metin taransın.
 * ⛔ A düzeltilmeden fact_read (şema bozuk) satırı kırmızı yanmalı.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { akisBildir } from "../src/akis.js";
import { tugraArac } from "../src/mcp.js";
import { WIRE_FIELDS } from "../src/vocabulary.js";
import { tempKok, temizle } from "./helpers.js";

const ORTAM = [
  "TUGRA_KASA",
  "TUGRA_AKIS",
  "TUGRA_YETKI",
  "TUGRA_KOKPIT",
  "TALAMUS_KASA",
  "TALAMUS_AKIS",
  "TALAMUS_YETKI",
  "TALAMUS_KOKPIT",
  "MULTI_YETKI",
] as const;

const TMPLER: string[] = [];
let yedek: Record<string, string | undefined> = {};

beforeEach(() => {
  yedek = {};
  for (const k of ORTAM) {
    yedek[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ORTAM) {
    const v = yedek[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  while (TMPLER.length) {
    try {
      temizle(TMPLER.pop()!);
    } catch {
      /* */
    }
  }
});

function tmp(): string {
  const d = tempKok();
  TMPLER.push(d);
  return d;
}

/** Beyaz liste — dar, her madde gerekçeli. Token silinir, cümle kalır. */
const BEYAZ: { re: RegExp; neden: string }[] = [
  { re: /hafıza:\/\//g, neden: "protokol öneki; disk sözleşmesi (hafiza:// ile eş)" },
  { re: /_oneriler/g, neden: "taslak dizin adı, diske yazılıyor" },
  { re: /\bkasa\//g, neden: "kasa kökü yol parçası" },
  { re: /\bakis\//g, neden: "akis kökü yol parçası" },
  { re: /\byetki\//g, neden: "yetki kökü yol parçası" },
];

const TURKCE_HARF = /[çğşıöüÇĞŞİÖÜ]/;
/** Çatal kabul: harf kaçırırsa yedek. Liste tek başına kural değil. */
const ASCII_URUN =
  /\b(yok|talep|zorunlu|eksik|gecersiz|hata|bulunamadi|yazilmadi|izin|olmali|akis_bildir|ister|nesne|disi)\b/i;

const BEKLENEN_ANAHTAR = new Set<string>([
  ...Object.values(WIRE_FIELDS),
  ...Object.keys(WIRE_FIELDS),
  "uid",
  "meta",
  "ok",
  "blocked",
  "note",
  "touched",
  "confidence",
  "warnings",
]);

function beyazSil(s: string): string {
  let t = s;
  for (const b of BEYAZ) t = t.replace(b.re, "");
  return t;
}

function anahtarlar(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) {
    for (const x of v) anahtarlar(x, out);
    return out;
  }
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out.push(k);
      anahtarlar(val, out);
    }
  }
  return out;
}

export function telKirli(metin: string): string[] {
  const kirli: string[] = [];
  const ham = beyazSil(metin);
  for (const satir of ham.split(/\r?\n/)) {
    const s = satir.trim();
    if (!s) continue;
    if (TURKCE_HARF.test(s) || ASCII_URUN.test(s)) kirli.push(s);
  }
  try {
    const j = JSON.parse(metin) as unknown;
    for (const k of new Set(anahtarlar(j))) {
      if (BEKLENEN_ANAHTAR.has(k)) continue;
      const ad = beyazSil(k);
      if (TURKCE_HARF.test(ad) || ASCII_URUN.test(ad)) {
        kirli.push(`anahtar:${k}`);
      }
    }
  } catch {
    /* throw metni JSON olmayabilir */
  }
  return kirli;
}

function saglamOlgu(kasa: string): void {
  mkdirSync(kasa, { recursive: true });
  writeFileSync(
    join(kasa, "shipping.md"),
    `---
uid: 01YAYIN10OK0000000000000001
type: rule
scope: org
world: null
topic: policy.shipping
title: "Shipping takes 30 days"
owner: owner
author: ci@example
date: 2026-08-01T00:00:00.000Z
confidence: 0.9
shelf_life: 180g
verified: 2026-08-01
source:
  - type: file
    pointer: "policy/shipping.md#L1"
    taken: 2026-08-01
links: []
affects: []
superseded_by: null
invalidated_by: null
---

Shipping takes 30 days.
`,
    "utf8",
  );
}

function bozukOlgu(kasa: string): void {
  mkdirSync(kasa, { recursive: true });
  writeFileSync(
    join(kasa, "broken.md"),
    `---
uid: 01YAYIN10BAD00000000000001
type: rule
scope: org
world: null
topic: policy.schema
title: "Broken schema fixture"
owner: owner
author: ci@example
date: 2026-08-01T00:00:00.000Z
confidence: 5
shelf_life: 180g
verified: 2026-08-01
source:
  - "not-an-object"
  - type: uydurma-tur
    pointer: "policy/x.md#L1"
    taken: 2026-08-01
links: []
affects: []
superseded_by: null
invalidated_by: null
---

This fact is intentionally off-schema.
`,
    "utf8",
  );
}

async function aracMetni(
  ad: Parameters<typeof tugraArac>[0],
  args: Record<string, unknown>,
  secenek: Parameters<typeof tugraArac>[2],
): Promise<string> {
  try {
    const c = await tugraArac(ad, args, secenek);
    return c.content[0]!.text;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("YAYIN/10 B: jsonCevap tek kapı — Türkçe 0", () => {
  it("senaryo matrisi: dört araç, çıkan tam metin", async () => {
    const saglamKok = tmp();
    const saglamKasa = join(saglamKok, "kasa");
    const saglamAkis = join(saglamKok, "akis");
    mkdirSync(saglamAkis, { recursive: true });
    saglamOlgu(saglamKasa);
    process.env.TUGRA_KOKPIT = saglamKok;
    const saglam = { kasaKok: saglamKasa, akisKok: saglamAkis };

    const bozukKok = tmp();
    const bozukKasa = join(bozukKok, "kasa");
    const bozukAkis = join(bozukKok, "akis");
    mkdirSync(bozukAkis, { recursive: true });
    bozukOlgu(bozukKasa);
    const bozuk = { kasaKok: bozukKasa, akisKok: bozukAkis };

    const fmKok = tmp();
    const fmKasa = join(fmKok, "kasa");
    const fmAkis = join(fmKok, "akis");
    mkdirSync(fmKasa, { recursive: true });
    mkdirSync(fmAkis, { recursive: true });
    writeFileSync(join(fmKasa, "notes.md"), "plain note, no frontmatter\n", "utf8");
    const fm = { kasaKok: fmKasa, akisKok: fmAkis };

    const yetkiKokpit = tmp();
    const yKasa = join(yetkiKokpit, "kasa");
    const yAkis = join(yetkiKokpit, "akis");
    const yYetki = join(yetkiKokpit, "yetki");
    mkdirSync(yYetki, { recursive: true });
    mkdirSync(yAkis, { recursive: true });
    saglamOlgu(yKasa);
    writeFileSync(
      join(yYetki, "bozuk@box.json"),
      JSON.stringify({
        ajan: "",
        seviye: "A9",
        baslangic: "not-iso",
        sona_erme: "suresiz",
      }),
      "utf8",
    );
    const yonetilen = { kasaKok: yKasa, akisKok: yAkis, yetkiKok: yYetki };

    const propose = {
      type: "rule",
      topic: "policy.returns",
      agent: "stranger@box",
      title: "Returns within 14 days",
      body: "Returns are accepted within 14 days.",
      source: [
        { type: "file", pointer: "policy/returns.md#L1", taken: "2026-08-29" },
      ],
    };

    const cagrilar: { ad: string; metin: Promise<string> }[] = [
      { ad: "saglam fact_search", metin: aracMetni("fact_search", { query: "shipping" }, saglam) },
      {
        ad: "saglam fact_read",
        metin: aracMetni(
          "fact_read",
          { uid: "01YAYIN10OK0000000000000001", agent: "stranger@box" },
          saglam,
        ),
      },
      { ad: "saglam fact_propose", metin: aracMetni("fact_propose", propose, saglam) },
      {
        ad: "saglam event_report",
        metin: aracMetni(
          "event_report",
          { agent: "stranger@box", job: "y10", action: "search", status: "done" },
          saglam,
        ),
      },
      { ad: "sema fact_search", metin: aracMetni("fact_search", { query: "schema" }, bozuk) },
      {
        ad: "sema fact_read",
        metin: aracMetni(
          "fact_read",
          { uid: "01YAYIN10BAD00000000000001", agent: "stranger@box" },
          bozuk,
        ),
      },
      { ad: "frontmatter fact_search", metin: aracMetni("fact_search", { query: "note" }, fm) },
      {
        ad: "frontmatter fact_read",
        metin: aracMetni(
          "fact_read",
          { uid: "01YAYIN10OK0000000000000001", agent: "stranger@box" },
          fm,
        ),
      },
      {
        ad: "bozuk-profil fact_search",
        metin: aracMetni(
          "fact_search",
          { query: "shipping", agent: "bozuk@box" },
          yonetilen,
        ),
      },
      {
        ad: "profilsiz fact_search",
        metin: aracMetni(
          "fact_search",
          { query: "shipping", agent: "profilsiz-yabanci" },
          yonetilen,
        ),
      },
      {
        ad: "profilsiz event_report",
        metin: aracMetni(
          "event_report",
          {
            agent: "profilsiz-yabanci",
            job: "y10",
            action: "write",
            status: "done",
          },
          yonetilen,
        ),
      },
      { ad: "bos fact_search", metin: aracMetni("fact_search", { query: "" }, saglam) },
      { ad: "bos fact_read", metin: aracMetni("fact_read", { uid: "", agent: "stranger@box" }, saglam) },
      { ad: "bos fact_propose", metin: aracMetni("fact_propose", { type: "nope" }, saglam) },
      {
        ad: "bos event_report",
        metin: aracMetni(
          "event_report",
          { agent: "", job: "y10", action: "search", status: "done" },
          saglam,
        ),
      },
      {
        ad: "olmayan-uid fact_read",
        metin: aracMetni(
          "fact_read",
          { uid: "01YOKYOKYOK0000000000000000", agent: "stranger@box" },
          saglam,
        ),
      },
    ];

    const kirli: string[] = [];
    for (const c of cagrilar) {
      const metin = await c.metin;
      const hits = telKirli(metin);
      if (hits.length) kirli.push(`--- ${c.ad} ---\n${hits.join("\n")}\n${metin}`);
    }
    expect(kirli, kirli.join("\n\n")).toEqual([]);
  });
});

describe("YAYIN/10 N6: iç çağıran", () => {
  it("akisBildir varsayılan profilsiz yazar", () => {
    const kokpit = tmp();
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(yetki, { recursive: true });
    mkdirSync(akis, { recursive: true });
    process.env.TUGRA_KOKPIT = kokpit;
    const r = akisBildir(
      {
        ajan: "cron@pc",
        is: "ayna-log",
        eylem: "calistirma",
        durum: "bitti",
      },
      akis,
    );
    expect(r.izin).toBe(true);
  });
});
