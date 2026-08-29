/**
 * İç proje adları — tests/fixtures/ic-adlar.txt (gitignore).
 * Public/extract ağaçta dosya yoktur: bekçi atlar ve söyler.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { motorKok } from "../src/yollar.js";

export const SENTETIK_KIRMIZI = "kirmizi-test-adi-XYZZY";
export const IC_ADLAR_YOL = join(motorKok(), "tests", "fixtures", "ic-adlar.txt");

let uyariVerildi = false;

export function icAdlarOku(): string[] | null {
  if (!existsSync(IC_ADLAR_YOL)) {
    if (!uyariVerildi) {
      uyariVerildi = true;
      console.warn(
        "YAYIN/2 B: tests/fixtures/ic-adlar.txt yok — sızıntı bekçisi pack taraması atlanıyor (public/extract ağaç)",
      );
    }
    return null;
  }
  return readFileSync(IC_ADLAR_YOL, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}
