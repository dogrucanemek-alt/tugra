/**
 * Tek kullanıcı modu — paket kutudan çıkar çıkmaz çalışmalı.
 *
 * 🔴 PAKET/1 GATE BULGUSU (2026-08-29): temiz bir kasada `fact_search`
 * `unauthorized` dönüyordu. Kusur iki katmanlıydı: (1) yetki profili yok
 * (`dosyaYoksaIzin:false`), (2) A-skalası kasadan okunuyor
 * (`yonetisim.yetki.aN`) — yabancının kasasında öyle bir olgu yok.
 * Kanıt canlı kasayla alındığı için ikisi de görünmemişti.
 * 🔑 Kendi kasanla çalışan paket, kurulabilir paket değildir.
 *
 * Karar A: yetki sistemi HİÇ kurulmamışsa — ne ortam değişkeni, ne çağrıda
 * kök, ne de varsayılan `yetki/` dizini — tek kullanıcı modu açılır:
 * okuma serbest, yazma öneri olarak (A2). Yönetişimli bir kurulumda
 * (`yetki/` duruyorsa) ORTAM/2 aynen sürer: profilsiz ajan reddedilir.
 * Bu yüzden aşağıdaki dört testin ikisi POZİTİF, ikisi NEGATİF kontroldür —
 * sadece pozitifi olan bir bekçi, kapıyı açtığını değil yalnız çalıştığını
 * gösterir.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tugraArac } from "../src/mcp.js";
import { yetkiKontrol } from "../src/yetki.js";

const TMPLER: string[] = [];
const ORTAM_ANAHTARLARI = [
  "TUGRA_KOKPIT",
  "TUGRA_YETKI",
  "TALAMUS_KOKPIT",
  "TALAMUS_YETKI",
  "MULTI_YETKI",
] as const;
let ortamYedek: Record<string, string | undefined> = {};

beforeEach(() => {
  ortamYedek = {};
  for (const k of ORTAM_ANAHTARLARI) {
    ortamYedek[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ORTAM_ANAHTARLARI) {
    const v = ortamYedek[k];
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

function tmp(ad: string): string {
  const d = mkdtempSync(join(tmpdir(), ad));
  TMPLER.push(d);
  return d;
}

/** Yabancının makinesi: boş kokpit (yetki/ YOK), içinde tek olguluk kasa. */
function yabanciKurulum(): { kokpit: string; kasa: string; akis: string } {
  const kokpit = tmp("tugra-kokpit-");
  const kasa = tmp("tugra-kasa-");
  const akis = tmp("tugra-akis-");
  writeFileSync(
    join(kasa, "kural.md"),
    `---
uid: 01TESTTEKKULLANICI00000000
tur: kural
kapsam: kurum
dunya: null
konu: test-tek-kullanici
baslik: "Kargo suresi 30 gundur"
sahip: patron
yazan: claude@multi
tarih: 2026-08-01T00:00:00.000Z
guven: 0.9
raf_omru: 180g
dogrulandi: 2026-08-01
kaynak:
  - tur: dosya
    isaret: "test/kaynak.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: null
curuten: null
---

Kargo suresi teslimden itibaren 30 gundur.
`,
    "utf8",
  );
  process.env.TALAMUS_KOKPIT = kokpit;
  return { kokpit, kasa, akis };
}

/**
 * Gerçek yüzey: istemcinin çağırdığı `fact_search`. yetkiKok BİLEREK
 * verilmiyor — `npx tugra` çağrısındaki hâl tam olarak bu.
 */
async function ara(
  kasa: string,
  akis: string,
): Promise<{ toplam: number; uyarilar: string; ham: string }> {
  const c = await tugraArac(
    "fact_search",
    { query: "kargo", limit: 5 },
    { kasaKok: kasa, akisKok: akis },
  );
  const ham = c.content[0]!.text;
  const g = JSON.parse(ham) as { total: number; boundary_warnings: string[] };
  return {
    toplam: g.total,
    uyarilar: (g.boundary_warnings ?? []).join(" "),
    ham,
  };
}

describe("tek kullanıcı modu (PAKET/1 açık kusuru)", () => {
  it("temiz kurulumda arama ÇALIŞIR — profil de skala da yokken", async () => {
    const { kasa, akis } = yabanciKurulum();

    const r = await ara(kasa, akis);

    expect(r.uyarilar).not.toMatch(/yetki yok|unauthorized/i);
    expect(r.toplam).toBeGreaterThan(0);
    // Olgu istemciye GERÇEKTEN ulaşmış olmalı — sayı tek başına kanıt değil.
    expect(r.ham).toMatch(/Kargo suresi 30 gundur/);
  });

  it("okuma serbest, yazma öneri, çalıştırma YASAK — açık kapı değil", () => {
    const { kasa, akis } = yabanciKurulum();
    const ortak = { ajan: "mcp-readonly@multi", kasaKok: kasa, akisKok: akis };

    expect(yetkiKontrol({ ...ortak, eylem: "okuma" }).izin).toBe(true);
    expect(yetkiKontrol({ ...ortak, eylem: "oneri" }).izin).toBe(true);
    expect(yetkiKontrol({ ...ortak, eylem: "calistirma" }).izin).toBe(false);
    expect(yetkiKontrol({ ...ortak, eylem: "bulut_model" }).izin).toBe(false);
  });

  it("NEGATİF: yetki/ dizini varsa ORTAM/2 sürer — profilsiz ajan reddedilir", async () => {
    const { kokpit, kasa, akis } = yabanciKurulum();
    mkdirSync(join(kokpit, "yetki"), { recursive: true });

    const r = await ara(kasa, akis);

    expect(r.toplam).toBe(0);
    expect(r.uyarilar).toMatch(/unauthorized: no authorization profile/i);
  });

  it("büyük/küçük harf katlaması: 'iade' sorgusu 'Iade ...' başlığını bulmalı", async () => {
    const { kasa, akis } = yabanciKurulum();
    writeFileSync(
      join(kasa, "iade.md"),
      `---
uid: 01TESTTEKKULLANICI00000001
tur: kural
kapsam: kurum
dunya: null
konu: test-returns
baslik: "Iade suresi 14 gundur"
sahip: patron
yazan: claude@multi
tarih: 2026-08-01T00:00:00.000Z
guven: 0.9
raf_omru: 180g
dogrulandi: 2026-08-01
kaynak:
  - tur: dosya
    isaret: "test/iade.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: null
curuten: null
---

Iade suresi teslimden itibaren 14 gundur.
`,
      "utf8",
    );

    const c = await tugraArac(
      "fact_search",
      { query: "iade", limit: 5 },
      { kasaKok: kasa, akisKok: akis },
    );
    const ham = c.content[0]!.text;
    const g = JSON.parse(ham) as { total: number; results: { title: string }[] };
    expect(g.total).toBeGreaterThan(0);
    expect(g.results.some((s) => /Iade suresi 14 gundur/.test(s.title))).toBe(
      true,
    );
  });

  it("NEGATİF: TALAMUS_YETKI verilmişse tek kullanıcı modu kapalı", async () => {
    const { kasa, akis } = yabanciKurulum();
    process.env.TALAMUS_YETKI = tmp("tugra-yetki-bos-");

    const r = await ara(kasa, akis);

    expect(r.toplam).toBe(0);
    expect(r.uyarilar).toMatch(/unauthorized: no authorization profile/i);
  });
});
