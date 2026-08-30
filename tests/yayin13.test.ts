/**
 * YAYIN/13 bekçileri.
 * A — enum $1 sınıflı. B — kapsam üründen. C — kullanıcı içeriği sıyrılır.
 * D — kokCoz merkezi skala. E — seviye × araç tel dili.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tugraArac, TUGRA_ARACLAR, kokCoz } from "../src/mcp.js";
import { SENTENCE_RULES, translateText, yakalamaSayisi } from "../src/outbound.js";
import {
  kullaniciAlanlariniSoy,
  sozlukIcAdlar,
  SOZLUK_HARITALARI,
} from "../src/vocabulary.js";
import * as vocab from "../src/vocabulary.js";
import { yetkiYaz, type ASeviye } from "../src/yetki.js";
import { skalaKasasi, tempKok, temizle } from "./helpers.js";

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

let yedek: Record<string, string | undefined> = {};
const TMPLER: string[] = [];

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

/** Ürün sızıntısı: Türkçe harf. `kasa` yol adı değil — onu sözlük bekçisi tutar. */
const TURKCE_HARF = /[çğşıöüÇĞŞİÖÜ]/;

function sozlukSizdi(metin: string): string[] {
  let taranacak = metin;
  try {
    taranacak = JSON.stringify(kullaniciAlanlariniSoy(JSON.parse(metin)));
  } catch {
    /* ham */
  }
  return sozlukIcAdlar().filter((ad) =>
    new RegExp(`(^|[^\\w-])${ad}([^\\w-]|$)`).test(taranacak),
  );
}

const SAGLAM = `---
uid: 01Y13SHIP00000000000000001
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
    pointer: "policy/x.md#L1"
    taken: 2026-08-01
links: []
affects: []
superseded_by: null
invalidated_by: null
---

Shipping takes 30 days.
`;

const ICERIK_SIZINTI = `---
uid: 01Y13GUVE00000000000000001
type: fact
scope: org
world: null
topic: policy.words
title: "guven kaynak kurum salt_okunur"
owner: owner
author: ci@example
date: 2026-08-01T00:00:00.000Z
confidence: 0.9
shelf_life: 180g
verified: 2026-08-01
source:
  - type: file
    pointer: "policy/words.md#L1"
    taken: 2026-08-01
links: []
affects: []
superseded_by: null
invalidated_by: null
---

claim about guven and kaynak in the body.
`;

function kutu(olgu = SAGLAM): {
  kasa: string;
  akis: string;
  yetki: string;
  kokpit: string;
} {
  const kokpit = tmp();
  const kasa = join(kokpit, "kasa");
  const akis = join(kokpit, "akis");
  const yetki = join(kokpit, "yetki");
  mkdirSync(akis, { recursive: true });
  mkdirSync(yetki, { recursive: true });
  mkdirSync(kasa, { recursive: true });
  writeFileSync(join(kasa, "ship.md"), olgu, "utf8");
  skalaKasasi(kasa);
  process.env.TUGRA_KOKPIT = kokpit;
  return { kasa, akis, yetki, kokpit };
}

function profilYaz(yetki: string, kasa: string, seviye: ASeviye, ajan: string, dolmus = false): void {
  const bas = dolmus ? new Date(Date.now() - 7_200_000) : new Date();
  const son = dolmus
    ? new Date(Date.now() - 3_600_000)
    : new Date(bas.getTime() + 3_600_000);
  yetkiYaz(
    {
      ajan,
      seviye,
      baslangic: bas.toISOString(),
      sona_erme: son.toISOString(),
    },
    yetki,
    kasa,
  );
}

async function cagir(
  ad: (typeof TUGRA_ARACLAR)[number],
  args: Record<string, unknown>,
  kasa: string,
  akis: string,
  yetki: string,
): Promise<string> {
  const r = await tugraArac(ad, args, { kasaKok: kasa, akisKok: akis, yetkiKok: yetki });
  return r.content[0]!.text;
}

