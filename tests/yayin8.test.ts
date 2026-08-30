/**
 * YAYIN/8 — üç yayın engeli + küçük kusur bekçileri.
 * ⛔ Önce kırmızı: bu dosya bugünkü kodda A (profilsiz yazma) ve
 * B/C (Türkçe throw) senaryolarında kırmızı yanmalı.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { akisBildir } from "../src/akis.js";
import { tugraArac } from "../src/mcp.js";
import { yetkiYaz } from "../src/yetki.js";
import { motorKok } from "../src/yollar.js";
import { skalaKasasi, tempKok, temizle } from "./helpers.js";

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

/** Statik bekçi — throw literali. Çalışma-anı senaryosuna bağlı değil. */
const THROW_TURKCE =
  /[çğşıöüÇĞŞİÖÜ]|\b(yok|talep|zorunlu|eksik|gecersiz|geçersiz|hata|bulunamadi|yazilmadi|izin|olmali|akis_bildir|Frontmatter)\b/;

const TURKCE_TEL =
  /[çğşıöüÇĞŞİÖÜ]|\b(taze|bayat|curuk|emekli|olgu|kasa|yetki|sinir|kanitsiz|gozlem|kural|karar|neden|notlar|konu|guven|tazelik|kaynak|yasak|gundur|yerine|bulunamadi|taslagi|oneri|yok|talep|zorunlu|eksik|gecersiz|hata|yazilmadi|izin|olmali|akis_bildir)\b/i;

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

function tmp(ad: string): string {
  const d = tempKok();
  TMPLER.push(d);
  return d;
}

function ingilizceOlgu(kasa: string): void {
  mkdirSync(kasa, { recursive: true });
  writeFileSync(
    join(kasa, "shipping.md"),
    `---
uid: 01YAYIN8FACT000000000000001
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

async function rapor(args: Record<string, unknown>, secenek: Parameters<typeof tugraArac>[2]) {
  try {
    const c = await tugraArac("event_report", args, secenek);
    return { text: c.content[0]!.text, threw: false as const };
  } catch (e) {
    return {
      text: e instanceof Error ? e.message : String(e),
      threw: true as const,
    };
  }
}

describe("YAYIN/8 A: event_report yetki", () => {
  it("yetki kurulu + profilsiz ajan → event_report REDDEDİLİR", async () => {
    const kokpit = tmp("y8-a-red");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(yetki, { recursive: true });
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    process.env.TUGRA_KOKPIT = kokpit;

    const search = await tugraArac(
      "fact_search",
      { query: "shipping", agent: "profilsiz-yabanci" },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    const searchText = search.content[0]!.text;
    expect(searchText).toMatch(/unauthorized/i);

    const ev = await rapor(
      {
        agent: "profilsiz-yabanci",
        job: "bypass-denemesi",
        action: "write",
        status: "done",
      },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    const g = ev.threw ? { ok: false } : (JSON.parse(ev.text) as { ok?: boolean; allowed?: boolean });
    expect(g.ok === true || g.allowed === true, ev.text).toBe(false);
    expect(ev.text).toMatch(/unauthorized|no authorization profile|not allowed|allowed": false/i);
  });

  it("A2 (yetki hiç yok) → event_report ÇALIŞIR", async () => {
    const kokpit = tmp("y8-a-a2");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    process.env.TUGRA_KOKPIT = kokpit;

    const ev = await rapor(
      {
        agent: "stranger@box",
        job: "hello",
        action: "search",
        status: "done",
      },
      { kasaKok: kasa, akisKok: akis },
    );
    expect(ev.threw, ev.text).toBe(false);
    const g = JSON.parse(ev.text) as { ok?: boolean; allowed?: boolean };
    expect(g.ok).toBe(true);
    expect(g.allowed).toBe(true);
  });

  it("yetki kurulu + profilli ajan → event_report çalışır", async () => {
    const kokpit = tmp("y8-a-pro");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    skalaKasasi(kasa);
    const bas = new Date();
    yetkiYaz(
      {
        ajan: "ci@example",
        seviye: "A2",
        baslangic: bas.toISOString(),
        sona_erme: new Date(bas.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      },
      yetki,
      kasa,
    );
    process.env.TUGRA_KOKPIT = kokpit;

    const ev = await rapor(
      {
        agent: "ci@example",
        job: "profilli",
        action: "search",
        status: "done",
      },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    expect(ev.threw, ev.text).toBe(false);
    const g = JSON.parse(ev.text) as { ok?: boolean; allowed?: boolean };
    expect(g.ok).toBe(true);
    expect(g.allowed).toBe(true);
  });

  it("iç çağıran: varsayılan akisBildir (ayna/cron) profilsiz yazmaya devam eder", () => {
    const kokpit = tmp("y8-a-ic");
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

  it("iç çağıran: yetki_talebi eylemi kontrol dışı kalır", () => {
    const kokpit = tmp("y8-a-talep");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(yetki, { recursive: true });
    mkdirSync(akis, { recursive: true });
    process.env.TUGRA_KOKPIT = kokpit;

    const r = akisBildir(
      {
        ajan: "profilsiz",
        is: "yetki",
        eylem: "yetki_talebi",
        durum: "hata",
      },
      akis,
    );
    expect(r.izin).toBe(true);
  });
});

describe("YAYIN/8 B: boş agent/job Türkçe yok", () => {
  it("boş agent — cevapta Türkçe 0", async () => {
    const kasa = tmp("y8-b-a");
    const akis = tmp("y8-b-aa");
    const ev = await rapor(
      { agent: "", job: "yayin8", action: "read", status: "done" },
      { kasaKok: kasa, akisKok: akis },
    );
    expect(turkceSatirlar(ev.text), ev.text).toEqual([]);
  });

  it("boş job — cevapta Türkçe 0", async () => {
    const kasa = tmp("y8-b-j");
    const akis = tmp("y8-b-ja");
    const ev = await rapor(
      { agent: "ci@example", job: "", action: "read", status: "done" },
      { kasaKok: kasa, akisKok: akis },
    );
    expect(turkceSatirlar(ev.text), ev.text).toEqual([]);
  });
});

describe("YAYIN/8 C: frontmatter + statik throw", () => {
  it("frontmatter'sız md + fact_search — İngilizce", async () => {
    const kokpit = tmp("y8-c-s");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    mkdirSync(kasa, { recursive: true });
    mkdirSync(akis, { recursive: true });
    writeFileSync(join(kasa, "notes.md"), "just a note, no frontmatter\n", "utf8");
    process.env.TUGRA_KOKPIT = kokpit;

    let text: string;
    try {
      const c = await tugraArac("fact_search", { query: "note" }, { kasaKok: kasa, akisKok: akis });
      text = c.content[0]!.text;
    } catch (e) {
      text = e instanceof Error ? e.message : String(e);
    }
    expect(text).not.toMatch(/Frontmatter yok/i);
    expect(turkceSatirlar(text), text).toEqual([]);
    expect(text).toMatch(/frontmatter/i);
  });

  it("frontmatter'sız md + fact_read — İngilizce", async () => {
    const kokpit = tmp("y8-c-r");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    mkdirSync(kasa, { recursive: true });
    mkdirSync(akis, { recursive: true });
    writeFileSync(join(kasa, "notes.md"), "just a note, no frontmatter\n", "utf8");
    process.env.TUGRA_KOKPIT = kokpit;

    let text: string;
    try {
      const c = await tugraArac(
        "fact_read",
        { uid: "01YAYIN8FACT000000000000001", agent: "mcp-readonly@tugra" },
        { kasaKok: kasa, akisKok: akis },
      );
      text = c.content[0]!.text;
    } catch (e) {
      text = e instanceof Error ? e.message : String(e);
    }
    expect(text).not.toMatch(/Frontmatter yok/i);
    expect(turkceSatirlar(text), text).toEqual([]);
  });

  it("paket modüllerinde throw new Error literali Türkçe değil", () => {
    const src = join(motorKok(), "src");
    const kirli: string[] = [];
    for (const ad of PAKET_MODULLER) {
      const yol = join(src, `${ad}.ts`);
      const ham = readFileSync(yol, "utf8");
      const re = /throw new Error\((`[^`]*`|"[^"]*"|'[^']*')\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ham))) {
        const lit = m[1]!;
        if (THROW_TURKCE.test(lit)) kirli.push(`${ad}.ts: ${lit}`);
      }
    }
    expect(kirli, kirli.join("\n")).toEqual([]);
  });
});

