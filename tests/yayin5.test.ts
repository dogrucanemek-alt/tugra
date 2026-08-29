/**
 * YAYIN/5 — depo açılmadan önceki son tur.
 * README'den config ayrıştırır (sabit kopya yok).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { olguAra } from "../src/arama.js";
import { tugraArac } from "../src/mcp.js";
import { configBlogu } from "../src/kurulum.js";
import { motorKok } from "../src/yollar.js";
import { olguDosyaMetni } from "../src/dosya.js";
import { ulid } from "../src/ulid.js";
import { GOVDE, meta, tempKok, temizle } from "./helpers.js";

const kokler: string[] = [];
afterEach(() => {
  while (kokler.length) temizle(kokler.pop()!);
});

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

function ortamTemiz(): Record<string, string | undefined> {
  const yedek: Record<string, string | undefined> = {};
  for (const k of ORTAM) {
    yedek[k] = process.env[k];
    delete process.env[k];
  }
  return yedek;
}

function ortamGeri(yedek: Record<string, string | undefined>): void {
  for (const k of ORTAM) {
    const v = yedek[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function kasaYaz(kasa: string, baslik: string, extra: Record<string, unknown> = {}): void {
  mkdirSync(kasa, { recursive: true });
  const m = meta({
    uid: ulid(),
    konu: "policy.shipping",
    baslik,
    yazan: "test@tugra",
    ...extra,
  });
  writeFileSync(
    join(kasa, `${m.uid}.md`),
    olguDosyaMetni({ meta: m, govde: `Shipping takes 30 days.\n\n${GOVDE}` }),
    "utf8",
  );
}

/** README fenced json/toml — istemci config env'leri. Sabit kopya yok. */
export function readmeIstemciEnv(ham: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const jsonRe = /```json\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = jsonRe.exec(ham))) {
    let o: { mcpServers?: { tugra?: { env?: Record<string, string> } } };
    try {
      o = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const env = o.mcpServers?.tugra?.env;
    if (env && typeof env === "object") out.push({ ...env });
  }
  const tomlRe = /```toml\r?\n([\s\S]*?)```/g;
  while ((m = tomlRe.exec(ham))) {
    const env: Record<string, string> = {};
    for (const satir of m[1].split(/\r?\n/)) {
      const eq = /^\s*(TUGRA_[A-Z0-9_]+)\s*=\s*"(.*)"\s*$/.exec(satir);
      if (eq) env[eq[1]] = eq[2];
    }
    if (Object.keys(env).length) out.push(env);
  }
  return out;
}

describe("YAYIN/5 A: README tek kullanıcı", () => {
  it("her istemci config bloğu fact_search sonuç döner", async () => {
    const ham = readFileSync(join(motorKok(), "README.md"), "utf8");
    const bloklar = readmeIstemciEnv(ham);
    expect(bloklar.length).toBeGreaterThanOrEqual(5);
    for (const env of bloklar) {
      expect(env.TUGRA_YETKI, JSON.stringify(env)).toBeUndefined();
      const yedek = ortamTemiz();
      const kok = tempKok();
      kokler.push(kok);
      const kasa = join(kok, "kasa");
      const akis = join(kok, "akis");
      mkdirSync(akis, { recursive: true });
      kasaYaz(kasa, "Shipping takes 30 days");
      process.env.TUGRA_KOKPIT = kok;
      if ("TUGRA_KASA" in env) process.env.TUGRA_KASA = kasa;
      if ("TUGRA_AKIS" in env) process.env.TUGRA_AKIS = akis;
      try {
        const c = await tugraArac(
          "fact_search",
          { query: "shipping", limit: 5 },
          { kasaKok: kasa, akisKok: akis },
        );
        const g = JSON.parse(c.content[0]!.text) as {
          total: number;
          boundary_warnings: string[];
        };
        expect(g.boundary_warnings.join(" ")).not.toMatch(/unauthorized/i);
        expect(g.total).toBeGreaterThan(0);
      } finally {
        ortamGeri(yedek);
      }
    }
  });

  it("docs/install.md extract yolunda ve bayat ad yok", () => {
    const readme = readFileSync(join(motorKok(), "README.md"), "utf8");
    const bag = /\]\(([^)]*docs\/install\.md)\)/.exec(readme);
    if (!bag) return;
    const yol = join(motorKok(), "docs", "install.md");
    expect(existsSync(yol), "README bağlar, dosya yok").toBe(true);
    const ham = readFileSync(yol, "utf8");
    expect(ham).not.toMatch(/TALAMUS_/);
    expect(ham).not.toMatch(/mcp-readonly@multi/);
  });

  it("tugra init configBlogu TUGRA_YETKI basmaz", () => {
    const j = JSON.parse(configBlogu("/kasa", "/akis")) as {
      mcpServers: { tugra: { env: Record<string, string> } };
    };
    expect(j.mcpServers.tugra.env.TUGRA_YETKI).toBeUndefined();
    expect(j.mcpServers.tugra.env.TUGRA_KASA).toBe("/kasa");
    expect(j.mcpServers.tugra.env.TUGRA_AKIS).toBe("/akis");
  });
});

describe("YAYIN/5 B: total slice öncesi", () => {
  it("eşleşme > limit → total gerçek, results = limit", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    for (let i = 0; i < 12; i++) {
      kasaYaz(kasa, `Shipping batch ${i}`);
    }
    const r = olguAra("shipping", { kasaKok: kasa, limit: 10 });
    expect(r.sonuclar.length).toBe(10);
    expect(r.toplam).toBe(12);
  });

  it("eşleşme < limit → total === results.length", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    kasaYaz(kasa, "Shipping takes 30 days");
    const r = olguAra("shipping", { kasaKok: kasa, limit: 10 });
    expect(r.toplam).toBe(r.sonuclar.length);
    expect(r.toplam).toBe(1);
  });

  it("eşleşme yok → total 0, results []", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    kasaYaz(kasa, "Shipping takes 30 days");
    const r = olguAra("xyzzynonesuch", { kasaKok: kasa, limit: 10 });
    expect(r.toplam).toBe(0);
    expect(r.sonuclar).toEqual([]);
  });
});

describe("YAYIN/5 C: sinir gövde", () => {
  function sinirKasasi(govde: string) {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    mkdirSync(kasa, { recursive: true });
    const m = meta({
      uid: ulid(),
      tur: "sinir",
      konu: "satis.iade",
      baslik: "Iade yasagi",
      yazan: "test@tugra",
    });
    writeFileSync(
      join(kasa, "sinir.md"),
      olguDosyaMetni({
        meta: m,
        // İlk paragraf indeks `iddia` — gövde eşiği ikinci paragrafta.
        govde: `Boundary note.\n\n${govde}`,
      }),
      "utf8",
    );
    kasaYaz(kasa, "Shipping takes 30 days");
    return kasa;
  }

  it("gövdeye düşen konu → uyarı var", () => {
    const kasa = sinirKasasi(
      "Do not invent a refund policy. Returns are out of scope.",
    );
    const r = olguAra("refund policy", { kasaKok: kasa, limit: 10 });
    expect(r.sinirUyarilari.join(" ")).toMatch(/satis\.iade/);
  });

  it("alakasız sorgu → uyarı yok", () => {
    const kasa = sinirKasasi(
      "Do not invent a refund policy. Returns are out of scope.",
    );
    const r = olguAra("shipping", { kasaKok: kasa, limit: 10 });
    expect(r.sinirUyarilari).toEqual([]);
  });

  it("başlık/konu eşleşmesi hâlâ çalışır", () => {
    const kasa = sinirKasasi("Unrelated body text about warehouses.");
    const r = olguAra("iade yasagi", { kasaKok: kasa, limit: 10 });
    expect(r.sinirUyarilari.join(" ")).toMatch(/satis\.iade/);
  });
});

describe("YAYIN/5 D: şema + boş sorgu", () => {
  it("dönen bozuk sonuçta şema uyarısı var", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    mkdirSync(kasa, { recursive: true });
    writeFileSync(
      join(kasa, "bozuk.md"),
      `---
uid: 01YAYIN5SCHEMA000000000000
tur: kural
kapsam: kurum
dunya: null
konu: policy.shipping
baslik: "Shipping takes 30 days"
sahip: patron
yazan: test@tugra
tarih: 2026-08-01T00:00:00.000Z
guven: 2
raf_omru: 180g
dogrulandi: 2026-08-01
kaynak:
  - tur: dosya
    isaret: "x.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: null
curuten: null
---

Shipping takes 30 days.
`,
      "utf8",
    );
    const r = olguAra("shipping", { kasaKok: kasa, limit: 10 });
    expect(r.sonuclar.length).toBe(1);
    expect(r.sonuclar[0]!.notlar.join(" ")).toMatch(/schema:/i);
  });

  it("temiz kasa → şema uyarısı yok", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    kasaYaz(kasa, "Shipping takes 30 days");
    const r = olguAra("shipping", { kasaKok: kasa, limit: 10 });
    expect(r.sonuclar[0]!.notlar.join(" ")).not.toMatch(/schema:/i);
  });

  it("boş sorgu → boş küme + açık not", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "kasa");
    kasaYaz(kasa, "Shipping takes 30 days");
    const r = olguAra("", { kasaKok: kasa, limit: 10 });
    expect(r.sonuclar).toEqual([]);
    expect(r.toplam).toBe(0);
    expect((r.notlar ?? []).join(" ")).toMatch(/empty query/i);
  });
});
