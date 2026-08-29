import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { olguAra } from "../src/arama.js";
import { olguDosyaMetni } from "../src/dosya.js";
import { yetkiYaz } from "../src/yetki.js";
import { GOVDE, meta, skalaKasasi } from "./helpers.js";

const temizlenecek: string[] = [];

afterEach(() => {
  for (const d of temizlenecek.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("MCP okuma yetkisi (ORTAM/2)", () => {
  it("ajan yok / profil yok → olgu_ara reddedilir", () => {
    const yetki = mkdtempSync(join(tmpdir(), "mcp-yetki-"));
    const akis = mkdtempSync(join(tmpdir(), "mcp-akis-"));
    const kasa = mkdtempSync(join(tmpdir(), "mcp-kasa-"));
    temizlenecek.push(yetki, akis, kasa);
    const r = olguAra("test", {
      kasaKok: kasa,
      ajan: "yok@multi",
      yetkiKok: yetki,
      akisKok: akis,
      limit: 3,
    });
    expect(r.toplam).toBe(0);
    expect(r.sonuclar).toHaveLength(0);
    expect(r.sinirUyarilari.some((s) => s.includes("yetki yok"))).toBe(true);
  });

  it("mcp-readonly@multi salt-okunur profili ile arama geçer", () => {
    const yetki = mkdtempSync(join(tmpdir(), "mcp-yetki-ok-"));
    const akis = mkdtempSync(join(tmpdir(), "mcp-akis-ok-"));
    const kasa = mkdtempSync(join(tmpdir(), "mcp-kasa-ok-"));
    temizlenecek.push(yetki, akis, kasa);
    skalaKasasi(kasa);
    writeFileSync(
      join(kasa, "aranacak.md"),
      olguDosyaMetni({
        meta: meta({
          konu: "test.yetki",
          baslik: "yetki arama olgusu",
          yazan: "test@tugra",
        }),
        govde: `yetki profili ile arama\n\n${GOVDE}`,
      }),
      "utf8",
    );
    const bas = new Date();
    const son = new Date(bas.getTime() + 2 * 60 * 60 * 1000);
    yetkiYaz(
      {
        ajan: "mcp-readonly@multi",
        seviye: "A1",
        baslangic: bas.toISOString(),
        sona_erme: son.toISOString(),
        karantina: false,
        eksenler: {
          gorus: ["**/*"],
          dokunma: {
            evrensel: "salt_okunur",
            kurum: "salt_okunur",
            dunya: "salt_okunur",
          },
          disa_acilma: "kapali",
          ozerklik: "her_eylemde_sor",
          kalicilik: "okur",
          harcama: { token: 0, tl: 0 },
        },
        turetildi: ["01KYG9HG25N6EDAEW0DAXNC9NR"],
      },
      yetki,
      kasa,
    );
    const r = olguAra("yetki", {
      kasaKok: kasa,
      ajan: "mcp-readonly@multi",
      yetkiKok: yetki,
      akisKok: akis,
      limit: 5,
    });
    expect(r.sinirUyarilari.some((s) => s.includes("yetki yok"))).toBe(false);
    expect(r.toplam).toBeGreaterThan(0);
  });
});
