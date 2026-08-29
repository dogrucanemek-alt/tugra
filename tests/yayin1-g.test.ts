/**
 * YAYIN/1 G — göç betiği, kopyada. Canlı kasaya yazmaz.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canliKasaMi,
  canliKasaYolu,
  gocDil,
  gocDilDogrula,
} from "../src/goc-dil.js";
import { yukleKasa } from "../src/dosya.js";
import { kokpitKok } from "../src/yollar.js";
import { tempKok, temizle } from "./helpers.js";

const kokler: string[] = [];
afterEach(() => {
  while (kokler.length) temizle(kokler.pop()!);
});

const TR = `---
uid: 01YAYIN1G00000000000000001
tur: kural
kapsam: kurum
dunya: null
konu: test.goc
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
stale_after: 2026-09-01
---

Kargo suresi teslimden itibaren 30 gundur.
`;

describe("YAYIN/1 G: goc-dil", () => {
  it("--dry diske hiç yazmıyor", () => {
    const kasa = tempKok();
    kokler.push(kasa);
    const yol = join(kasa, "a.md");
    writeFileSync(yol, TR, "utf8");
    const r = gocDil(kasa, { yaz: false });
    expect(r.dry).toBe(true);
    expect(r.yazilan).toBe(1);
    expect(readFileSync(yol, "utf8")).toBe(TR);
  });

  it("iki kez koşturma → ikincisi atlıyor", () => {
    const kasa = tempKok();
    kokler.push(kasa);
    writeFileSync(join(kasa, "a.md"), TR, "utf8");
    const a = gocDil(kasa, { yaz: true });
    expect(a.yazilan).toBe(1);
    const ham = readFileSync(join(kasa, "a.md"), "utf8");
    expect(ham).toContain("type: rule");
    expect(ham).toContain("Kargo suresi teslimden itibaren 30 gundur.");
    expect(ham).toContain("stale_after: 2026-09-01");
    const b = gocDil(kasa, { yaz: true });
    expect(b.yazilan).toBe(0);
    expect(b.atlanan).toBe(1);
    expect(readFileSync(join(kasa, "a.md"), "utf8")).toBe(ham);
  });

  it("karışık kasa (yarısı çevrilmiş) sorunsuz", () => {
    const kasa = tempKok();
    kokler.push(kasa);
    writeFileSync(join(kasa, "tr.md"), TR, "utf8");
    gocDil(kasa, { yaz: true });
    writeFileSync(
      join(kasa, "tr2.md"),
      TR.replace("01YAYIN1G00000000000000001", "01YAYIN1G00000000000000002"),
      "utf8",
    );
    const r = gocDil(kasa, { yaz: true });
    expect(r.yazilan).toBe(1);
    expect(r.atlanan).toBe(1);
    expect(yukleKasa(kasa)).toHaveLength(2);
  });

  it("depo kasasına niyetsiz yazmayı reddeder", () => {
    expect(canliKasaMi(canliKasaYolu())).toBe(true);
    const r = gocDil(canliKasaYolu(), { yaz: true });
    expect(r.reddedildi).toMatch(/korunan kasa/);
    expect(r.yazilan).toBe(0);
  });

  /**
   * 🔴 GATE BULGUSU (2026-08-29): bekçi yalnız `kokpitKok()/kasa`ya bakıyordu.
   * Kurulu pakette `kokpitKok()` node_modules altını gösterir → en doğal çağrı
   * olan `npx tugra goc-dil <kasa> --yaz` bekçiyi ATLIYORDU. Test in-repo
   * koştuğu için yeşil yanıyordu. Aşağıdaki üç kontrol o boşluğu kapatır.
   */
  describe("korunan kasa = bu kurulumun hizmet ettiği kasa (TALAMUS_KASA)", () => {
    const ORTAM = "TALAMUS_KASA";
    let yedek: string | undefined;
    afterEach(() => {
      if (yedek === undefined) delete process.env[ORTAM];
      else process.env[ORTAM] = yedek;
    });

    function kurulumKasasi(): string {
      const kok = tempKok();
      kokler.push(kok);
      writeFileSync(join(kok, "a.md"), TR, "utf8");
      yedek = process.env[ORTAM];
      process.env[ORTAM] = kok;
      return kok;
    }

    it("TALAMUS_KASA kasasına --yaz, --canli YOKSA reddedilir", () => {
      const kok = kurulumKasasi();
      expect(canliKasaMi(kok)).toBe(true);
      const r = gocDil(kok, { yaz: true });
      expect(r.reddedildi).toMatch(/korunan kasa/);
      expect(r.yazilan).toBe(0);
      // dosya el değmemiş
      expect(readFileSync(join(kok, "a.md"), "utf8")).toContain("\nkonu:");
    });

    it("--canli ile açıkça istenirse geçer", () => {
      const kok = kurulumKasasi();
      const r = gocDil(kok, { yaz: true, canli: true });
      expect(r.reddedildi).toBeUndefined();
      expect(r.yazilan).toBe(1);
      expect(readFileSync(join(kok, "a.md"), "utf8")).toContain("\ntopic:");
    });

    it("önizleme (--dry) korunan kasada da serbest — hiçbir şey yazmaz", () => {
      const kok = kurulumKasasi();
      const r = gocDil(kok);
      expect(r.reddedildi).toBeUndefined();
      expect(r.dry).toBe(true);
      expect(readFileSync(join(kok, "a.md"), "utf8")).toContain("\nkonu:");
    });
  });

  it("320 olguluk kopyada göç → doğrulayıcı 0 fark", () => {
    const canli = join(kokpitKok(), "kasa");
    if (!existsSync(canli)) return;
    const kopya = tempKok();
    kokler.push(kopya);
    cpSync(canli, kopya, { recursive: true });
    const once = tempKok();
    kokler.push(once);
    cpSync(kopya, once, { recursive: true });
    const r = gocDil(kopya, { yaz: true });
    expect(r.reddedildi).toBeUndefined();
    expect(yukleKasa(kopya).length).toBe(yukleKasa(once).length);
    expect(gocDilDogrula(once, kopya)).toEqual([]);
    const ikinci = gocDil(kopya, { yaz: true });
    expect(ikinci.yazilan).toBe(0);
  }, 30_000);
});