describe("YAYIN/8 D: tel anahtar + meta", () => {
  it("event_report başarı cevabında line var, satirNo yok", async () => {
    const kokpit = tmp("y8-d-line");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    process.env.TUGRA_KOKPIT = kokpit;
    const ev = await rapor(
      { agent: "stranger@box", job: "d3", action: "search", status: "done" },
      { kasaKok: kasa, akisKok: akis },
    );
    expect(ev.threw, ev.text).toBe(false);
    expect(ev.text).toMatch(/"line":/);
    expect(ev.text).not.toMatch(/satirNo/);
  });

  it("unauthorized uyarısı request der, talep demez", async () => {
    const kokpit = tmp("y8-d-req");
    const kasa = join(kokpit, "kasa");
    const akis = join(kokpit, "akis");
    const yetki = join(kokpit, "yetki");
    mkdirSync(yetki, { recursive: true });
    mkdirSync(akis, { recursive: true });
    ingilizceOlgu(kasa);
    process.env.TUGRA_KOKPIT = kokpit;
    const search = await tugraArac(
      "fact_search",
      { query: "shipping", agent: "profilsiz-yabanci" },
      { kasaKok: kasa, akisKok: akis, yetkiKok: yetki },
    );
    const t = search.content[0]!.text;
    expect(t).toMatch(/request /);
    expect(t).not.toMatch(/\btalep\b/);
  });

  it("package.json author NOTICE unvanı ile birebir", () => {
    const pkg = JSON.parse(readFileSync(join(motorKok(), "package.json"), "utf8")) as {
      author?: string;
    };
    const notice = readFileSync(join(motorKok(), "NOTICE"), "utf8");
    const unvan = (notice.match(/Copyright \d+ (.+)/) ?? [])[1]?.trim();
    expect(unvan).toBeTruthy();
    expect(pkg.author).toBe(unvan);
  });

  it("README docs/install.md göreli link değil, GitHub URL", () => {
    const md = readFileSync(join(motorKok(), "README.md"), "utf8");
    expect(md).not.toMatch(/\]\(docs\/install\.md\)/);
    expect(md).toMatch(/https:\/\/github\.com\/dogrucanemek-alt\/tugra\/.+install\.md/);
    expect(md).not.toMatch(/even to an empty path, turns single-user mode off/);
  });
});
