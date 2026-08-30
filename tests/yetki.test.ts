import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { akisOku } from "../src/akis.js";
import { olguOner } from "../src/arama.js";
import {
  aSeviyeleriOku,
  fazlaYetki,
  geriAl,
  yetkiKontrol,
  yetkiDogrula,
  yetkiOku,
  yetkiYaz,
  varsayilanSonaErme,
  type YetkiKayitGirdi,
} from "../src/yetki.js";
import { skalaKasasi, tempKok, temizle } from "./helpers.js";

const kokler: string[] = [];
afterEach(() => {
  while (kokler.length) temizle(kokler.pop()!);
});

function skalaKok(root: string): string {
  return skalaKasasi(join(root, "skala"));
}

function profil(
  ajan: string,
  seviye: YetkiKayitGirdi["seviye"],
  ekstra: Partial<YetkiKayitGirdi> = {},
): YetkiKayitGirdi {
  const baslangic = ekstra.baslangic ?? new Date().toISOString();
  return {
    ajan,
    seviye,
    baslangic,
    sona_erme: ekstra.sona_erme ?? varsayilanSonaErme(new Date(baslangic)),
    ...ekstra,
  };
}

describe("MULTI Faz 2 — yetki kutusu", () => {
  it("① süresiz izin reddediliyor", () => {
    const d = yetkiDogrula({
      ajan: "x",
      seviye: "A2",
      baslangic: "2026-07-27T00:00:00.000Z",
      sona_erme: "suresiz",
    });
    expect(d.ok).toBe(false);
    expect(d.hatalar.some((h) => /open-ended|sona_erme required/i.test(h))).toBe(
      true,
    );
  });

  it("② süresi dolmuş izin çalışmıyor", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    yetkiYaz(
      profil("eski@t", "A2", {
        baslangic: "2026-07-01T00:00:00.000Z",
        sona_erme: "2026-07-01T02:00:00.000Z",
      }),
      yetki,
      skalaKok(root),
    );
    const k = yetkiKontrol({
      ajan: "eski@t",
      eylem: "oneri",
      yetkiKok: yetki,
      akisKok: akis,
      kasaKok: skalaKok(root),
      simdi: new Date("2026-07-27T03:00:00.000Z"),
    });
    expect(k.izin).toBe(false);
    expect(k.neden).toMatch(/süre/i);
  });

  it("③ dokunma salt_okunur → olgu_oner yapamıyor", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    const kasa = join(root, "kasa");
    mkdirSync(kasa, { recursive: true });
    yetkiYaz(
      profil("ro@t", "A1", {
        eksen_kisit: {
          dokunma: { kurum: "salt_okunur", evrensel: "salt_okunur", dunya: "salt_okunur" },
        },
      }),
      yetki,
      skalaKok(root),
    );
    // A1 varsayılan zaten salt — oneri yazma yetmez
    const r = olguOner(
      {
        ajan: "ro@t",
        baslik: "RO deneme",
        govde: "x\n\n**Neden:** a\n**Nasıl uygulanır:** b",
      },
      kasa,
      { yetkiKok: yetki, akisKok: akis, skalaKasa: skalaKok(root) },
    );
    expect(r.izin).toBe(false);
  });

  it("④ karantinadaki ajan _karantina/ yazar", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    const kasa = join(root, "kasa");
    mkdirSync(kasa, { recursive: true });
    yetkiYaz(
      profil("cam@t", "A2", { karantina: true }),
      yetki,
      skalaKok(root),
    );
    const r = olguOner(
      {
        ajan: "cam@t",
        baslik: "Karantina deneme",
        govde: "x\n\n**Neden:** a\n**Nasıl uygulanır:** b",
      },
      kasa,
      { yetkiKok: yetki, akisKok: akis, skalaKasa: skalaKok(root) },
    );
    expect(r.izin).toBe(true);
    if (!r.izin) throw new Error("x");
    expect(r.karantina).toBe(true);
    expect(r.yol).toMatch(/^_karantina\//);
    expect(existsSync(join(kasa, r.yol))).toBe(true);
    expect(existsSync(join(kasa, "_oneriler"))).toBe(false);
  });

  it("⑤ yetki yetmeyince yetki_talebi olayı düşüyor", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    yetkiYaz(
      profil("yok@t", "A0"),
      yetki,
      skalaKok(root),
    );
    const k = yetkiKontrol({
      ajan: "yok@t",
      eylem: "oneri",
      kapsam: "kurum",
      yetkiKok: yetki,
      akisKok: akis,
      kasaKok: skalaKok(root),
    });
    expect(k.izin).toBe(false);
    expect(k.talep_id).toBeTruthy();
    const o = akisOku(akis);
    expect(o.olaylar.some((x) => x.eylem === "yetki_talebi")).toBe(true);
  });

  it("⑥ disa_acilma kapali → bulut modeli isteyemiyor", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    yetkiYaz(
      profil("kapali@t", "A2", {
        eksen_kisit: { disa_acilma: "kapali" },
      }),
      yetki,
      skalaKok(root),
    );
    const k = yetkiKontrol({
      ajan: "kapali@t",
      eylem: "bulut_model",
      yetkiKok: yetki,
      akisKok: akis,
      kasaKok: skalaKok(root),
    });
    expect(k.izin).toBe(false);
    expect(k.neden).toMatch(/disa_acilma|bulut/i);
  });

  it("⑦ harcama tavanı aşılınca durduruyor", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    yetkiYaz(
      profil("pahali@t", "A2", {
        harcama_kullanilan: { token: 499_000, tl: 49 },
      }),
      yetki,
      skalaKok(root),
    );
    const k = yetkiKontrol({
      ajan: "pahali@t",
      eylem: "akis",
      maliyet: { token: 10_000, tl: 5 },
      yetkiKok: yetki,
      akisKok: akis,
      kasaKok: skalaKok(root),
    });
    expect(k.izin).toBe(false);
    expect(k.neden).toMatch(/harcama/i);
  });

  it("⑧ A-seviyesi eşlemesi kasadan okunuyor (sabit kodlu liste değil)", () => {
    const root = tempKok();
    kokler.push(root);
    const skala = aSeviyeleriOku(skalaKok(root));
    expect(skala.size).toBeGreaterThanOrEqual(6);
    for (const sev of ["A0", "A1", "A2", "A3", "A4", "A5"] as const) {
      const s = skala.get(sev);
      expect(s, sev).toBeTruthy();
      expect(s!.uid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(s!.konu).toBe(`yonetisim.yetki.${sev.toLowerCase()}`);
      expect(s!.eksen.harcama.token).toBeGreaterThan(0);
    }
    // icat yok: A6 yok
    expect(skala.has("A6" as never)).toBe(false);
  });

  it("⑨ geriAl liste üretir (uygulamaz)", () => {
    const root = tempKok();
    kokler.push(root);
    const kayit = join(root, "kayit");
    mkdirSync(kayit, { recursive: true });
    writeFileSync(
      join(kayit, "toplayici-2026-07-27.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        ajan: "g@t",
        is: "x",
        eylem: "yazma",
        dokundu: ["a.ts"],
      }) + "\n",
      "utf8",
    );
    const g = geriAl("g@t", 60, kayit);
    expect(g.onay).toBe("bekliyor");
    expect(g.maddeler.length).toBeGreaterThanOrEqual(1);
  });

  it("⑩ fazlaYetki öneri listeler", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    mkdirSync(akis, { recursive: true });
    yetkiYaz(profil("fazla@t", "A4"), yetki, skalaKok(root));
    const f = fazlaYetki("fazla@t", 7, yetki, akis, skalaKok(root));
    expect(f.onerilen_kisit.length).toBeGreaterThan(0);
  });

  it("⑪ A2 ve A5 farklı mühürlü eksenler + turetildi üretir", () => {
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const a2 = yetkiYaz(profil("ornek-a2@multi", "A2"), yetki, skalaKok(root));
    const a5 = yetkiYaz(profil("ornek-a5@multi", "A5"), yetki, skalaKok(root));
    expect(a2.eksenler).toBeTruthy();
    expect(a5.eksenler).toBeTruthy();
    expect(a2.turetildi?.length).toBeGreaterThanOrEqual(1);
    expect(a5.turetildi?.length).toBeGreaterThanOrEqual(1);
    expect(a2.turetildi![0]).not.toBe(a5.turetildi![0]);
    expect(a2.eksenler!.kalicilik).toBe("oneri_yazar");
    expect(a2.eksenler!.disa_acilma).toBe("yerel_model");
    expect(a5.eksenler!.ozerklik).toBe("her_eylemde_sor");
    expect(a5.eksenler!.disa_acilma).toBe("serbest");
    expect(JSON.stringify(a2.eksenler)).not.toBe(JSON.stringify(a5.eksenler));
    const disk2 = yetkiOku("ornek-a2@multi", yetki)!;
    const disk5 = yetkiOku("ornek-a5@multi", yetki)!;
    expect(disk2.eksenler?.harcama.token).not.toBe(disk5.eksenler?.harcama.token);
    expect(readFileSync(join(yetki, "ornek-a2@multi.json"), "utf8")).not.toBe(
      readFileSync(join(yetki, "ornek-a5@multi.json"), "utf8"),
    );
  });

  it("K2: olgu_oner taslagi 'bugun dogrulanmis' dogmaz — dogrulandi null", () => {
    // 28 Tem denetim bulgusu: `dogrulandi: new Date()...` yaziliyordu. Bir ajanin
    // oneri yazmasi dogrulama degildir; bugunun tarihi bayatlama saatini sifirlar.
    // Spec K2: "null ile bugunun tarihi ayni sey degildir; ikincisi bir yalandir."
    const root = tempKok();
    kokler.push(root);
    const yetki = join(root, "yetki");
    const akis = join(root, "akis");
    const kasa = join(root, "kasa");
    mkdirSync(kasa, { recursive: true });
    yetkiYaz(profil("yaz@t", "A3"), yetki, skalaKok(root));
    const r = olguOner(
      {
        ajan: "yaz@t",
        baslik: "K2 dogrulandi denetimi",
        govde: "x\n\n**Neden:** a\n**Nasıl uygulanır:** b",
      },
      kasa,
      { yetkiKok: yetki, akisKok: akis, skalaKasa: skalaKok(root) },
    );
    expect(r.izin).toBe(true);
    if (!r.izin) throw new Error("izin bekleniyordu");
    const ham = readFileSync(join(kasa, r.yol), "utf8");
    expect(ham).toMatch(/^verified:\s*(null|~)\s*$/m);
    expect(ham).not.toMatch(/^verified:\s*\d{4}-/m);
  });
});
