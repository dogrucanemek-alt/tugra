/**
 * 🔴 BULGU (YAYIN/11, Cursor bildirdi · gate kurulu paketten doğruladı):
 * `yetkiKontrol` harcama tavanını `kul + ek > tavan` ile ölçüyor. `ek` NEGATİF
 * gelirse toplam küçülür, tavan aşılmaz ve **tavan reddi izne döner.**
 *
 * MCP'den erişilemiyor (`event_report` şeması `maliyet` taşımıyor; gate altı
 * enjeksiyon denemesi koştu, hepsi reddedildi) — o yüzden yayın engeli
 * sayılmadı. Ama paket `.d.ts` ile `akisBildir`/`yetkiKontrol`'ü public API
 * olarak sunuyor: bir host uygulama kullanıcı verisini `maliyet` alanına
 * bağlarsa tavan aşılabilir.
 *
 * 🔑 Harcama tavanı bir bütçe sınırıdır; negatif harcama bildirimi anlamsızdır
 * ve sessizce 0'a yuvarlamak hatayı gizler. Bu yüzden **reddediliyor**.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { yetkiKontrol } from "../src/yetki.js";

const ORTAM = ["TUGRA_KOKPIT", "TUGRA_KASA", "TALAMUS_KASA", "TUGRA_AKIS", "TUGRA_YETKI", "TALAMUS_YETKI", "MULTI_YETKI"] as const;
let yedek: Record<string, string | undefined> = {};

let kasa: string;
let akis: string;
let yetki: string;

function skalaYaz(kok: string): void {
  for (let n = 0; n <= 5; n++) {
    writeFileSync(
      join(kok, `a${n}.md`),
      `---
uid: 01NEGMAL${n}00000000000000000
tur: kural
kapsam: kurum
dunya: null
konu: yonetisim.yetki.a${n}
baslik: "A${n}"
sahip: owner
yazan: sys@x
tarih: 2026-01-01T00:00:00.000Z
guven: 1
raf_omru: 3650g
dogrulandi: 2026-01-01
kaynak:
  - tur: dosya
    isaret: "policy/a${n}.md#L1"
    alindi: 2026-01-01
baglar: []
etki: []
yerine: null
curuten: null
eksenler:
  dokunma: ${n >= 3 ? "yazma" : "okuma"}
  disa_acilma: yerel_model
  gizlilik: ic
  geri_alinabilirlik: kolay
  etki_alani: dar
  onay: gerekmez
harcama_tavani:
  token: 1000
  tl: 10
---

Level A${n}.
`,
      "utf8",
    );
  }
}

beforeEach(() => {
  yedek = {};
  for (const k of ORTAM) {
    yedek[k] = process.env[k];
    delete process.env[k];
  }
  kasa = mkdtempSync(join(tmpdir(), "negmal-kasa-"));
  akis = mkdtempSync(join(tmpdir(), "negmal-akis-"));
  yetki = mkdtempSync(join(tmpdir(), "negmal-yetki-"));
  skalaYaz(kasa);
  // Harcaması tavanın ÜSTÜNDE olan profilli ajan
  writeFileSync(
    join(yetki, "harcayan@x.json"),
    JSON.stringify({
      ajan: "harcayan@x",
      seviye: "A3",
      baslangic: "2026-01-01T00:00:00.000Z",
      sona_erme: "2027-01-01T00:00:00.000Z",
      harcama_kullanilan: { token: 999_999, tl: 9_999 },
    }),
    "utf8",
  );
});

afterEach(() => {
  for (const k of ORTAM) {
    const v = yedek[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const cagir = (maliyet?: { token: number; tl: number }) =>
  yetkiKontrol({
    ajan: "harcayan@x",
    eylem: "akis",
    maliyet,
    yetkiKok: yetki,
    kasaKok: kasa,
    akisKok: akis,
  });

describe("harcama tavanı — negatif maliyet tavanı aşağı çekemez", () => {
  it("pozitif/sıfır maliyet: tavan aşılmış, REDDEDİLİR (temel davranış)", () => {
    expect(cagir({ token: 0, tl: 0 }).izin).toBe(false);
    expect(cagir(undefined).izin).toBe(false);
  });

  it("🔴 negatif maliyet tavan reddini İZNE çeviremez", () => {
    const r = cagir({ token: -1_000_000, tl: -1_000_000 });
    expect(r.izin, `negatif maliyet izin verdi: ${JSON.stringify(r)}`).toBe(false);
  });

  it("tek alan negatif olsa da geçmez", () => {
    expect(cagir({ token: -1_000_000, tl: 0 }).izin).toBe(false);
    expect(cagir({ token: 0, tl: -1_000_000 }).izin).toBe(false);
  });

  it("negatif maliyetin gerekçesi telde İngilizce kalır", () => {
    const r = cagir({ token: -1, tl: -1 });
    expect(r.izin).toBe(false);
    expect(r.neden ?? "", `gerekçe: ${r.neden}`).not.toMatch(/[çğşıöüÇĞŞİÖÜ]/);
  });
});
