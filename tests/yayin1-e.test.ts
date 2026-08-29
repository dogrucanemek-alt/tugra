/**
 * YAYIN/1 E — tugra init + doctor + TTY/boru ayrımı.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TUGRA_SURUM,
  tugraCli,
  tugraDoctor,
  tugraInit,
} from "../src/kurulum.js";
import { tempKok, temizle } from "./helpers.js";

const kokler: string[] = [];
afterEach(() => {
  while (kokler.length) temizle(kokler.pop()!);
});

function io(argv: string[], stdinIsTTY: boolean, cwd: string) {
  let out = "";
  let err = "";
  return {
    bag: {
      argv,
      stdinIsTTY,
      cwd,
      stdout: { write: (s: string) => { out += s; } },
      stderr: { write: (s: string) => { err += s; } },
    },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}

describe("YAYIN/1 E: TTY / boru", () => {
  it("boru (TTY yok) + argümansız → sunucu modu, stdout boş", () => {
    const cwd = tempKok();
    kokler.push(cwd);
    const i = io([], false, cwd);
    const r = tugraCli(i.bag);
    expect(r.mode).toBe("server");
    expect(i.out).toBe("");
  });

  it("TTY + argümansız → yardım basar ve çıkar (asılı kalmaz)", () => {
    const cwd = tempKok();
    kokler.push(cwd);
    const i = io([], true, cwd);
    const r = tugraCli(i.bag);
    expect(r.mode).toBe("help");
    expect(r.exit).toBe(0);
    expect(i.err).toMatch(/tugra/);
    expect(i.err).toMatch(/init/);
    expect(i.out).toBe("");
  });

  it("tugra --version", () => {
    const cwd = tempKok();
    kokler.push(cwd);
    const i = io(["--version"], true, cwd);
    const r = tugraCli(i.bag);
    expect(r.mode).toBe("version");
    expect(i.err.trim()).toBe(TUGRA_SURUM);
    expect(i.out).toBe("");
  });
});

describe("YAYIN/1 E: init + doctor", () => {
  it("init iki kez → ikincisi var olanı ezmiyor", () => {
    const cwd = tempKok();
    kokler.push(cwd);
    const i1 = io(["init", "demo"], true, cwd);
    const a = tugraCli(i1.bag);
    expect(a.mode).toBe("init");
    const hello = join(cwd, "demo", "kasa", "hello.md");
    expect(existsSync(hello)).toBe(true);
    const once = readFileSync(hello, "utf8");
    writeFileSync(hello, once + "\n# KEEP\n", "utf8");

    const i2 = io(["init", "demo"], true, cwd);
    tugraCli(i2.bag);
    expect(readFileSync(hello, "utf8")).toContain("# KEEP");
    expect(i2.err).toMatch(/not overwritten/);
  });

  it("doctor bozuk kurulumda exit ≠ 0, sağlamda 0", () => {
    const yok = io([], true, tempKok());
    kokler.push(yok.bag.cwd);
    expect(
      tugraDoctor(yok.bag, {
        kasa: join(yok.bag.cwd, "yok-kasa"),
        akis: join(yok.bag.cwd, "yok-akis"),
        yetki: join(yok.bag.cwd, "yok-yetki"),
      }),
    ).toBe(1);
    expect(yok.err).toMatch(/MISSING vault/);

    const kok = tempKok();
    kokler.push(kok);
    const err = { write: () => {} };
    tugraInit(kok, { stderr: err });
    const saglam = io([], true, kok);
    expect(
      tugraDoctor(saglam.bag, {
        kasa: join(kok, "kasa"),
        akis: join(kok, "akis"),
        yetki: join(kok, "yetki-yok"),
      }),
    ).toBe(0);
    expect(saglam.err).toMatch(/schema warnings: 0/);
    expect(saglam.err).toMatch(/doctor: OK/);
  });
});
