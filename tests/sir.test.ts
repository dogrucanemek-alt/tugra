/**
 * Sır yakalayıcı — paketin güvenlik yüzeyi. oturum.test.ts'ten taşındı.
 */
import { describe, expect, it } from "vitest";
import { sirDeseniBul, sirRedakte } from "../src/sir.js";

describe("sir — redaksiyon", () => {
  it("tam sır deseni çıktıya giremez", () => {
    const gizli = `token sbp_${"a".repeat(40)} yanlis girilmis`;
    expect(sirRedakte(gizli)).not.toMatch(/sbp_a/);
    expect(sirRedakte(gizli)).toContain("«redakte»");
  });

  it("sirDeseniBul eşleşen metni dönmez", () => {
    const gizli = `token sbp_${"a".repeat(40)}`;
    expect(sirDeseniBul(gizli)).toBe("sbp_");
    expect(sirDeseniBul(gizli)).not.toMatch(/a{20,}/);
    expect(sirDeseniBul("temiz metin")).toBeNull();
  });
});