const SEVIYELER: ASeviye[] = ["A0", "A1", "A2", "A3", "A4", "A5"];

function aracArgs(
  arac: (typeof TUGRA_ARACLAR)[number],
  ajan: string,
): Record<string, unknown> {
  if (arac === "fact_search") return { query: "shipping", agent: ajan };
  if (arac === "fact_read") {
    return { uid: "01Y13SHIP00000000000000001", agent: ajan };
  }
  if (arac === "fact_propose") {
    return {
      title: "Returns within 14 days",
      body: "Returns are accepted within 14 days.",
      agent: ajan,
      type: "fact",
      topic: "policy.returns",
    };
  }
  return { agent: ajan, job: "y13", action: "read", status: "done" };
}

describe("A yakalama sınıflı — vocab vs data", () => {
  it("her kuralın her grubu sınıflı", () => {
    for (const k of SENTENCE_RULES) {
      expect(k.captures.length, String(k.re)).toBe(yakalamaSayisi(k.re));
    }
  });

  it("dokunma $1 sözlükten, konu/uid/gün veri", () => {
    expect(translateText("dokunma:salt_okunur yazma yetmez")).toBe(
      "touch:read_only insufficient for write",
    );
    expect(translateText("dokunma:yok çalıştırma yetmez")).toBe(
      "touch:none insufficient for run",
    );
    expect(translateText("disa_acilma:yerel_model bulut yasak")).toBe(
      "external_exposure:local_model cloud forbidden",
    );
    expect(translateText("bu olgu 12 gündür doğrulanmadı")).toBe(
      "not verified for 12 days",
    );
  });
});

describe("B kapsam üründen türetilir", () => {
  it("export edilen her *_VALUES/*_FIELDS SOZLUK_HARITALARI'nda", () => {
    const maps = Object.keys(vocab).filter(
      (k) =>
        (k.endsWith("_VALUES") || k.endsWith("_FIELDS")) &&
        !k.endsWith("_IN") &&
        k !== "WIRE_FIELDS" &&
        k !== "SOZLUK_HARITALARI",
    );
    expect(maps.sort()).toEqual(Object.keys(SOZLUK_HARITALARI).sort());
  });

  it("salt_okunur ve eksen değerleri sozlukIcAdlar'da", () => {
    const adlar = sozlukIcAdlar();
    expect(adlar).toContain("salt_okunur");
    expect(adlar).toContain("yerel_model");
    expect(adlar).toContain("dokunma");
    expect(adlar).toContain("disa_acilma");
    expect(adlar).toContain("cit_icinde_serbest");
    const tel = "touch:salt_okunur insufficient for write";
    const hit = adlar.filter((ad) =>
      new RegExp(`(^|[^\\w-])${ad}([^\\w-]|$)`).test(tel),
    );
    expect(hit).toContain("salt_okunur");
  });
});

describe("C kullanıcı içeriği sızıntı sayılmaz", () => {
  it("başlıkta guven/kaynak/salt_okunur — bekçi yeşil, telde title aynen", async () => {
    const kokpit = tmp();
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    mkdirSync(akis, { recursive: true });
    mkdirSync(kasa, { recursive: true });
    writeFileSync(join(kasa, "words.md"), ICERIK_SIZINTI, "utf8");
    process.env.TUGRA_KOKPIT = kokpit;
    const r = await tugraArac(
      "fact_search",
      { query: "guven" },
      { kasaKok: kasa, akisKok: akis },
    );
    const t = r.content[0]!.text;
    expect(t).toMatch(/guven kaynak kurum salt_okunur/);
    expect(sozlukSizdi(t), t).toEqual([]);
    const ham = sozlukIcAdlar().filter((ad) =>
      new RegExp(`(^|[^\\w-])${ad}([^\\w-]|$)`).test(t),
    );
    expect(ham.length).toBeGreaterThan(0);
  });
});

