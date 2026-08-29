/**
 * YAYIN/6 — oturum paketten düşer; sızıntı bekçisi GitHub yüzeyini de tarar.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motorKok } from "../src/yollar.js";
import { npmPackDosyaListesi } from "./paket-liste.js";
import {
  extractAday,
  extractKokOku,
  extractTara,
  turkceDosyaTara,
} from "./sizinti.js";

describe("YAYIN/6 A: oturum paketten düşer", () => {
  it("tarball'da oturum yok, sir var", () => {
    const files = npmPackDosyaListesi().map((f) => f.replace(/\\/g, "/"));
    expect(
      files.filter((f) => /(^|\/)oturum\./.test(f)),
      files.filter((f) => /oturum/i.test(f)).join(","),
    ).toEqual([]);
    expect(files.some((f) => f === "dist-paket/sir.js")).toBe(true);
  }, 180_000);

  it('dist-paket\'te "dedim ya" / "değil" kalıbı yok', () => {
    const kok = join(motorKok(), "dist-paket");
    expect(existsSync(kok), "dist-paket yok — prepack çalışmadı").toBe(true);
    const kirli: string[] = [];
    for (const ad of readdirSync(kok)) {
      if (!ad.endsWith(".js")) continue;
      const ham = readFileSync(join(kok, ad), "utf8");
      // Oturum işlevi — iç sözlükteki "değil" (yetki/tarayıcı) hedef değil.
      if (/dedim ya/i.test(ham) || /x_degil_y/.test(ham) || /demi\[sş\]tim/.test(ham)) {
        kirli.push(ad);
      }
    }
    expect(kirli).toEqual([]);
  });
});

describe("YAYIN/6 B: extract yüzeyi", () => {
  it("kasıtlı Türkçe transkript cümlesi → kırmızı", () => {
    const d = join(tmpdir(), `yayin6-tr-${Date.now()}`);
    mkdirSync(join(d, "tests"), { recursive: true });
    /* SENTETİK cümle — patronun gerçek transkriptinden DEĞİL.
     * İlk hâli gerçek bir oturum cümlesiydi ve bekçiden kaçsın diye
     * kelimelere bölünmüştü; o cümle public depoya, oradan da kalıcı git
     * geçmişine girecekti. Negatif kontrolün işi bekçinin ateşlediğini
     * göstermek; bunun için gerçek içerik gerekmez.
     * (YAYIN/3 C'de konan kural: negatif kontrol sentetik olsun.) */
    const cumle = [
      "sentetik",
      "kırmızı",
      "kontrol",
      "cümlesi",
      "değil",
      "mi",
    ].join(" ");
    writeFileSync(join(d, "tests", "planted.ts"), `export const x = "${cumle}";\n`, "utf8");
    const b = turkceDosyaTara(d);
    rmSync(d, { recursive: true, force: true });
    expect(b.some((x) => /planted/.test(x.yol))).toBe(true);
  });

  it("src/sir.ts yakalayıcı desenleri sessiz", () => {
    const d = join(tmpdir(), `yayin6-sir-${Date.now()}`);
    mkdirSync(join(d, "src"), { recursive: true });
    writeFileSync(
      join(d, "src", "sir.ts"),
      readFileSync(join(motorKok(), "src", "sir.ts"), "utf8"),
      "utf8",
    );
    const b = extractTara(d);
    rmSync(d, { recursive: true, force: true });
    expect(b).toEqual([]);
  });

  it("extract yoksa atlar ve söyler", () => {
    const msgs: string[] = [];
    const kok = extractKokOku({
      aday: join(tmpdir(), "yok-extract-yayin6-xyz"),
      uyar: (s) => msgs.push(s),
    });
    expect(kok).toBeNull();
    expect(msgs.join(" ")).toMatch(/extract.*yok|atlanıyor/i);
  });

  it("extract ağacında tests/oturum.test.ts yok", () => {
    const kok = extractKokOku({ aday: extractAday(), uyar: () => {} });
    if (!kok) return;
    expect(existsSync(join(kok, "tests", "oturum.test.ts"))).toBe(false);
  });
});
