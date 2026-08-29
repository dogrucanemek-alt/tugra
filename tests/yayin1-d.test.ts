/**
 * YAYIN/1 D — okurken şema doğrulaması.
 * Geçersiz değer yüklenir + uyarılır; yazma yolu reddeder.
 * `belge` şemaya EKLENMEZ — format kararı patronda; doğrulayıcı bağırır.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { olguOner } from "../src/arama.js";
import { parseOlguDosya, yukleKasa } from "../src/dosya.js";
import { tempKok, temizle } from "./helpers.js";

const kokler: string[] = [];
afterEach(() => {
  while (kokler.length) temizle(kokler.pop()!);
});

const TEMEL = `---
uid: 01YAYIN1D00000000000000001
tur: kural
kapsam: kurum
dunya: null
konu: test.sema
baslik: "Sema bekcisi"
sahip: patron
yazan: agent@example
tarih: 2026-08-01T00:00:00.000Z
guven: 0.9
raf_omru: 180g
dogrulandi: 2026-08-01
kaynak:
  - tur: dosya
    isaret: "policy/x.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: null
curuten: null
---

Sema bekcisi govdesi.
`;

describe("YAYIN/1 D: okurken şema", () => {
  it("geçersiz kaynak.tur (belge) → yüklenir VE uyarı üretir", () => {
    const ham = TEMEL.replace("tur: dosya", "tur: belge");
    const o = parseOlguDosya(ham, "belge.md");
    expect(o.meta.kaynak[0]!.tur).toBe("belge");
    expect(o.uyarilar?.some((u) => /kaynak\[0\]\.tur.*belge/.test(u))).toBe(
      true,
    );
  });

  it("geçersiz tur/kapsam → yüklenir + uyarı", () => {
    const ham = TEMEL.replace("tur: kural", "tur: uydurma").replace(
      "kapsam: kurum",
      "kapsam: galaxy",
    );
    const o = parseOlguDosya(ham, "enum.md");
    expect(o.meta.tur as string).toBe("uydurma");
    expect(o.uyarilar?.some((u) => /tur:.*uydurma/.test(u))).toBe(true);
    expect(o.uyarilar?.some((u) => /kapsam:.*galaxy/.test(u))).toBe(true);
  });

  it("guven: 1.7 → uyarı", () => {
    const ham = TEMEL.replace("guven: 0.9", "guven: 1.7");
    const o = parseOlguDosya(ham, "guven.md");
    expect(o.meta.guven).toBe(1.7);
    expect(o.uyarilar?.some((u) => /guven:.*1\.7/.test(u))).toBe(true);
  });

  it("olguOner geçersiz kaynak.tur → ret", () => {
    const r = olguOner({
      ajan: "yaz@t",
      tur: "olgu",
      baslik: "Gecersiz kaynak",
      govde: "x\n\n**Neden:** a\n**Nasıl uygulanır:** b",
      kaynak: [{ tur: "belge", isaret: "sicil://x", alindi: "2026-08-01" }],
    });
    expect(r.izin).toBe(false);
    if (r.izin) throw new Error("ret bekleniyordu");
    expect(r.neden).toMatch(/geçersiz kaynak\.tur/);
  });

  it("temiz kasa → sıfır uyarı (sahte alarm yok)", () => {
    const kasa = tempKok();
    kokler.push(kasa);
    writeFileSync(join(kasa, "temiz.md"), TEMEL, "utf8");
    const hepsi = yukleKasa(kasa);
    expect(hepsi).toHaveLength(1);
    expect(hepsi[0]!.uyarilar ?? []).toEqual([]);
  });
});
