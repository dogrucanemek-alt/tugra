/**
 * The migration decides by what a file SAYS, not by which keys it happens to
 * use.
 *
 * Found 2026-09-10: `gocFrontmatterMetni` skipped a file unless one of its
 * KEYS was Turkish. That was right while only key names were being
 * translated. Once the shelf_life value moved too, it left a hole exactly the
 * shape of the defect being fixed: a file with English keys and a Turkish
 * value (`shelf_life: suresiz`) reported "nothing to do" and stayed mixed
 * forever. A migration that cannot see the thing it migrates is a no-op with
 * a progress bar.
 */
import { describe, expect, it } from "vitest";
import { gocFrontmatterMetni } from "../src/goc-dil.js";

const dosya = (fm: string) => `---\n${fm}\n---\nbody text\n`;

describe("goc-dil migrates the value, not only the key", () => {
  it("the old vault (Turkish key + Turkish value) migrates whole", () => {
    const r = gocFrontmatterMetni(
      dosya("uid: u1\ntur: kural\nraf_omru: suresiz\nguven: 0.9"),
    );
    expect(r.degisti).toBe(true);
    expect(r.metin).toMatch(/shelf_life: indefinite/);
    expect(r.metin).toMatch(/type: rule/);
    expect(r.metin).not.toMatch(/raf_omru/);
    expect(r.metin).toMatch(/body text/);
  });

  it("RED: the mixed file (English key + Turkish value) is not skipped", () => {
    const r = gocFrontmatterMetni(
      dosya("uid: u2\ntype: rule\nshelf_life: suresiz\nconfidence: 0.9"),
    );
    expect(r.degisti, "a mixed file reported nothing to do").toBe(true);
    expect(r.metin).toMatch(/shelf_life: indefinite/);
  });

  it("RED: a day count in the old unit is migrated too", () => {
    const r = gocFrontmatterMetni(dosya("uid: u3\ntype: fact\nshelf_life: 90g"));
    expect(r.degisti).toBe(true);
    expect(r.metin).toMatch(/shelf_life: 90d/);
  });

  it("a file already in English is left alone — no churn, no rewrite", () => {
    const r = gocFrontmatterMetni(
      dosya("uid: u4\ntype: rule\nshelf_life: indefinite\nconfidence: 0.9"),
    );
    expect(r.degisti).toBe(false);
  });

  it("a day count already in the new unit is left alone", () => {
    const r = gocFrontmatterMetni(dosya("uid: u5\ntype: fact\nshelf_life: 90d"));
    expect(r.degisti).toBe(false);
  });

  it("a file without frontmatter is untouched", () => {
    const r = gocFrontmatterMetni("no frontmatter here\n");
    expect(r.degisti).toBe(false);
  });
});
