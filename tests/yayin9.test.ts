/**
 * YAYIN/9 — yetkiDogrula telde Türkçe + bekçi kör noktaları + README dalı.
 * ⛔ Önce kırmızı: B2 (bozuk profil) ve B1 (hatalar.push) bugünkü kodda geçmemeli.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { akisBildir } from "../src/akis.js";
import { tugraArac } from "../src/mcp.js";
import { motorKok } from "../src/yollar.js";
import { tempKok, temizle } from "./helpers.js";

const PAKET_MODULLER = [
  "akis",
  "arama",
  "dogrula",
  "dosya",
  "goc-dil",
  "indeks",
  "konu",
  "kurulum",
  "mcp",
  "outbound",
  "sema",
  "sir",
  "sunum",
  "tarayici",
  "toplayici",
  "ulid",
  "vocabulary",
  "yetki",
  "yollar",
] as const;

const PUSH_TURKCE =
  /[çğşıöüÇĞŞİÖÜ]|\b(yok|talep|zorunlu|eksik|gecersiz|geçersiz|hata|bulunamadi|yazilmadi|izin|olmali|akis_bildir|Frontmatter|ajan|seviye|süresiz|ister)\b/;

const TURKCE_TEL =
  /[çğşıöüÇĞŞİÖÜ]|\b(taze|bayat|curuk|emekli|olgu|kasa|yetki|sinir|kanitsiz|gozlem|kural|karar|neden|notlar|konu|guven|tazelik|kaynak|yasak|gundur|yerine|bulunamadi|taslagi|oneri|yok|talep|zorunlu|eksik|gecersiz|hata|yazilmadi|izin|olmali|akis_bildir)\b/i;

export function pushLiteralleriTara(
  ham: string,
  ad: string,
): string[] {
  const kirli: string[] = [];
  const re =
    /(hatalar|uyarilar|notlar|etiketler)\.push\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham))) {
    const lit = m[2]!;
    const sabit = lit.replace(/\$\{[^}]*\}/g, "");
    if (PUSH_TURKCE.test(sabit)) kirli.push(`${ad}: ${m[1]}.push(${lit})`);
  }
  return kirli;
}

function paketPushKirli(): string[] {
  const src = join(motorKok(), "src");
  const kirli: string[] = [];
  for (const ad of PAKET_MODULLER) {
    kirli.push(
      ...pushLiteralleriTara(readFileSync(join(src, `${ad}.ts`), "utf8"), `${ad}.ts`),
    );
  }
  return kirli;
}

function hatalarPushKirli(): string[] {
  return paketPushKirli().filter((s) => s.includes("hatalar.push"));
}

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

function ingilizceOlgu(kasa: string): void {
  mkdirSync(kasa, { recursive: true });
  writeFileSync(
    join(kasa, "shipping.md"),
    `---
uid: 01YAYIN9FACT000000000000001
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

function turkceSatirlar(metin: string): string[] {
  return metin
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && TURKCE_TEL.test(s));
}

describe("YAYIN/9 B1: hatalar.push literali", () => {
  it("paket modüllerinde hatalar.push + uyarilar.push literali Türkçe değil", () => {
    const kirli = paketPushKirli().filter(
      (s) => s.includes("hatalar.push") || s.includes("uyarilar.push"),
    );
    expect(kirli, kirli.join("\n")).toEqual([]);
  });

  it("dört ad tarandı: notlar/etiketler Türkçe yalnız arama.ts (outbound kaynak)", () => {
    const kirli = paketPushKirli().filter(
      (s) => s.includes("notlar.push") || s.includes("etiketler.push"),
    );
    const dis = kirli.filter((s) => !s.startsWith("arama.ts:"));
    expect(dis, `outbound dışı:\n${dis.join("\n")}`).toEqual([]);
  });

  it("N5: bekçi bozulunca (Türkçe push) kırmızı", () => {
    const sentetik = 'hatalar.push("ajan zorunlu");\n';
    expect(pushLiteralleriTara(sentetik, "sentetik.ts").length).toBeGreaterThan(0);
  });
});

describe("YAYIN/9 B2: bozuk profil — telde Türkçe 0", () => {
  it("yönetilen + şemaya uymayan profil + fact_search", async () => {
    const kokpit = tmp();
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(yetki, { recursive: true });
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    writeFileSync(
      join(yetki, "bozuk@box.json"),
      JSON.stringify({
        ajan: "",
        seviye: "A9",
        baslangic: "not-iso",
        sona_erme: "suresiz",
      }),
      "utf8",
    );
    process.env.TUGRA_KOKPIT = kokpit;

    const c = await tugraArac(
      "fact_search",
      { query: "shipping", agent: "bozuk@box" },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    const metin = c.content[0]!.text;
    expect(turkceSatirlar(metin), metin).toEqual([]);
  });
});

describe("YAYIN/9 C: README dalı main", () => {
  it("install.md linki blob/main, blob/master değil", () => {
    const md = readFileSync(join(motorKok(), "README.md"), "utf8");
    expect(md).not.toMatch(/blob\/master\/docs\/install\.md/);
    expect(md).toMatch(
      /https:\/\/github\.com\/dogrucanemek-alt\/tugra\/blob\/main\/docs\/install\.md/,
    );
  });
});

describe("YAYIN/9 N2: profilsiz YAYIN/8 davranışı", () => {
  it("yönetilen + profilsiz → no authorization profile", async () => {
    const kokpit = tmp();
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(yetki, { recursive: true });
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    process.env.TUGRA_KOKPIT = kokpit;
    const c = await tugraArac(
      "fact_search",
      { query: "shipping", agent: "profilsiz-yabanci" },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    const t = c.content[0]!.text;
    expect(t).toMatch(/unauthorized: no authorization profile \(request /);
    expect(turkceSatirlar(t), t).toEqual([]);
  });
});

describe("YAYIN/9 N3: A2 (yetki yok) dört araç", () => {
  it("fact_search / fact_read / fact_propose / event_report çalışır", async () => {
    const kokpit = tmp();
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    process.env.TUGRA_KOKPIT = kokpit;
    const opts = { kasaKok: kasa, akisKok: akis };

    const search = await tugraArac("fact_search", { query: "shipping" }, opts);
    expect(search.content[0]!.text).toMatch(/01YAYIN9FACT000000000000001/);

    const read = await tugraArac(
      "fact_read",
      { uid: "01YAYIN9FACT000000000000001", agent: "stranger@box" },
      opts,
    );
    expect(read.content[0]!.text).toMatch(/Shipping takes 30 days/);

    const propose = await tugraArac(
      "fact_propose",
      {
        type: "rule",
        topic: "policy.returns",
        agent: "stranger@box",
        title: "Returns within 14 days",
        body: "Returns are accepted within 14 days.",
        source: [
          { type: "file", pointer: "policy/returns.md#L1", taken: "2026-08-29" },
        ],
      },
      opts,
    );
    const p = JSON.parse(propose.content[0]!.text) as { ok?: boolean };
    expect(p.ok).toBe(true);

    const ev = await tugraArac(
      "event_report",
      { agent: "stranger@box", job: "n3", action: "search", status: "done" },
      opts,
    );
    const g = JSON.parse(ev.content[0]!.text) as { ok?: boolean; allowed?: boolean };
    expect(g.ok).toBe(true);
    expect(g.allowed).toBe(true);
  });
});

describe("YAYIN/9 N4: iç çağıran kırılmadı", () => {
  it("akisBildir varsayılan (ayna/cron) profilsiz yazar", () => {
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
