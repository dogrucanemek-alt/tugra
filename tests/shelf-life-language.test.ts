/**
 * The shelf life is written in the reader's language, and every earlier
 * spelling still reads.
 *
 * Found 2026-09-10: the vault writes English field names, but the shelf_life
 * VALUE stayed Turkish -- `suresiz` and `<n>g`, where the `g` is `gun`. Worse
 * than cosmetic: `parseRafOmru` accepted only those two shapes, so a reader
 * who wrote the natural English form got `Invalid shelf_life` thrown at them.
 * The page promises English fields and the parser then refused English values.
 *
 * The rule this file holds: the writer emits English, the reader accepts every
 * shape that has ever been written. A vault must never stop reading -- 396
 * facts on this machine carry the old spelling, and a migration that breaks
 * them the moment it lands is not a migration.
 */
import { describe, expect, it } from "vitest";
import {
  frontmatterDisaYaz,
  frontmatterIceAl,
  rafOmruDisaYaz,
  rafOmruIceAl,
} from "../src/vocabulary.js";
import { parseRafOmru } from "../src/sema.js";

const fm = (o: Record<string, unknown>) =>
  frontmatterDisaYaz(o) as Record<string, unknown>;
const oku = (o: Record<string, unknown>) =>
  frontmatterIceAl(o) as Record<string, unknown>;

describe("shelf life speaks the reader's language", () => {
  it("the writer emits English", () => {
    expect(rafOmruDisaYaz("suresiz")).toBe("indefinite");
    expect(rafOmruDisaYaz("90g")).toBe("90d");
    expect(rafOmruDisaYaz("14g")).toBe("14d");
  });

  it("the reader takes English back to the internal shape", () => {
    expect(rafOmruIceAl("indefinite")).toBe("suresiz");
    expect(rafOmruIceAl("90d")).toBe("90g");
  });

  it("the reader still takes the old spelling — the vault never stops reading", () => {
    expect(rafOmruIceAl("suresiz")).toBe("suresiz");
    expect(rafOmruIceAl("90g")).toBe("90g");
  });

  it("a value the migration does not know is left alone, not mangled", () => {
    expect(rafOmruDisaYaz("whenever")).toBe("whenever");
    expect(rafOmruIceAl("whenever")).toBe("whenever");
    expect(rafOmruDisaYaz(7)).toBe(7);
  });

  it("a written fact carries the English key AND the English value", () => {
    const disk = fm({ uid: "u1", tur: "kural", raf_omru: "suresiz" });
    expect(disk.shelf_life).toBe("indefinite");
    expect(disk.type).toBe("rule");
    expect(disk.raf_omru).toBeUndefined();
  });

  it("round trip: internal → disk → internal is the identity", () => {
    for (const raf of ["suresiz", "90g", "14g", "180g"]) {
      const disk = fm({ uid: "u1", raf_omru: raf });
      expect(oku(disk).raf_omru, `round trip broke for ${raf}`).toBe(raf);
    }
  });

  it("the three shapes that exist on disk today all read", () => {
    // The old vault: Turkish key, Turkish value.
    expect(oku({ raf_omru: "suresiz" }).raf_omru).toBe("suresiz");
    // The mixed vault this defect produced: English key, Turkish value.
    expect(oku({ shelf_life: "suresiz" }).raf_omru).toBe("suresiz");
    expect(oku({ shelf_life: "90g" }).raf_omru).toBe("90g");
    // What the writer produces from now on.
    expect(oku({ shelf_life: "indefinite" }).raf_omru).toBe("suresiz");
    expect(oku({ shelf_life: "90d" }).raf_omru).toBe("90g");
  });

  it("parseRafOmru accepts every shape, so no caller can be surprised", () => {
    expect(parseRafOmru("suresiz")).toEqual({ tur: "suresiz" });
    expect(parseRafOmru("indefinite")).toEqual({ tur: "suresiz" });
    expect(parseRafOmru("90g")).toEqual({ tur: "gun", gun: 90 });
    expect(parseRafOmru("90d")).toEqual({ tur: "gun", gun: 90 });
  });

  it("nonsense is still refused — the parser did not become permissive", () => {
    expect(() => parseRafOmru("soon")).toThrow(/Invalid shelf_life/);
    expect(() => parseRafOmru("90")).toThrow(/Invalid shelf_life/);
    expect(() => parseRafOmru("")).toThrow(/Invalid shelf_life/);
  });
});
