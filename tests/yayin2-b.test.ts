/**
 * YAYIN/2 B — sızıntı bekçisi. npm pack --dry-run --json listesini diskte tarar.
 * tar yok: Windows yolu uzak sunucu sanılmaz; .tgz diske düşmez.
 * İç ad listesi fixtures/ic-adlar.txt (gitignore); yoksa pack taraması atlanır.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motorKok } from "../src/yollar.js";
import { icAdlarOku, SENTETIK_KIRMIZI } from "./ic-adlar.js";
import { paketDiskYollari } from "./paket-liste.js";
import { extractKokOku, extractTara, packTara, sizintiTara } from "./sizinti.js";

const IC_ADLAR = icAdlarOku();

describe("YAYIN/2 B: sızıntı bekçisi", () => {
  it(`kasıtlı ${SENTETIK_KIRMIZI} eklenince kırmızı`, () => {
    const d = mkdtempSync(join(tmpdir(), "yayin2-b-kir-"));
    writeFileSync(join(d, "sızıntı.js"), `const x = "${SENTETIK_KIRMIZI}";\n`, "utf8");
    const b = sizintiTara(d);
    rmSync(d, { recursive: true, force: true });
    expect(b.some((x) => x.eslesen === SENTETIK_KIRMIZI)).toBe(true);
  });

  it.skipIf(!IC_ADLAR)("sır yakalayıcısı yanlış alarm değil", () => {
    const once = new Set(
      readdirSync(motorKok()).filter((f) => f.endsWith(".tgz")),
    );
    const sir = paketDiskYollari().find((p) =>
      p.rel.replace(/\\/g, "/").endsWith("dist-paket/sir.js"),
    );
    expect(sir, "pack listesinde sir.js").toBeTruthy();
    const ham = readFileSync(sir!.tam, "utf8");
    expect(ham).toMatch(/sk-ant-/);
    const b = packTara().filter(
      (x) => /sir\.js/.test(x.yol) && /sk-ant-/.test(x.eslesen),
    );
    expect(b).toEqual([]);
    const sonra = readdirSync(motorKok()).filter((f) => f.endsWith(".tgz"));
    expect(sonra.filter((f) => !once.has(f))).toEqual([]);
  }, 180_000);

  it.skipIf(!extractKokOku())("extract ağacı temiz (GitHub yüzeyi)", () => {
    const kok = extractKokOku();
    expect(kok).toBeTruthy();
    expect(extractTara(kok!)).toEqual([]);
  });

  it.skipIf(!IC_ADLAR)("tarball temiz (disk listesi, tar yok)", () => {
    const once = new Set(
      readdirSync(motorKok()).filter((f) => f.endsWith(".tgz")),
    );
    expect(packTara()).toEqual([]);
    const sonra = readdirSync(motorKok()).filter((f) => f.endsWith(".tgz"));
    expect(sonra.filter((f) => !once.has(f))).toEqual([]);
  }, 180_000);
});
