/**
 * Yayınlanacak dosya listesi — arşiv açmadan.
 * `npm pack --dry-run --json` diske .tgz bırakmaz; tar yok, kabuktan bağımsız.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { motorKok } from "../src/yollar.js";

export function npmPackDosyaListesi(): string[] {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const ham = execFileSync(npm, ["pack", "--dry-run", "--json"], {
    cwd: motorKok(),
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
    shell: process.platform === "win32",
  });
  const jsonBas = ham.search(/[\[{]/);
  if (jsonBas < 0) throw new Error("npm pack --dry-run --json: JSON yok");
  const data: unknown = JSON.parse(ham.slice(jsonBas));
  const kayit = packKayit(data);
  const files = kayit.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("npm pack --dry-run --json: files boş");
  }
  return files.map((f) => String(f.path).replace(/^package\//, ""));
}

function packKayit(data: unknown): { files: { path: string }[] } {
  if (Array.isArray(data) && data[0]?.files) return data[0];
  if (data && typeof data === "object") {
    const o = data as Record<string, { files?: { path: string }[] }>;
    if (o.tugra?.files) return o.tugra;
    if (o.files) return o as unknown as { files: { path: string }[] };
  }
  throw new Error("npm pack --dry-run --json: beklenmeyen şekil");
}

/** Pack listesindeki yollar — kaynak ağaçta (prepack dist-paket üretir). */
export function paketDiskYollari(): { rel: string; tam: string }[] {
  const kok = motorKok();
  const out: { rel: string; tam: string }[] = [];
  for (const rel of npmPackDosyaListesi()) {
    const tam = join(kok, rel);
    if (!existsSync(tam)) {
      throw new Error(`pack listesinde var, diskte yok: ${rel}`);
    }
    out.push({ rel, tam });
  }
  return out;
}
