/**
 * Sızıntı taraması — pack listesi + çıkarılmış ağaç (GitHub yüzeyi).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { icAdlarOku, SENTETIK_KIRMIZI } from "./ic-adlar.js";
import { paketDiskYollari } from "./paket-liste.js";

/** Masaüstü extract — yol runtime'da; kaynakta mutlak ev yolu yok. */
export function extractAday(): string {
  return process.env.TUGRA_EXTRACT ?? join(homedir(), "Desktop", "tugra-public");
}

const YOL =
  /(?:[A-Z]:\\Users\\[A-Za-z0-9._-]+|\/(?:Users|home)\/[A-Za-z0-9._-]+|\/opt\/[A-Za-z0-9._-]+)/g;
const SIR = /sk-ant-|ghp_|AKIA|-----BEGIN [A-Z ]*PRIVATE KEY-----|178\.105\./g;

function adRegex(): RegExp {
  const adlar = [...(icAdlarOku() ?? []), SENTETIK_KIRMIZI];
  return new RegExp(`\\b(?:${adlar.join("|")})\\b`, "gi");
}

function izinli(rel: string, eslesen: string, satır: string): string | null {
  const ad = rel.replace(/\\/g, "/");
  if (/(^|\/)(NOTICE|LICENSE)$/i.test(ad) && /verax/i.test(eslesen)) {
    return "telif satırı";
  }
  if (
    /(^|\/)(src\/sir\.ts|dist-paket\/sir\.js|sir\.js)$/.test(ad) &&
    /sk-ant-|ghp_|AKIA|PRIVATE KEY/.test(eslesen)
  ) {
    return "yakalayıcı, sır değil";
  }
  if (/\/\/\s*fixture\b/i.test(satır) && /sk-ant-|ghp_|AKIA|PRIVATE KEY/.test(eslesen)) {
    return "marked fixture, not a secret";
  }
  if (
    /(^|\/)tests\/(sizinti|ic-adlar|yayin2-b|yayin6)(\.test)?\.(ts|js)$/.test(ad) &&
    /sk-ant-|ghp_|AKIA|PRIVATE KEY/.test(eslesen)
  ) {
    return "guard source, not a secret";
  }
  if (/TUGRA_[A-Z0-9_]+/.test(satır) && /tugra/i.test(eslesen)) {
    return "public env sözleşmesi";
  }
  if (/TALAMUS_[A-Z0-9_]+/.test(satır) && /talamus/i.test(eslesen)) {
    return "eski env adı — geri düşüş";
  }
  if (/MULTI_[A-Z0-9_]+/.test(satır) && /multi/i.test(eslesen)) {
    return "eski env adı — geri düşüş";
  }
  if (/mcp-readonly@tugra/.test(satır) && /tugra/i.test(eslesen)) {
    return "ajan kimliği (yetki)";
  }
  if (/mcp-readonly@multi/.test(satır) && /multi/i.test(eslesen)) {
    return "eski ajan kimliği — geri düşüş";
  }
  if (/goc@talamus|anayasa-goc@talamus/.test(satır) && /talamus/i.test(eslesen)) {
    return "kasa yazarı — mevcut olgu alanı";
  }
  return null;
}

function satirlariTara(
  ham: string,
  rel: string,
  opts: { ad?: boolean } = {},
): { yol: string; eslesen: string }[] {
  const AD = adRegex();
  const bulgular: { yol: string; eslesen: string }[] = [];
  const taramalar: [RegExp, string][] = [];
  if (opts.ad !== false) taramalar.push([AD, "ad"]);
  taramalar.push([YOL, "yol"], [SIR, "sir"]);
  for (const [re, tur] of taramalar) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ham))) {
      const satır = ham.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      if (izinli(rel, m[0], satır)) continue;
      bulgular.push({ yol: `${rel} (${tur})`, eslesen: m[0] });
    }
  }
  return bulgular;
}

export function sizintiTara(kok: string): { yol: string; eslesen: string }[] {
  const bulgular: { yol: string; eslesen: string }[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(d)) {
      const tam = join(d, ad);
      if (statSync(tam).isDirectory()) {
        if (ad === "node_modules") continue;
        gez(tam);
        continue;
      }
      if (ad === ".test-sonuc.json") continue;
      if (!/\.(js|mjs|cjs|json|md|ts|d\.ts|txt)$/i.test(ad)) continue;
      const ham = readFileSync(tam, "utf8");
      bulgular.push(...satirlariTara(ham, relative(kok, tam)));
    }
  };
  gez(kok);
  return bulgular;
}