describe("D kokCoz — (a) merkezi skala", () => {
  it("skalaKasa verilmezse varsayilanKasa, kasaKok değil", () => {
    const kokpit = tmp();
    const hedef = tmp();
    mkdirSync(join(kokpit, "kasa"), { recursive: true });
    process.env.TUGRA_KOKPIT = kokpit;
    delete process.env.TUGRA_KASA;
    const r = kokCoz({ kasaKok: hedef });
    expect(r.kasaKok).toBe(resolve(hedef));
    expect(r.skalaKasa).toBe(resolve(kokpit, "kasa"));
    expect(r.skalaKasa).not.toBe(r.kasaKok);
  });

  it("ayrı hedef + merkezi skala: mühürlü A3 propose izinli", async () => {
    const kokpit = tmp();
    const skala = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(akis, { recursive: true });
    mkdirSync(yetki, { recursive: true });
    skalaKasasi(skala);
    process.env.TUGRA_KOKPIT = kokpit;
    delete process.env.TUGRA_KASA;
    const ajan = "a3@host";
    profilYaz(yetki, skala, "A3", ajan);
    const hedef = tmp();
    writeFileSync(join(hedef, "ship.md"), SAGLAM, "utf8");
    const r = await tugraArac(
      "fact_propose",
      {
        title: "Host split root",
        body: "Proposal on data-only target.",
        agent: ajan,
        type: "fact",
      },
      { kasaKok: hedef, akisKok: akis, yetkiKok: yetki },
    );
    const g = JSON.parse(r.content[0]!.text) as { ok?: boolean; reason?: string };
    expect(g.ok, r.content[0]!.text).toBe(true);
    expect(g.reason ?? "").not.toMatch(/not in vault/i);
  });
});

describe("E seviye × araç — tel dili + her seviyede bir ret", () => {
  for (const sev of SEVIYELER) {
    for (const arac of TUGRA_ARACLAR) {
      it(`${sev} × ${arac} cevap İngilizce`, async () => {
        const { kasa, akis, yetki } = kutu();
        const ajan = `${sev.toLowerCase()}@y13`;
        profilYaz(yetki, kasa, sev, ajan);
        const t = await cagir(arac, aracArgs(arac, ajan), kasa, akis, yetki);
        expect(t).not.toMatch(TURKCE_HARF);
        expect(sozlukSizdi(t), t).toEqual([]);
      });
    }

    it(`${sev} en az bir ret ve ret İngilizce`, async () => {
      const { kasa, akis, yetki } = kutu();
      const ajan = `${sev.toLowerCase()}-ret@y13`;
      if (sev === "A0" || sev === "A1") {
        profilYaz(yetki, kasa, sev, ajan);
        const t = await cagir("fact_propose", aracArgs("fact_propose", ajan), kasa, akis, yetki);
        const g = JSON.parse(t) as { ok?: boolean; allowed?: boolean; reason?: string };
        expect(g.ok).toBe(false);
        expect(g.allowed).toBe(false);
        expect(g.reason ?? "").toMatch(/touch:(none|read_only) insufficient for write/);
        expect(t).not.toMatch(/salt_okunur|dokunma:/);
        expect(t).not.toMatch(TURKCE_HARF);
        expect(sozlukSizdi(t), t).toEqual([]);
      } else {
        profilYaz(yetki, kasa, sev, ajan, true);
        const t = await cagir("fact_search", aracArgs("fact_search", ajan), kasa, akis, yetki);
        expect(t).toMatch(/authorization expired|unauthorized/i);
        expect(t).not.toMatch(TURKCE_HARF);
        expect(sozlukSizdi(t), t).toEqual([]);
        const g = JSON.parse(t) as { total?: number; boundary_warnings?: string[] };
        expect(g.total).toBe(0);
      }
    });
  }
});
