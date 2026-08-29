import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import YAML from "yaml";
import { semaUyarilari } from "./dogrula.js";
import type { Olgu, OlguMeta } from "./sema.js";
import { frontmatterDisaYaz, frontmatterIceAl } from "./vocabulary.js";

export function frontmatterYaz(meta: OlguMeta): string {
  // Alan listesi sabit değil — vocabulary.FACT_FIELDS'ten türetilir.
  // Nesnede duran her alan (şema + bilinmeyen) yazılır; gezegen dersi.
  return YAML.stringify(frontmatterDisaYaz(meta), { lineWidth: 0 }).trimEnd();
}

export function olguDosyaMetni(olgu: Olgu): string {
  return `---\n${frontmatterYaz(olgu.meta)}\n---\n\n${olgu.govde.trim()}\n`;
}

export function parseOlguDosya(metin: string, yol?: string): Olgu {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(metin);
  if (!m) throw new Error(`Frontmatter yok: ${yol ?? "?"}`);
  // Göç dönemi: frontmatter İngilizce de olabilir, Türkçe de. Sözlük
  // içeriye alınır; başlık/gövde ASLA çevrilmez. bkz. vocabulary.ts
  const meta = frontmatterIceAl(YAML.parse(m[1])) as OlguMeta;
  const uyarilar = semaUyarilari(
    meta as unknown as Record<string, unknown>,
    yol,
  ).map((u) => `${u.alan}: ${u.mesaj}`);
  return {
    meta,
    govde: m[2].trim(),
    yol,
    ...(uyarilar.length ? { uyarilar } : {}),
  };
}

/** OKF §3.1 — kavram dosyası değil; yukleKasa bunları olgu sanmasın */
const REZERVE_MD = new Set(["index.md", "log.md"]);

export function taraMarkdown(kok: string): string[] {
  if (!existsSync(kok)) return [];
  const out: string[] = [];
  const stack = [kok];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const ent of readdirSafe(dir)) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith(".")) continue;
        // Kabul edilmemiş taslak gökyüzüne/indekse çıkmaz
        if (ent.name === "_oneriler" || ent.name === "_karantina") continue;
        stack.push(p);
      } else if (
        ent.isFile() &&
        ent.name.endsWith(".md") &&
        !ent.name.startsWith("_") &&
        !REZERVE_MD.has(ent.name)
      ) {
        out.push(p);
      }
    }
  }
  return out.sort();
}

function readdirSafe(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function yukleKasa(kok: string): Olgu[] {
  return taraMarkdown(kok).map((y) =>
    parseOlguDosya(
      readFileSync(y, "utf8"),
      relative(kok, y).replace(/\\/g, "/"),
    ),
  );
}

export function yazDosya(abs: string, metin: string): void {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, metin, "utf8");
}

export { join, dirname, relative };
