/**
 * YAYIN/3 A — TUGRA_* birincil, TALAMUS_* / MULTI_* geri düşüş.
 * Ajan kimliği mcp-readonly@tugra; eski dosya adı hâlâ okunur.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tugraDoctor } from "../src/kurulum.js";
import { MCP_OKUMA_AJAN, MCP_OKUMA_AJAN_ESKI, yetkiOku } from "../src/yetki.js";
import {
  eskiOrtamUyarilari,
  motorKok,
  varsayilanKasa,
} from "../src/yollar.js";
import { tempKok, temizle } from "./helpers.js";

const ORTAM = [
  "TUGRA_KASA",
  "TALAMUS_KASA",
  "TUGRA_KOKPIT",
  "TALAMUS_KOKPIT",
  "TUGRA_YETKI",
  "TALAMUS_YETKI",
  "MULTI_YETKI",
] as const;

let yedek: Record<string, string | undefined> = {};
const kokler: string[] = [];

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
  while (kokler.length) temizle(kokler.pop()!);
});

describe("YAYIN/3 A: TUGRA_* ortam", () => {
  it("yalnız TUGRA_KASA → kasa bulunuyor", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "tugra-kasa");
    process.env.TUGRA_KASA = kasa;
    expect(varsayilanKasa()).toBe(resolve(kasa));
  });

  it("yalnız TALAMUS_KASA → hâlâ bulunuyor + doctor uyarıyor", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = join(kok, "eski-kasa");
    const akis = join(kok, "akis");
    mkdirSync(kasa, { recursive: true });
    mkdirSync(akis, { recursive: true });
    process.env.TALAMUS_KASA = kasa;
    expect(varsayilanKasa()).toBe(resolve(kasa));
    expect(eskiOrtamUyarilari()).toContain(
      "TALAMUS_KASA is deprecated, use TUGRA_KASA",
    );
    let err = "";
    const exit = tugraDoctor(
      { stderr: { write: (s) => { err += s; } } },
      { kasa, akis, yetki: join(kok, "yetki-yok") },
    );
    expect(exit).toBe(0);
    expect(err).toMatch(/TALAMUS_KASA is deprecated, use TUGRA_KASA/);
    expect(err).toMatch(/doctor: OK/);
  });

  it("ikisi de kurulu → TUGRA_ kazanıyor", () => {
    const kok = tempKok();
    kokler.push(kok);
    const tugra = join(kok, "yeni");
    const eski = join(kok, "eski");
    process.env.TUGRA_KASA = tugra;
    process.env.TALAMUS_KASA = eski;
    expect(varsayilanKasa()).toBe(resolve(tugra));
    expect(eskiOrtamUyarilari()).toEqual([]);
  });

  it("hiçbiri → varsayılan (kokpit/kasa)", () => {
    expect(varsayilanKasa()).toBe(resolve(motorKok(), "..", "kasa"));
  });

  it("eski ajan kimliği dosyası mcp-readonly@tugra okumasında kırılmaz", () => {
    const yetki = join(tempKok(), "yetki");
    kokler.push(yetki);
    mkdirSync(yetki, { recursive: true });
    const kayit = {
      ajan: MCP_OKUMA_AJAN_ESKI,
      seviye: "A1",
      baslangic: "2026-08-01T00:00:00.000Z",
      sona_erme: "2026-08-01T02:00:00.000Z",
    };
    writeFileSync(
      join(yetki, `${MCP_OKUMA_AJAN_ESKI}.json`),
      JSON.stringify(kayit),
      "utf8",
    );
    const okunan = yetkiOku(MCP_OKUMA_AJAN, yetki);
    expect(okunan).toBeTruthy();
    expect(okunan!.ajan).toBe(MCP_OKUMA_AJAN_ESKI);
  });

  it("README birincil TUGRA_*; TALAMUS_/MULTI_ yalnız uyumluluk satırında", () => {
    const ham = readFileSync(join(motorKok(), "README.md"), "utf8");
    const satirlar = ham.split(/\r?\n/);
    const talamus = satirlar.filter((s) => /TALAMUS_|MULTI_/.test(s));
    expect(talamus.length).toBe(1);
    expect(talamus[0]).toMatch(/fallback|Compatibility/i);
    expect(ham).toMatch(/TUGRA_KASA/);
    expect(ham).toMatch(/mcp-readonly@tugra/);
    expect(ham).not.toMatch(/mcp-readonly@multi/);
  });
});