export function packTara(): { yol: string; eslesen: string }[] {
  const bulgular: { yol: string; eslesen: string }[] = [];
  for (const { rel, tam } of paketDiskYollari()) {
    if (!/\.(js|mjs|cjs|json|md|ts|d\.ts|txt)$/i.test(rel)) continue;
    bulgular.push(...satirlariTara(readFileSync(tam, "utf8"), rel));
  }
  return bulgular;
}

export function extractKokOku(opts?: {
  aday?: string;
  uyar?: (s: string) => void;
}): string | null {
  const aday = opts?.aday ?? extractAday();
  const uyar = opts?.uyar ?? ((s: string) => console.warn(s));
  if (!existsSync(join(aday, "package.json"))) {
    uyar(
      "YAYIN/6 B: extract ağacı yok — GitHub yüzeyi taraması atlanıyor (Desktop/tugra-public)",
    );
    return null;
  }
  return aday;
}

const TR_HARF = /[çğıöşüÇĞİÖŞÜ]/g;

function yorumlariAt(ham: string): string {
  return ham.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Transkript cümlesi: uzun satır + ≥3 Türkçe harf. it/describe başlığı sayılmaz. */
function turkceTranskriptSatiri(satir: string): boolean {
  if (/^\s*(export )?(describe|it|it\.skipIf)\(/.test(satir)) return false;
  if (/\bexpect\(/.test(satir)) return false;
  // MCP/sızıntı bekçisi regex'i — Türkçe harf *arıyor*, transkript değil.
  if (/=\s*\//.test(satir) || /^\s*\//.test(satir)) return false;
  const n = satir.match(TR_HARF)?.length ?? 0;
  return n >= 3 && satir.length >= 40;
}

/** tests/** ve site/** — kaynak yorumu değil, fixture/site metni. */
export function turkceDosyaTara(kok: string): { yol: string; eslesen: string }[] {
  const bulgular: { yol: string; eslesen: string }[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(d)) {
      const tam = join(d, ad);
      if (statSync(tam).isDirectory()) {
        if (ad === "node_modules") continue;
        gez(tam);
        continue;
      }
      const rel = relative(kok, tam).replace(/\\/g, "/");
      if (!/^(tests|site)\//.test(rel)) continue;
      if (/(^|\/)tests\/(sizinti|ic-adlar|yayin2-b|yayin6)(\.test)?\.(ts|js)$/.test(rel)) {
        continue;
      }
      if (!/\.(ts|js|md|html|txt)$/i.test(ad)) continue;
      const ham = /\.(ts|js)$/i.test(ad)
        ? yorumlariAt(readFileSync(tam, "utf8"))
        : readFileSync(tam, "utf8");
      for (const satir of ham.split(/\r?\n/)) {
        if (!turkceTranskriptSatiri(satir)) continue;
        bulgular.push({ yol: `${rel} (tr)`, eslesen: satir.trim().slice(0, 80) });
      }
    }
  };
  gez(kok);
  return bulgular;
}

/** Extract / GitHub yüzeyi: iç ad (tests/ hariç) + yol + sır + Türkçe transkript. */
export function extractTara(kok: string): { yol: string; eslesen: string }[] {
  const bulgular: { yol: string; eslesen: string }[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(d)) {
      const tam = join(d, ad);
      if (statSync(tam).isDirectory()) {
        if (ad === "node_modules") continue;
        gez(tam);
        continue;
      }
      if (ad === ".test-sonuc.json") continue;
      if (!/\.(js|mjs|cjs|json|md|ts|d\.ts|txt)$/i.test(ad)) continue;
      const rel = relative(kok, tam).replace(/\\/g, "/");
      const test = /^tests\//.test(rel);
      bulgular.push(...satirlariTara(readFileSync(tam, "utf8"), rel, { ad: !test }));
    }
  };
  gez(kok);
  bulgular.push(...turkceDosyaTara(kok));
  return bulgular;
}
