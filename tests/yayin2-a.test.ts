/**
 * YAYIN/2 A — konu haritası kodda değil, kasada.
 * Paket boş haritayla gelir. Patronun 69 kuralı kasa/_konu-haritasi.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DESEN_TAVAN,
  konuBelirleFromGirdi,
  konuHaritasiKur,
  konuHaritasiSifirla,
  konuHaritasiYukle,
} from "../src/konu.js";
import { varsayilanKasa } from "../src/yollar.js";
import { icAdlarOku } from "./ic-adlar.js";
import { packTara } from "./sizinti.js";

afterEach(() => {
  konuHaritasiSifirla();
});

describe("YAYIN/2 A: konu haritası", () => {
  it("boş haritada uydurmaz ve patlamaz", () => {
    konuHaritasiSifirla();
    const konu = konuBelirleFromGirdi({
      description: "iskonto kampanyasi",
      dosyaAd: "note.md",
      baslik: "iskonto",
      kapsam: "kurum",
      dunya: null,
    });
    expect(konu).toBe("kurum.genel");
    expect(konu).not.toBe("satis.iskonto");
  });

  it("patron haritasi: her ornek eski konuya düşer (69 kural)", () => {
    const yol = join(varsayilanKasa(), "_konu-haritasi.json");
    if (!existsSync(yol)) return;
    const ham = JSON.parse(readFileSync(yol, "utf8")) as {
      harita: { desen: string; konu: string; ornek?: string }[];
      alt_kirilim: unknown[];
      stem: unknown[];
    };
    expect(ham.harita.length + ham.alt_kirilim.length + ham.stem.length).toBe(69);
    const uyarilar = konuHaritasiYukle(varsayilanKasa());
    expect(uyarilar).toEqual([]);
    for (const k of ham.harita) {
      const ornek = k.ornek;
      if (!ornek) continue;
      const c = konuBelirleFromGirdi({
        description: ornek,
        dosyaAd: "x.md",
        baslik: ornek,
        kapsam: "kurum",
        dunya: null,
      });
      expect(c, ornek).toBe(k.konu);
    }
  });

  it("bozuk ve aşırı uzun desen atlanır ve uyarır", () => {
    const u = konuHaritasiKur({
      harita: [
        { desen: "(", bayrak: "i", konu: "test.bozuk" },
        { desen: "a".repeat(DESEN_TAVAN + 1), bayrak: "i", konu: "test.uzun" },
        { desen: "ok", bayrak: "i", konu: "test.ok" },
      ],
    });
    expect(u.some((s) => /bozuk desen/i.test(s))).toBe(true);
    expect(u.some((s) => /cok uzun|çok uzun/i.test(s))).toBe(true);
    const c = konuBelirleFromGirdi({
      description: "ok",
      dosyaAd: "x.md",
      baslik: "ok",
      kapsam: "kurum",
      dunya: null,
    });
    expect(c).toBe("test.ok");
  });

  it.skipIf(!icAdlarOku())("tarball'da iş taksonomisi yok", () => {
    const istenen = /(?:^|\/)(README\.md|package\.json|konu\.js|arama\.js|mcp\.js)$/;
    const b = packTara().filter((x) => istenen.test(x.yol.replace(/\\/g, "/")));
    expect(b).toEqual([]);
  }, 180_000);
});
