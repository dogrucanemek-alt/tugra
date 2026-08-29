/**
 * MCP yüzeyi TEK DİL konuşur: İngilizce.
 *
 * 🔴 BULGU (2026-08-29, kurulu paketten ölçüldü): araç adları ve parametreler
 * İngilizce ama DEĞERLER ve GEREKÇELER Türkçe dönüyordu —
 * `"durum":"bayat"`, `"tur":"sinir"`, `"bu olgu 236 gündür doğrulanmadı"`,
 * `"[bayat] Team plan costs 49 dollars"`. Model bu cümleleri okuyup
 * kullanıcıya tekrarlıyor; yani ürünün EN DEĞERLİ üç cümlesi
 * ("bayatlamış", "uydurma yasak", "emekli oldu") yabancıya Türkçe çıkıyordu.
 *
 * Karar: çeviri YALNIZ MCP sınırında yapılır — girişteki `TUR_DIS`/`KAYNAK_DIS`
 * haritalarının tersi. Diskte saklanan şekil (kaynak/guven/raf_omru/sinir)
 * DEĞİŞMEZ; README'deki "vault's native shape" kararı ayakta kalır, patronun
 * 398 olgusu ve kokpit olduğu yerde durur.
 *
 * 🔑 Bu bekçi neden geniş: serbest metni tablo ile çevirmek kırılgandır —
 * `arama.ts`'te bir cümle değişirse çeviri sessizce düşer. O yüzden burada
 * tek tek cümle beklemiyoruz; CEVABIN TAMAMINDA Türkçe harf/kelime arıyoruz.
 * Yeni bir Türkçe metin eklenirse bu test kırmızıya döner.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tugraArac } from "../src/mcp.js";

const TMPLER: string[] = [];
const ORTAM = [
  "TUGRA_KOKPIT",
  "TUGRA_YETKI",
  "TALAMUS_KOKPIT",
  "TALAMUS_YETKI",
  "MULTI_YETKI",
] as const;
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
      rmSync(TMPLER.pop()!, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
});

/** Türkçe'ye özgü harfler + ürünün bilinen Türkçe kelimeleri. */
const TURKCE =
  /[çğşıöüÇĞŞİÖÜ]|\b(taze|bayat|curuk|emekli|olgu|kasa|yetki|sinir|kanitsiz|gozlem|kural|karar|neden|notlar|konu|guven|tazelik|kaynak|yasak|gundur|yerine|bulunamadi|taslagi|oneri)\b/i;

/** Kullanıcının kendi içeriği İngilizce — dönen Türkçe SADECE üründen gelebilir. */
function yabanciKasa(): { kasa: string; akis: string } {
  const kokpit = mkdtempSync(join(tmpdir(), "dil-kokpit-"));
  const kasa = mkdtempSync(join(tmpdir(), "dil-kasa-"));
  const akis = mkdtempSync(join(tmpdir(), "dil-akis-"));
  TMPLER.push(kokpit, kasa, akis);
  process.env.TALAMUS_KOKPIT = kokpit;

  const yaz = (
    ad: string,
    o: {
      uid: string;
      baslik: string;
      govde: string;
      tur?: string;
      konu: string;
      raf?: string;
      dog?: string;
      yerine?: string;
      kaynakTur?: string;
    },
  ) =>
    writeFileSync(
      join(kasa, ad),
      `---
uid: ${o.uid}
tur: ${o.tur ?? "kural"}
kapsam: kurum
dunya: null
konu: ${o.konu}
baslik: "${o.baslik}"
sahip: patron
yazan: agent@example
tarih: 2026-08-01T00:00:00.000Z
guven: 0.9
raf_omru: ${o.raf ?? "180g"}
dogrulandi: ${o.dog ?? "2026-08-01"}
kaynak:
  - tur: ${o.kaynakTur ?? "dosya"}
    isaret: "policy/x.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: ${o.yerine ?? "null"}
curuten: null
---

${o.govde}
`,
      "utf8",
    );

  yaz("fresh.md", { uid: "01DILTAZE00000000000000000", konu: "policy.shipping", baslik: "Shipping takes 30 days", govde: "Shipping takes 30 days." });
  yaz("stale.md", { uid: "01DILBAYAT0000000000000000", konu: "policy.pricing", baslik: "Team plan costs 49 dollars", raf: "30g", dog: "2026-01-05", govde: "Team plan costs 49 dollars per seat." });
  yaz("old.md", { uid: "01DILESKI00000000000000000", konu: "policy.billing", baslik: "Billing uses charges api", govde: "Billing uses the charges api." });
  yaz("new.md", { uid: "01DILYENI00000000000000000", konu: "policy.billing", baslik: "Billing uses payment intents", yerine: "01DILESKI00000000000000000", govde: "Billing uses payment intents." });
  yaz("boundary.md", { uid: "01DILSINIR0000000000000000", tur: "sinir", konu: "policy.medical", baslik: "Medical outcomes", govde: "Do not infer medical outcomes." });
  yaz("observed.md", { uid: "01DILGOZLEM000000000000000", tur: "gozlem", konu: "policy.usage", baslik: "Users open the app at night", govde: "Users seem to open the app at night." });
  yaz("external.md", { uid: "01DILDIS000000000000000000", konu: "market.share", baslik: "Competitor holds 12 percent", kaynakTur: "web", govde: "Competitor holds 12 percent of the market." });

  return { kasa, akis };
}

