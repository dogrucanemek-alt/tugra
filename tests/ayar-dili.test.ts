/**
 * The names a user types — MCP registry, README examples, install blocks —
 * are English. Turkish TUGRA_* names remain as fallback only.
 *
 * Why this guard is a file scan, not a table: a new client example that
 * copies TUGRA_KASA into a JSON fence would otherwise ship unnoticed.
 * Compatibility lines are exempt by prefix, not by name, so the old names
 * can stay on that one sentence without going stale in the examples.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { motorKok, varsayilanKasa } from "../src/yollar.js";
import { tempKok, temizle } from "./helpers.js";

const INGILIZCE_AYAR = new Set([
  "TUGRA_VAULT",
  "TUGRA_EVENTS",
  "TUGRA_AUTH",
  "TUGRA_HOME",
  "TUGRA_RECORDS",
  "TUGRA_TRANSCRIPTS",
  "TUGRA_EXTRACT",
  "TUGRA_PUBLIC",
]);

const TURKCE_AYAR = [
  "TUGRA_KASA",
  "TUGRA_AKIS",
  "TUGRA_YETKI",
  "TUGRA_KOKPIT",
  "TUGRA_KAYIT",
  "TUGRA_TRANSKRIPT",
] as const;

const ORTAM = [
  "TUGRA_VAULT",
  "TUGRA_KASA",
  "TALAMUS_KASA",
  "TUGRA_HOME",
  "TUGRA_KOKPIT",
  "TALAMUS_KOKPIT",
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

function turkceAyarlar(metin: string): string[] {
  return TURKCE_AYAR.filter((ad) => new RegExp(`\\b${ad}\\b`).test(metin));
}

function jsonTomlBloklari(ham: string): string[] {
  const out: string[] = [];
  const re = /```(?:json|toml)\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham))) out.push(m[1]);
  return out;
}

function belgedekiKusurlar(ham: string): string[] {
  const kusur: string[] = [];
  for (const [i, blok] of jsonTomlBloklari(ham).entries()) {
    const adlar = turkceAyarlar(blok);
    if (adlar.length) kusur.push(`fence ${i}: ${adlar.join(", ")}`);
  }
  for (const [n, satir] of ham.split(/\r?\n/).entries()) {
    if (satir.startsWith("Compatibility:")) continue;
    const adlar = turkceAyarlar(satir);
    if (adlar.length) kusur.push(`L${n + 1}: ${adlar.join(", ")}`);
  }
  return kusur;
}

describe("setting names the user types are English", () => {
  it("server.json environmentVariables[].name is an English name", () => {
    // server.json exists only in the published tree; in the source tree the
    // publish script writes it. Read whichever is present, never neither:
    // the names hid in the generator once, where no guard was looking.
    const kayitYolu = resolve(motorKok(), "server.json");
    const uretenYolu = resolve(motorKok(), "..", "scripts", "yayin2-public-kopya.mjs");
    let adlar: string[];
    if (existsSync(kayitYolu)) {
      const kayit = JSON.parse(readFileSync(kayitYolu, "utf8")) as {
        packages: { environmentVariables: { name: string }[] }[];
      };
      adlar = kayit.packages.flatMap((p) =>
        (p.environmentVariables ?? []).map((e) => e.name),
      );
    } else {
      const ureten = readFileSync(uretenYolu, "utf8");
      const blok = ureten.slice(ureten.indexOf("environmentVariables"));
      adlar = [...blok.matchAll(/name: "(TUGRA_[A-Z_]+)"/g)].map((m) => m[1]);
    }
    expect(adlar.length).toBeGreaterThan(0);
    const yabanci = adlar.filter((ad) => !INGILIZCE_AYAR.has(ad));
    expect(yabanci, `not an English setting name: ${yabanci.join(", ")}`).toEqual(
      [],
    );
  });

  it("README.json/toml examples and prose do not lead with Turkish names", () => {
    const ham = readFileSync(resolve(motorKok(), "README.md"), "utf8");
    expect(belgedekiKusurlar(ham)).toEqual([]);
  });

  it("docs/install.md examples do not lead with Turkish names", () => {
    const ham = readFileSync(
      resolve(motorKok(), "docs", "install.md"),
      "utf8",
    );
    expect(belgedekiKusurlar(ham)).toEqual([]);
  });

  it("TUGRA_KASA still resolves when TUGRA_VAULT is unset", () => {
    const kok = tempKok();
    kokler.push(kok);
    const kasa = resolve(kok, "eski-kasa");
    process.env.TUGRA_KASA = kasa;
    delete process.env.TUGRA_VAULT;
    expect(varsayilanKasa()).toBe(kasa);
  });
});
