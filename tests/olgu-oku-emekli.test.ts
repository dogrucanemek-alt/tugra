/**
 * olgu_oku — emekli olgu, yerine geçeni ve nedenini SÖYLEMELİ.
 *
 * 🔴 GÖZCÜ BULGUSU (2026-08-23, arXiv:2608.01619 "implicit policy adaptation
 * gap"): olgu_ara emekli olgu için `yerine_uid` + neden veriyordu; olgu_oku
 * aynı olguyu `{durum: "emekli"}` diye çıplak döndürüyordu — ne neden, ne
 * yerine geçen. Bir ajan olguyu `baglar`dan ya da ezberindeki uid'le doğrudan
 * çekerse "sessiz eski bağımlılık" oluşur: emekli olduğunu görür ama yerine
 * geçen gerçeği alamaz, eski değere göre üretmeye devam edebilir.
 * İki okuma yolundan biri diğerinden az söylerse, az söyleyen yol ajanın
 * gerçek davranış yüzeyidir.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { olguOku } from "../src/arama.js";

const TMPLER: string[] = [];
afterEach(() => {
  while (TMPLER.length) {
    try {
      rmSync(TMPLER.pop()!, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
});

function olguYaz(
  kasa: string,
  ad: string,
  m: { uid: string; baslik: string; yerine?: string | null; curuten?: string | null },
) {
  writeFileSync(
    join(kasa, ad),
    `---
uid: ${m.uid}
tur: olgu
kapsam: kurum
dunya: null
konu: test-emekli
baslik: "${m.baslik}"
sahip: patron
yazan: claude@multi
tarih: 2026-08-01T00:00:00.000Z
guven: 0.7
raf_omru: 180g
dogrulandi: 2026-08-01
kaynak:
  - tur: dosya
    isaret: "test/kaynak.md#L1"
    alindi: 2026-08-01
baglar: []
etki: []
yerine: ${m.yerine ?? "null"}
curuten: ${m.curuten ?? "null"}
---

test gövdesi
`,
    "utf8",
  );
}

describe("olgu_oku — emekli olgu çıplak dönmez", () => {
  it("emekli olguda yerine_uid + neden notu döner (olgu_ara ile aynı gerçek)", () => {
    const kasa = mkdtempSync(join(tmpdir(), "olgu-oku-"));
    TMPLER.push(kasa);
    mkdirSync(kasa, { recursive: true });
    // ESKI: emekli — YENI onu "yerine" ile geçersiz kılmış
    olguYaz(kasa, "eski.md", { uid: "01TESTESKI0000000000000000", baslik: "Eski hüküm" });
    olguYaz(kasa, "yeni.md", {
      uid: "01TESTYENI0000000000000000",
      baslik: "Yeni hüküm",
      yerine: "01TESTESKI0000000000000000",
    });

    const r = olguOku("01TESTESKI0000000000000000", kasa);
    expect(r.olgu).not.toBeNull();
    expect(r.durum).toBe("emekli");
    // yerine geçen uid taşınmalı — olgu_ara zaten taşıyor, tek gerçek iki okuyucu
    expect(r.yerine_uid).toBe("01TESTYENI0000000000000000");
    // neden notu: ajan "neden emekli, yerine ne geçti" cevabını okuma yolundan almalı
    expect(r.notlar.join(" ")).toMatch(/emekli|yerine/i);
  });

  it("aktif olguda yerine_uid null — sahte işaret yok", () => {
    const kasa = mkdtempSync(join(tmpdir(), "olgu-oku-"));
    TMPLER.push(kasa);
    olguYaz(kasa, "tek.md", { uid: "01TESTAKTIF000000000000000", baslik: "Aktif" });
    const r = olguOku("01TESTAKTIF000000000000000", kasa);
    expect(r.durum).not.toBe("emekli");
    expect(r.yerine_uid).toBeNull();
  });
});
