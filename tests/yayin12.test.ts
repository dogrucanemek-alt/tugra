/**
 * YAYIN/12 bekçileri.
 * F1 önce kırmızı: sözlük iç adları telde → fail. Sonra çıkış kapısı düzeltir.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { akisBildir } from "../src/akis.js";
import { tugraArac } from "../src/mcp.js";
import { cevirAlanYolu, sozlukIcAdlar } from "../src/vocabulary.js";
import {
  harcamaEkle,
  maliyetKalemDogrula,
  yetkiKontrol,
  yetkiYaz,
  type HarcamaTavan,
} from "../src/yetki.js";
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

function tmp(ad: string): string {
  const d = tempKok();
  TMPLER.push(d);
  return d;
}

function sozlukSizdi(metin: string): string[] {
  const hit: string[] = [];
  for (const ad of sozlukIcAdlar()) {
    const re = new RegExp(`(^|[^\\w-])${ad}([^\\w-]|$)`);
    if (re.test(metin)) hit.push(ad);
  }
  return hit;
}

function yazOlgu(kasa: string, ad: string, govde: string): void {
  mkdirSync(kasa, { recursive: true });
  writeFileSync(join(kasa, ad), govde, "utf8");
}

const BOZUK = `---
uid: 01Y12BROKEN000000000000001
type: fact
scope: org
world: null
topic: schema.broken
title: "Broken schema"
owner: owner
author: ci@example
date: 2026-08-01T00:00:00.000Z
confidence: 7
shelf_life: 180g
verified: 2026-08-01
source:
  - not-an-object
links: []
affects: []
superseded_by: null
invalidated_by: null
---

Broken.
`;

const SAGLAM = `---
uid: 01Y12SHIP00000000000000001
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

function kutu(): { kasa: string; akis: string } {
  const kokpit = tmp("kutu");
  const kasa = join(kokpit, "kasa");
  const akis = join(kokpit, "akis");
  mkdirSync(akis, { recursive: true });
  yazOlgu(kasa, "ship.md", SAGLAM);
  process.env.TUGRA_KOKPIT = kokpit;
  return { kasa, akis };
}

function yonetilen(profil = false): {
  kasa: string;
  akis: string;
  yetki: string;
  ajan: string;
} {
  const kokpit = tmp("yon");
  const kasa = join(kokpit, "kasa");
  const akis = join(kokpit, "akis");
  const yetki = join(kokpit, "yetki");
  mkdirSync(akis, { recursive: true });
  mkdirSync(yetki, { recursive: true });
  yazOlgu(kasa, "ship.md", SAGLAM);
  skalaKasasi(kasa);
  process.env.TUGRA_KOKPIT = kokpit;
  const ajan = "ci@example";
  if (profil) {
    const bas = new Date();
    yetkiYaz(
      {
        ajan,
        seviye: "A3",
        baslangic: bas.toISOString(),
        sona_erme: new Date(bas.getTime() + 3_600_000).toISOString(),
      },
      yetki,
      kasa,
    );
  }
  return { kasa, akis, yetki, ajan };
}

function kasaDamga(kasa: string): string[] {
  if (!existsSync(kasa)) return [];
  const out: string[] = [];
  const yigin = [kasa];
  while (yigin.length) {
    const dir = yigin.pop()!;
    for (const ad of readdirSync(dir).sort()) {
      const p = join(dir, ad);
      const st = statSync(p);
      if (st.isDirectory()) yigin.push(p);
      else out.push(`${p.slice(kasa.length)}:${st.size}`);
    }
  }
  return out.sort();
}

describe("F1 sözlük — alan yolu tek kural", () => {
  it("kaynak[0].tur segment segment çevrilir", () => {
    expect(cevirAlanYolu("kaynak[0].tur")).toBe("source[0].type");
    expect(cevirAlanYolu("guven")).toBe("confidence");
    expect(cevirAlanYolu("baslangic")).toBe("starts_at");
  });
});

describe("F2 bozuk şema MCP telinde", () => {
  it("fact_read warnings sözlük iç adı taşımaz", async () => {
    const { kasa, akis } = kutu();
    yazOlgu(kasa, "broken.md", BOZUK);
    const r = await tugraArac(
      "fact_read",
      { uid: "01Y12BROKEN000000000000001" },
      { kasaKok: kasa, akisKok: akis },
    );
    const t = r.content[0]!.text;
    expect(sozlukSizdi(t), t).toEqual([]);
    expect(t).toMatch(/source\[0\]: must be an object/);
    expect(t).toMatch(/confidence: out of 0-1: 7/);
    expect(t).not.toMatch(/"guven"/);
    expect(t).not.toMatch(/kaynak\[0\]/);
  });

  it("fact_search notes + scope sözlük iç adı taşımaz", async () => {
    const { kasa, akis } = kutu();
    yazOlgu(kasa, "broken.md", BOZUK);
    const r = await tugraArac(
      "fact_search",
      { query: "Broken schema" },
      { kasaKok: kasa, akisKok: akis },
    );
    const t = r.content[0]!.text;
    expect(sozlukSizdi(t), t).toEqual([]);
    expect(t).toMatch(/"scope": "org"/);
    expect(t).not.toMatch(/"scope": "kurum"/);
    expect(t).toMatch(/schema: source\[0\]: must be an object/);
    expect(t).toMatch(/schema: confidence: out of 0-1: 7/);
  });
});

describe("F3 yetkisiz çağrı kasaya yazmaz", () => {
  it("yönetilen + profilsiz: dört araç, kasa damgası aynı", async () => {
    const { kasa, akis, yetki } = yonetilen(false);
    const secenek = { kasaKok: kasa, akisKok: akis, yetkiKok: yetki };
    const once = kasaDamga(kasa);
    expect(existsSync(join(kasa, "_indeks.ndjson"))).toBe(false);

    await tugraArac("fact_search", { query: "shipping", agent: "yabanci@x" }, secenek);
    await tugraArac(
      "fact_read",
      { uid: "01Y12SHIP00000000000000001", agent: "yabanci@x" },
      secenek,
    );
    await tugraArac(
      "fact_propose",
      {
        title: "Should not land",
        body: "x",
        agent: "yabanci@x",
        type: "fact",
      },
      secenek,
    );
    await tugraArac(
      "event_report",
      { agent: "yabanci@x", job: "x", action: "write", status: "done" },
      secenek,
    );

    expect(kasaDamga(kasa)).toEqual(once);
    expect(existsSync(join(kasa, "_indeks.ndjson"))).toBe(false);
    expect(existsSync(join(kasa, "_indeks.meta.json"))).toBe(false);
    expect(existsSync(join(kasa, "_oneriler"))).toBe(false);
  });

  it("A2 kutu: fact_search indeks yazar (regresyon)", async () => {
    const { kasa, akis } = kutu();
    expect(existsSync(join(kasa, "_indeks.ndjson"))).toBe(false);
    const r = await tugraArac(
      "fact_search",
      { query: "shipping" },
      { kasaKok: kasa, akisKok: akis },
    );
    const g = JSON.parse(r.content[0]!.text) as { total?: number };
    expect(g.total).toBeGreaterThan(0);
    expect(existsSync(join(kasa, "_indeks.ndjson"))).toBe(true);
  });
});

describe("F4 maliyet sınır", () => {
  function tavanDolu() {
    const { kasa, akis, yetki, ajan } = yonetilen(true);
    const yol = join(yetki, `${ajan}.json`);
    const kayit = JSON.parse(readFileSync(yol, "utf8")) as {
      harcama?: HarcamaTavan;
      harcama_kullanilan?: HarcamaTavan;
    };
    const tavan = kayit.harcama ?? { token: 800_000, tl: 80 };
    kayit.harcama_kullanilan = { token: tavan.token, tl: tavan.tl };
    writeFileSync(yol, JSON.stringify(kayit, null, 2) + "\n", "utf8");
    return { kasa, akis, yetki, ajan, tavan };
  }

  const vakalar: { ad: string; v: unknown }[] = [
    { ad: "NaN", v: Number.NaN },
    { ad: "-0 kabul (sıfır)", v: -0 },
    { ad: "Infinity", v: Number.POSITIVE_INFINITY },
    { ad: "-Infinity", v: Number.NEGATIVE_INFINITY },
    { ad: "dizge", v: "-5" },
    { ad: "BigInt", v: 1n },
    { ad: "valueOf", v: { valueOf: () => -5 } },
  ];

  it("maliyetKalemDogrula: -0 geçer, geri kalan ret", () => {
    expect(maliyetKalemDogrula(-0).ok).toBe(true);
    expect(maliyetKalemDogrula(0).ok).toBe(true);
    expect(maliyetKalemDogrula(Number.NaN).ok).toBe(false);
    expect(maliyetKalemDogrula(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(maliyetKalemDogrula(Number.NEGATIVE_INFINITY).ok).toBe(false);
    expect(maliyetKalemDogrula("-5").ok).toBe(false);
    expect(maliyetKalemDogrula(1n).ok).toBe(false);
    expect(maliyetKalemDogrula({ valueOf: () => -5 }).ok).toBe(false);
  });

  for (const v of vakalar.filter((x) => x.ad !== "-0 kabul (sıfır)")) {
    it(`yetkiKontrol ${v.ad} izin vermez`, () => {
      const { kasa, akis, yetki, ajan } = tavanDolu();
      const r = yetkiKontrol({
        ajan,
        eylem: "akis",
        maliyet: { token: v.v as number, tl: 0 },
        yetkiKok: yetki,
        kasaKok: kasa,
        akisKok: akis,
        dosyaYoksaIzin: false,
      });
      expect(r.izin, JSON.stringify(r)).toBe(false);
    });

    it(`akisBildir ${v.ad} izin vermez`, () => {
      const { kasa, akis, yetki, ajan } = tavanDolu();
      const r = akisBildir(
        {
          ajan,
          is: "f4",
          eylem: "yazma",
          durum: "bitti",
          maliyet: { token: v.v as number, tl: 0 },
        },
        akis,
        { yetkiKok: yetki, kasaKok: kasa, dosyaYoksaIzin: false },
      );
      expect(r.izin, JSON.stringify(r)).toBe(false);
    });

    it(`harcamaEkle ${v.ad} reddeder, tavan düşmez`, () => {
      const { yetki, ajan, tavan } = tavanDolu();
      const once = JSON.parse(readFileSync(join(yetki, `${ajan}.json`), "utf8")) as {
        harcama_kullanilan: HarcamaTavan;
      };
      const r = harcamaEkle(
        ajan,
        { token: v.v, tl: 0 } as HarcamaTavan,
        yetki,
      );
      expect(r.ok).toBe(false);
      const sonra = JSON.parse(readFileSync(join(yetki, `${ajan}.json`), "utf8")) as {
        harcama_kullanilan: HarcamaTavan;
      };
      expect(sonra.harcama_kullanilan).toEqual(once.harcama_kullanilan);
      expect(sonra.harcama_kullanilan.token).toBe(tavan.token);
    });
  }

  it("harcamaEkle negatif token kullanılanı düşürmez", () => {
    const { yetki, ajan } = tavanDolu();
    const r = harcamaEkle(ajan, { token: -100_000, tl: -10 }, yetki);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.neden).toMatch(/negative cost|invalid cost/);
  });
});

describe("E tek kök çözümleme", () => {
  it("skalaKasa yokken fact_propose merkezi varsayilanKasa skalasını kullanır", async () => {
    const { kasa, akis, yetki, ajan } = yonetilen(true);
    const izol = tmp("izol");
    process.env.TUGRA_KOKPIT = izol;
    delete process.env.TUGRA_KASA;
    const r = await tugraArac(
      "fact_propose",
      {
        title: "Same root",
        body: "Same root body.",
        agent: ajan,
        type: "fact",
      },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    const g = JSON.parse(r.content[0]!.text) as { ok?: boolean; reason?: string };
    expect(g.ok, r.content[0]!.text).toBe(false);
    expect(g.reason ?? "").toMatch(/level A3 not in vault/i);
  });
});
