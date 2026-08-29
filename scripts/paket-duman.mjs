/**
 * Paket duman testi — KURULAN paketi ham JSON-RPC ile konusturur.
 *
 * Neden ayri bir betik: ic suit yerel artefaktlara (dist/, dis dogrulayici)
 * bagli ve olmasi da normal. CI'in asil sorusu bu degil:
 * "yayinladigimiz sey temiz bir makinede caliyor mu?"
 * Depodaki hali kanit degildir — kanit npm pack -> temiz kurulum -> konustur.
 *
 * Kullanim: node scripts/paket-duman.mjs <kurulum-dizini>
 * Cikis 0 = gecti, 1 = kaldi (sebep stdout'ta).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const kurulum = process.argv[2];
if (!kurulum) {
  console.error("kullanim: node scripts/paket-duman.mjs <kurulum-dizini>");
  process.exit(2);
}

const kasa = mkdtempSync(join(tmpdir(), "duman-kasa-"));
const akis = mkdtempSync(join(tmpdir(), "duman-akis-"));

writeFileSync(
  join(kasa, "kural.md"),
  `---
uid: 01DUMAN00000000000000000001
type: rule
scope: org
world: null
topic: policy.shipping
title: "Shipping takes 30 days"
owner: patron
author: ci@example
date: 2026-08-01T00:00:00.000Z
confidence: 0.9
shelf_life: 180g
verified: 2026-08-01
source:
  - type: file
    pointer: "policy/shipping.md#L1"
    taken: 2026-08-01
links: []
affects: []
superseded_by: null
invalidated_by: null
---

Shipping takes 30 days.
`,
  "utf8",
);

const env = { ...process.env, TUGRA_KASA: kasa, TUGRA_AKIS: akis };
delete env.TUGRA_YETKI;
delete env.TALAMUS_YETKI;
delete env.MULTI_YETKI;
delete env.TUGRA_KOKPIT;
delete env.TALAMUS_KOKPIT;
delete env.TALAMUS_KASA;
delete env.TALAMUS_AKIS;

const sunucu = join(kurulum, "node_modules", "tugra", "dist-paket", "mcp.js");
const p = spawn(process.execPath, [sunucu], { env, stdio: ["pipe", "pipe", "pipe"] });

let tampon = "";
const cevaplar = new Map();
p.stdout.on("data", (d) => {
  tampon += d.toString();
  let i;
  while ((i = tampon.indexOf("\n")) >= 0) {
    const satir = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    if (!satir) continue;
    try {
      const m = JSON.parse(satir);
      if (m.id !== undefined) cevaplar.set(m.id, m);
    } catch {
      /* protokol disi satir */
    }
  }
});

const yolla = (o) => p.stdin.write(JSON.stringify(o) + "\n");
const bekle = (id, ms = 15000) =>
  new Promise((coz, red) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      if (cevaplar.has(id)) {
        clearInterval(t);
        coz(cevaplar.get(id));
      } else if (Date.now() - t0 > ms) {
        clearInterval(t);
        red(new Error(`id ${id}: zaman asimi`));
      }
    }, 25);
  });

const kontroller = [];
const kontrol = (ad, gecti, ayrinti = "") => {
  kontroller.push({ ad, gecti, ayrinti });
  console.log(`${gecti ? "gecti" : "KALDI"}  ${ad}${ayrinti ? "  — " + ayrinti : ""}`);
};

try {
  console.log(`node ${process.version} · paket duman testi`);

  yolla({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "ci-duman", version: "0" },
    },
  });
  const init = await bekle(1);
  kontrol("initialize", init.result?.serverInfo?.name === "tugra", init.result?.serverInfo?.version);
  yolla({ jsonrpc: "2.0", method: "notifications/initialized" });

  yolla({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const liste = await bekle(2);
  const adlar = (liste.result?.tools ?? []).map((t) => t.name).sort();
  kontrol(
    "tools/list dort arac",
    ["event_report", "fact_propose", "fact_read", "fact_search"].every((a) => adlar.includes(a)),
    adlar.join(","),
  );

  yolla({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "fact_search", arguments: { query: "shipping" } },
  });
  const ara = await bekle(3);
  const metin = ara.result?.content?.[0]?.text ?? "";
  const g = JSON.parse(metin);
  kontrol("fact_search olgu donuyor", g.total > 0, `total=${g.total}`);
  kontrol("yetki duvari yok (tek kullanici modu)", !/unauthorized/i.test(metin));
  kontrol("kaynak isareti tasiniyor", /policy\/shipping\.md/.test(metin));
  // Ingilizce tel: Turkce anahtar/deger sizmasin
  kontrol("tel Ingilizce", !/[çğşıöüİ]|"durum"|"konu"|"guven"/.test(metin));

  yolla({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "fact_propose",
      arguments: {
        type: "rule",
        topic: "policy.returns",
        agent: "ci@example",
        title: "Returns within 14 days",
        body: "Returns are accepted within 14 days.",
        source: [{ type: "file", pointer: "policy/returns.md#L1", taken: "2026-08-29" }],
      },
    },
  });
  const oner = await bekle(4);
  const oMetin = oner.result?.content?.[0]?.text ?? "";
  const o = JSON.parse(oMetin);
  kontrol("fact_propose taslak yaziyor", o.ok === true && typeof o.path === "string", o.path);
  if (o.path) {
    const fm = readFileSync(join(kasa, o.path), "utf8").split("---")[1] ?? "";
    kontrol(
      "diske Ingilizce anahtar",
      fm.includes("topic:") && fm.includes("confidence:") && !fm.includes("\nkonu:"),
    );
  }
} catch (e) {
  kontrol("protokol", false, e.message);
} finally {
  p.kill();
}

const kalan = kontroller.filter((k) => !k.gecti);
console.log(`\n${kontroller.length - kalan.length}/${kontroller.length} gecti`);
process.exit(kalan.length ? 1 : 0);
