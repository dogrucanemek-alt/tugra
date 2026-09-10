/**
 * Frontmatter Türkçe → İngilizce. Gövde ve başlık değerine DOKUNMAZ.
 * Varsayılan --dry. Yazmak için --yaz. Canlı kasaya yazmaz.
 */
import {
  cpSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import YAML from "yaml";
import { parseOlguDosya, taraMarkdown } from "./dosya.js";
import { kokpitKok, varsayilanKasa } from "./yollar.js";
import { frontmatterDisaYaz, frontmatterIceAl } from "./vocabulary.js";

const OKF_SADECE = new Set([
  "tags",
  "sources",
  "generated",
  "stale_after",
  "status",
]);

/**
 * Korunan kasalar — yola değil NİYETE bakan bekçinin kapsamı.
 *
 * 🔴 GATE BULGUSU (2026-08-29): bekçi yalnız `kokpitKok()/kasa`ya bakıyordu.
 * Kurulu pakette `kokpitKok()` `node_modules` altını gösterdiği için
 * `npx tugra goc-dil <kasa> --yaz` — en doğal çağrı — bekçiyi ATLIYORDU.
 * Test in-repo koştuğu için yeşil yanıyordu.
 * 🔑 ***Yeşil yanan bekçi, çalıştığını kanıtlamaz.***
 *
 * Kapsam artık iki yer: repo kökündeki kasa (geliştirme) **ve** bu kurulumun
 * hizmet ettiği kasa (`TALAMUS_KASA`). İkincisi yabancının kendi kasasıdır —
 * onu göç ettirmek ZATEN amaç, o yüzden yasak değil: `--canli` ile açıkça
 * istenir. Kaza ile olmaz, bilerek olur.
 */
export function korunanKasalar(): string[] {
  return [resolve(kokpitKok(), "kasa"), resolve(varsayilanKasa())];
}

export function canliKasaYolu(): string {
  return korunanKasalar()[0]!;
}

/**
 * 🔴 2026-09-10: this compared paths for EQUALITY, so `<kasa>/_oneriler` —
 * a directory inside the vault the guard defends — was not protected, and
 * `--yaz` alone would have written there. Same shape as the 2026-08-29
 * finding above: the guard looked at one path instead of at intent.
 *
 * The separator matters. A bare prefix test would also swallow a sibling
 * like `<kasa>-yedek` or `<kasa>.goc-yedek` and refuse a legitimate write;
 * those are next to the vault, not in it.
 */
export function canliKasaMi(hedef: string): boolean {
  const h = resolve(hedef);
  return korunanKasalar().some(
    (k) => k === h || h.startsWith(k.endsWith(sep) ? k : k + sep),
  );
}

/**
 * Key order is not a difference. Comparing serialised frontmatter directly
 * would rewrite every already-English file, because the writer puts `uid`
 * first; churn on 396 files is not a migration, it is noise.
 */
function kararliJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(kararliJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${kararliJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/**
 * Whether this file still says anything in the old language.
 *
 * 🔴 2026-09-10: this used to ask "does a KEY appear in the Turkish list",
 * which was right while only keys were translated. When the shelf_life VALUE
 * moved too, the check left a hole shaped exactly like the defect: a file
 * with English keys and `shelf_life: suresiz` answered "nothing to do" and
 * stayed mixed forever.
 *
 * 🔑 The detector is now the translator itself. It cannot fall behind what
 * gets translated, because it is the same code path — a new translation is
 * covered on the day it is written, with nothing to remember.
 */
function gocGerekliMi(
  kayit: Record<string, unknown>,
  sonuc: Record<string, unknown>,
): boolean {
  return kararliJson(kayit) !== kararliJson(sonuc);
}

export function gocFrontmatterMetni(metin: string): {
  metin: string;
  degisti: boolean;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(metin);
  if (!m) return { metin, degisti: false };
  const ham = YAML.parse(m[1]);
  if (!ham || typeof ham !== "object" || Array.isArray(ham)) {
    return { metin, degisti: false };
  }
  const kayit = ham as Record<string, unknown>;

  const okf: Record<string, unknown> = {};
  const urun: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(kayit)) {
    if (OKF_SADECE.has(k)) okf[k] = v;
    else if (k === "verified" && Array.isArray(v)) okf[k] = v;
    else urun[k] = v;
  }
  const dis = frontmatterDisaYaz(frontmatterIceAl(urun)) as Record<
    string,
    unknown
  >;
  const birlesik = { ...dis, ...okf };
  if (!gocGerekliMi(kayit, birlesik)) return { metin, degisti: false };

  const yeniFm = YAML.stringify(birlesik, { lineWidth: 0 }).trimEnd();
  return { metin: `---\n${yeniFm}\n---\n${m[2]}`, degisti: true };
}

export interface GocDilSonuc {
  dosya: number;
  yazilan: number;
  atlanan: number;
  dry: boolean;
  reddedildi?: string;
  yedek?: string;
}

export function gocDilDogrula(onceKok: string, sonraKok: string): string[] {
  const fark: string[] = [];
  const once = taraMarkdown(onceKok).map((y) => ({
    y,
    o: parseOlguDosya(readFileSync(y, "utf8"), y),
  }));
  const sonra = taraMarkdown(sonraKok).map((y) => ({
    y,
    o: parseOlguDosya(readFileSync(y, "utf8"), y),
  }));
  if (once.length !== sonra.length) {
    fark.push(`olgu sayısı ${once.length} → ${sonra.length}`);
  }
  const sonraUid = new Map(sonra.map((x) => [x.o.meta.uid, x.o]));
  for (const { o } of once) {
    const s = sonraUid.get(o.meta.uid);
    if (!s) {
      fark.push(`kayıp uid ${o.meta.uid}`);
      continue;
    }
    if (s.meta.baslik !== o.meta.baslik) {
      fark.push(`${o.meta.uid} başlık değişti`);
    }
    if (s.govde !== o.govde) {
      fark.push(`${o.meta.uid} gövde değişti`);
    }
    if (JSON.stringify(s.meta) !== JSON.stringify(o.meta)) {
      fark.push(`${o.meta.uid} meta değer farkı`);
    }
  }
  return fark;
}

export function gocDil(
  kasaKok: string,
  opts: { yaz?: boolean; canli?: boolean; taslaklar?: boolean } = {},
): GocDilSonuc {
  const kok = resolve(kasaKok);
  // Önizleme (--dry) her yerde serbest: hiçbir şey yazmaz, korkulacak bir
  // yanı yok. Reddedilen şey korunan bir kasaya NİYETSİZ YAZMAK.
  if (canliKasaMi(kok) && opts.yaz && !opts.canli) {
    return {
      dosya: 0,
      yazilan: 0,
      atlanan: 0,
      dry: !opts.yaz,
      reddedildi:
        "korunan kasa — önce kopyada dene; gerçekten bunu istiyorsan --canli ekle (yedek yine de alınır)",
    };
  }
  const dosyalar = taraMarkdown(kok, { taslaklar: opts.taslaklar });
  const dry = !opts.yaz;
  let yazilan = 0;
  let atlanan = 0;
  let yedek: string | undefined;

  if (!dry && dosyalar.length) {
    yedek = `${kok}.goc-yedek`;
    if (!existsSync(yedek)) {
      cpSync(kok, yedek, { recursive: true });
    }
  }

  for (const yol of dosyalar) {
    const ham = readFileSync(yol, "utf8");
    const { metin, degisti } = gocFrontmatterMetni(ham);
    if (!degisti) {
      atlanan += 1;
      continue;
    }
    if (!dry) writeFileSync(yol, metin, "utf8");
    yazilan += 1;
  }
  return { dosya: dosyalar.length, yazilan, atlanan, dry, yedek };
}