async function cagir(
  ad: Parameters<typeof tugraArac>[0],
  args: Record<string, unknown>,
  kasa: string,
  akis: string,
): Promise<string> {
  const c = await tugraArac(ad, args, { kasaKok: kasa, akisKok: akis });
  return c.content[0]!.text;
}

/** Türkçe geçen satırları döndürür — hata mesajı neyin sızdığını göstersin. */
function turkceSatirlar(metin: string): string[] {
  return metin
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .filter((s) => s && TURKCE.test(s));
}

describe("MCP yüzeyi İngilizce konuşur", () => {
  const senaryolar: { ad: string; arac: "fact_search" | "fact_read"; args: Record<string, unknown> }[] = [
    { ad: "taze olgu", arac: "fact_search", args: { query: "shipping" } },
    { ad: "bayat olgu", arac: "fact_search", args: { query: "plan" } },
    { ad: "emekli olgu", arac: "fact_search", args: { query: "billing" } },
    { ad: "sinir konusu", arac: "fact_search", args: { query: "medical" } },
    { ad: "gozlem", arac: "fact_search", args: { query: "night" } },
    { ad: "dis kaynak", arac: "fact_search", args: { query: "competitor" } },
    { ad: "arsiv dahil", arac: "fact_search", args: { query: "billing", archive: true } },
    { ad: "okuma: emekli", arac: "fact_read", args: { uid: "01DILESKI00000000000000000", agent: "mcp-readonly@multi" } },
    { ad: "okuma: bayat", arac: "fact_read", args: { uid: "01DILBAYAT0000000000000000", agent: "mcp-readonly@multi" } },
    { ad: "okuma: sinir", arac: "fact_read", args: { uid: "01DILSINIR0000000000000000", agent: "mcp-readonly@multi" } },
    { ad: "okuma: olmayan uid", arac: "fact_read", args: { uid: "01YOKYOKYOK0000000000000000", agent: "mcp-readonly@multi" } },
  ];

  for (const s of senaryolar) {
    it(`${s.arac} — ${s.ad}`, async () => {
      const { kasa, akis } = yabanciKasa();
      const metin = await cagir(s.arac, s.args, kasa, akis);
      const kirli = turkceSatirlar(metin);
      expect(kirli, `Türkçe sızdı:\n${kirli.join("\n")}`).toEqual([]);
    });
  }

  it("fact_propose — cevap da diske yazılan taslak da İngilizce", async () => {
    const { kasa, akis } = yabanciKasa();
    const metin = await cagir(
      "fact_propose",
      {
        type: "rule",
        topic: "policy.returns",
        agent: "mcp-readonly@multi",
        title: "Returns within 14 days",
        body: "Returns are accepted within 14 days.",
        source: [{ type: "file", pointer: "policy/returns.md#L1", taken: "2026-08-29" }],
      },
      kasa,
      akis,
    );
    const kirli = turkceSatirlar(metin);
    expect(kirli, `Türkçe sızdı:\n${kirli.join("\n")}`).toEqual([]);
  });
});
