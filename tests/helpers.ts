import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { olguDosyaMetni } from "../src/dosya.js";
import type { Kaynak, OlguMeta } from "../src/sema.js";
import { ulid } from "../src/ulid.js";

export function tempKok(): string {
  return mkdtempSync(join(tmpdir(), "tugra-kasa-"));
}

export function temizle(kok: string): void {
  rmSync(kok, { recursive: true, force: true });
}

export function kaynak(isaret = "codes://Test"): Kaynak[] {
  return [{ tur: "sql", isaret, alindi: "2026-07-26" }];
}

export function meta(
  partial: Partial<OlguMeta> & Pick<OlguMeta, "konu" | "baslik" | "yazan">,
): OlguMeta {
  return {
    uid: partial.uid ?? ulid(),
    tur: partial.tur ?? "olgu",
    kapsam: partial.kapsam ?? "kurum",
    dunya: partial.dunya ?? null,
    konu: partial.konu,
    baslik: partial.baslik,
    sahip: partial.sahip ?? "patron",
    yazan: partial.yazan,
    tarih: partial.tarih ?? "2026-07-26T12:00+03:00",
    guven: partial.guven ?? 0.9,
    raf_omru: partial.raf_omru ?? "180g",
    dogrulandi:
      partial.dogrulandi !== undefined ? partial.dogrulandi : "2026-07-26",
    kaynak: partial.kaynak ?? kaynak(),
    baglar: partial.baglar ?? [],
    etki: partial.etki ?? [],
    yerine: partial.yerine ?? null,
    curuten: partial.curuten ?? null,
    durum_notu: partial.durum_notu,
    curuk_notu: partial.curuk_notu,
    sinir_notu: partial.sinir_notu,
    bolunmedi: partial.bolunmedi,
    uretici: partial.uretici,
  };
}

export const GOVDE = `İddia metni burada.

**Neden:** test gerekçesi
**Nasıl uygulanır:** test davranışı`;

/**
 * Canlı kokpit ortamı var mı?
 *
 * Bazı testler bilerek patronun ÇALIŞAN kurulumuna dair iddiada bulunur:
 * canlı `akis/` ölçümleri, oturum düzeltmeleri, ajan sicili, depo dışındaki
 * anayasa dosyası. Bunlar "kod hazır ama hiç koşmadı olmasın" bekçileridir ve
 * YEREL olarak değerlidir — CI'da ise ölçülecek bir canlı sistem yoktur.
 *
 * 🔑 Ölçüm yapılamıyor ≠ ürün bozuk. Sessiz atlama yok: atlanan test vitest
 * çıktısında "skipped" olarak görünür.
 * ⛔ Bunu yeni testleri susturmak için KULLANMA. Yalnız canlı kuruluma dair
 * iddialar içindir; kod davranışını sınayan test temp kökte koşmalıdır.
 */
export function canliKokpitVar(): boolean {
  return !process.env.CI;
}

/**
 * A0–A5 skala olguları — yetkiYaz / aSeviyeleriOku canlı kasa istemesin.
 * Extract ağaçta varsayılan kasa boş; bu fixture kapsamı korur.
 */
export function skalaKasasi(kasa: string): string {
  mkdirSync(kasa, { recursive: true });
  for (let n = 0; n <= 5; n++) {
    const m = meta({
      uid: ulid(),
      tur: "kural",
      kapsam: "evrensel",
      konu: `yonetisim.yetki.a${n}`,
      baslik: `A${n} scale fixture`,
      yazan: "test@tugra",
      guven: 1,
    });
    writeFileSync(
      join(kasa, `skala-a${n}.md`),
      olguDosyaMetni({
        meta: m,
        govde: `A${n} authorization scale fixture.`,
      }),
      "utf8",
    );
  }
  return kasa;
}
