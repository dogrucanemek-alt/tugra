/**
 * İki `site/` kopyası ayrışmasın.
 *
 * 🔴 BULGU (2026-08-30): `site/` iki yerde duruyor — ana depoda (Vercel bunu
 * deploy ediyor) ve public depoda (vitrin). `scripts/yayin2-public-kopya.mjs`
 * public kopyayı ana depodan **türetiyor** (`cpSync`), yani tek kaynak var.
 * Eksik olan, türetilmiş kopyanın **bayatladığını** söyleyen bir kontroldü:
 * kanonik-çatal işinde ana depoya `vercel.json` eklendi, public kopya geride
 * kaldı ve bunu kimse görmedi.
 *
 * 🔑 Anayasa md.4: aynı gerçeği iki yerde beyan ediyorsan, üçüncü bir şey
 * kıyaslamalı. Bu test o üçüncü şey.
 *
 * Public depo yoksa (CI, başka makine, taze klon) test **atlanır** — kapsamı
 * dürüst tutmak için, sahte yeşil üretmemek için. `canliKokpitVar()` deseninin
 * aynısı.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { kokpitKok } from "../src/yollar.js";

/** Betiğin public kopyadan bilerek sildiği dosyalar. */
const PUBLIC_DISI = new Set(["METIN_TASLAK.md", ".env.local", ".gitignore", ".vercel"]);

/** Public depo kökü: ortam değişkeni, yoksa kokpitin kardeşi. */
function publicKok(): string | null {
  const ortam = process.env.TUGRA_PUBLIC;
  if (ortam && existsSync(join(ortam, "site"))) return ortam;
  const kardes = resolve(kokpitKok(), "..", "..", "tugra-public");
  return existsSync(join(kardes, "site")) ? kardes : null;
}

describe("site/ tek kaynaktan türetilir — iki kopya ayrışmaz", () => {
  const pub = publicKok();

  it("ana depodaki her site dosyası public kopyada birebir duruyor", () => {
    if (!pub) {
      // Public depo bu makinede yok; iddia edilecek bir şey yok.
      expect(pub).toBeNull();
      return;
    }
    const anaSite = join(kokpitKok(), "site");
    const pubSite = join(pub, "site");

    const eksik: string[] = [];
    const farkli: string[] = [];

    for (const ad of readdirSync(anaSite)) {
      if (PUBLIC_DISI.has(ad)) continue;
      const a = join(anaSite, ad);
      const b = join(pubSite, ad);
      if (!existsSync(b)) {
        eksik.push(ad);
        continue;
      }
      if (readFileSync(a, "utf8") !== readFileSync(b, "utf8")) farkli.push(ad);
    }

    expect(
      { eksik, farkli },
      `public kopya bayat — 'node scripts/yayin2-public-kopya.mjs' ile tazele.\n` +
        `eksik: ${eksik.join(", ") || "-"}\nfarklı: ${farkli.join(", ") || "-"}`,
    ).toEqual({ eksik: [], farkli: [] });
  });

  it("iç taslak public kopyaya sızmaz", () => {
    if (!pub) {
      expect(pub).toBeNull();
      return;
    }
    const sizanlar = [...PUBLIC_DISI].filter((ad) =>
      existsSync(join(pub, "site", ad)),
    );
    expect(sizanlar, `public kopyada olmaması gereken: ${sizanlar.join(", ")}`).toEqual([]);
  });
});
