/**
 * Two holes found while migrating the drafts, 2026-09-10.
 *
 * 1. The live-vault guard compared paths for EQUALITY. A subdirectory of a
 *    protected vault — `<kasa>/_oneriler` — was therefore not protected, and
 *    `--yaz` alone would have written inside the vault the guard exists to
 *    defend. This is the same shape as the 2026-08-29 finding recorded at the
 *    top of goc-dil.ts: the guard looked at one path instead of at intent.
 *
 * 2. Reaching the drafts by pointing the tool at `<kasa>/_oneriler` would
 *    also drop its backup at `<kasa>/_oneriler.goc-yedek` — INSIDE the vault.
 *    Nothing skips that directory, so 76 draft copies would have been read
 *    as facts. The drafts are reached with a flag instead, so the root stays
 *    the vault and the backup stays outside it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canliKasaMi, gocDil } from "../src/goc-dil.js";
import { taraMarkdown } from "../src/dosya.js";
import { varsayilanKasa } from "../src/yollar.js";
import { tempKok, temizle } from "./helpers.js";

const kokler: string[] = [];
afterEach(() => {
  while (kokler.length) temizle(kokler.pop()!);
});

const OLGU = `---
uid: 01DRAFTDRAFTDRAFTDRAFTDRAFT
tur: gozlem
kapsam: kurum
dunya: null
konu: test.taslak
baslik: A draft waiting for a human
sahip: patron
yazan: test
tarih: 2026-09-10T00:00:00.000Z
guven: 0.5
raf_omru: 14g
dogrulandi: 2026-09-10
kaynak: []
baglar: []
etki: []
yerine: null
curuten: null
---

Body.
`;

describe("the drafts migrate too, without breaking the vault", () => {
  it("RED: a path INSIDE a protected vault is protected", () => {
    const kasa = varsayilanKasa();
    expect(canliKasaMi(kasa), "the vault itself must be protected").toBe(true);
    expect(
      canliKasaMi(join(kasa, "_oneriler")),
      "a subdirectory of the vault slipped past the guard",
    ).toBe(true);
    expect(
      canliKasaMi(join(kasa, "dunya", "altyapi")),
      "any subdirectory is inside the vault",
    ).toBe(true);
  });

  it("a sibling that merely starts with the same letters is NOT protected", () => {
    // `<kasa>-yedek` is not `<kasa>/...`; a prefix test without a separator
    // would have swallowed it and refused a legitimate write.
    expect(canliKasaMi(`${varsayilanKasa()}-yedek`)).toBe(false);
    expect(canliKasaMi(`${varsayilanKasa()}.goc-yedek`)).toBe(false);
  });

  it("the vault scan still refuses to see drafts — that rule does not move", () => {
    const kok = tempKok();
    kokler.push(kok);
    mkdirSync(join(kok, "_oneriler"), { recursive: true });
    writeFileSync(join(kok, "olgu.md"), OLGU, "utf8");
    writeFileSync(join(kok, "_oneriler", "taslak.md"), OLGU, "utf8");

    expect(taraMarkdown(kok)).toHaveLength(1);
    expect(taraMarkdown(kok, { taslaklar: true })).toHaveLength(2);
  });

  it("RED: with the flag, a draft is migrated; without it, it is left alone", () => {
    const kok = tempKok();
    kokler.push(kok);
    mkdirSync(join(kok, "_oneriler"), { recursive: true });
    const taslak = join(kok, "_oneriler", "taslak.md");
    writeFileSync(join(kok, "olgu.md"), OLGU, "utf8");
    writeFileSync(taslak, OLGU, "utf8");

    const sade = gocDil(kok, { yaz: true });
    expect(sade.yazilan, "only the fact should have moved").toBe(1);
    expect(readFileSync(taslak, "utf8")).toContain("raf_omru: 14g");

    const ile = gocDil(kok, { yaz: true, taslaklar: true });
    expect(ile.yazilan, "the draft should have moved now").toBe(1);
    const sonra = readFileSync(taslak, "utf8");
    expect(sonra).toContain("shelf_life: 14d");
    expect(sonra).toContain("type: observation");
    expect(sonra).not.toContain("raf_omru");
    expect(sonra).toContain("Body.");
  });

  it("the backup stays outside the tree that is being walked", () => {
    const kok = tempKok();
    kokler.push(kok);
    mkdirSync(join(kok, "_oneriler"), { recursive: true });
    writeFileSync(join(kok, "_oneriler", "taslak.md"), OLGU, "utf8");

    const r = gocDil(kok, { yaz: true, taslaklar: true });
    expect(r.yedek).toBe(`${kok}.goc-yedek`);
    expect(existsSync(`${kok}.goc-yedek`)).toBe(true);
    // Nothing named *.goc-yedek may appear inside the vault itself.
    expect(existsSync(join(kok, "_oneriler.goc-yedek"))).toBe(false);
    temizle(`${kok}.goc-yedek`);
  });
});
