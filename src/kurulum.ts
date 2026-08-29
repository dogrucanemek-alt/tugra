/**
 * Tugra CLI — init / doctor / help. MCP sunucusu mcp.ts'de kalır.
 * İnsan çıktısı stderr; stdout JSON-RPC kanalıdır.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { olguDosyaMetni, yukleKasa } from "./dosya.js";
import { semaUyarilari } from "./dogrula.js";
import type { OlguMeta } from "./sema.js";
import { ulid } from "./ulid.js";
import { eskiOrtamUyarilari, varsayilanAkis, varsayilanKasa } from "./yollar.js";
import { gocDil } from "./goc-dil.js";
import { varsayilanYetkiKok } from "./yetki.js";

export const TUGRA_SURUM = "0.1.0";

export type CliMode = "help" | "init" | "doctor" | "version" | "server";

export interface CliIo {
  argv: string[];
  stdinIsTTY: boolean;
  cwd: string;
  stdout: { write(s: string): void };
  stderr: { write(s: string): void };
}

export interface CliSonuc {
  exit: number;
  mode: CliMode;
}

export function configBlogu(kasa: string, akis: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        tugra: {
          command: "npx",
          args: ["-y", "tugra"],
          env: {
            TUGRA_KASA: kasa,
            TUGRA_AKIS: akis,
          },
        },
      },
    },
    null,
    2,
  );
}

export function yardimMetni(kasa: string, akis: string, olgu: number): string {
  return [
    `tugra ${TUGRA_SURUM} — provenance-aware memory for AI agents`,
    "",
    `vault looked up at: ${kasa}`,
    `events looked up at: ${akis}`,
    `facts found: ${olgu}`,
    "",
    "Commands:",
    "  tugra              MCP server when piped; this help on a TTY",
    "  tugra init [dir]   create vault + events, write a sample fact",
    "  tugra doctor       check paths, schema warnings, Node version",
    "  tugra goc-dil [dir] [--yaz] [--canli]  migrate frontmatter keys (dry default;",
    "                               --canli required to write your configured vault)",
    "  tugra --version",
    "",
    "Paste this into Claude Desktop / Cursor MCP config:",
    configBlogu(kasa, akis),
    "",
  ].join("\n");
}

function ornekOlgu(): { meta: OlguMeta; govde: string } {
  const gun = new Date().toISOString().slice(0, 10);
  return {
    meta: {
      uid: ulid(),
      tur: "kural",
      kapsam: "kurum",
      dunya: null,
      konu: "tugra.hello",
      baslik: "Every claim carries its source",
      sahip: "owner",
      yazan: "tugra init",
      tarih: new Date().toISOString(),
      guven: 0.9,
      raf_omru: "suresiz",
      dogrulandi: gun,
      kaynak: [
        {
          tur: "dosya",
          isaret: "README.md#install",
          alindi: gun,
        },
      ],
      baglar: [],
      etki: [],
      yerine: null,
      curuten: null,
    },
    govde:
      "Every claim carries its source, its age, and its boundary.\n\n**Why:** a fact that cannot name where it came from is not a fact.\n**How:** search, read, propose — never invent on a bounded topic.",
  };
}

export function tugraInit(
  dizin: string,
  io: Pick<CliIo, "stderr">,
): { yazilan: string[]; atlanan: string[] } {
  const kok = resolve(dizin);
  const kasa = join(kok, "kasa");
  const akis = join(kok, "akis");
  const yazilan: string[] = [];
  const atlanan: string[] = [];

  for (const d of [kok, kasa, akis]) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
      yazilan.push(d);
    } else {
      atlanan.push(d);
    }
  }

  const ornekYol = join(kasa, "hello.md");
  if (existsSync(ornekYol)) {
    atlanan.push(ornekYol);
    io.stderr.write(`tugra init: exists, not overwritten: ${ornekYol}\n`);
  } else {
    const o = ornekOlgu();
    writeFileSync(ornekYol, olguDosyaMetni(o), "utf8");
    yazilan.push(ornekYol);
  }

  io.stderr.write(`tugra init: vault ${kasa}\n`);
  io.stderr.write(`tugra init: events ${akis}\n`);
  io.stderr.write("Paste this config:\n");
  io.stderr.write(configBlogu(kasa, akis) + "\n");
  return { yazilan, atlanan };
}

export function tugraDoctor(
  io: Pick<CliIo, "stderr">,
  kokler?: { kasa?: string; akis?: string; yetki?: string },
): number {
  const kasa = kokler?.kasa ?? varsayilanKasa();
  const akis = kokler?.akis ?? varsayilanAkis();
  const yetki = kokler?.yetki ?? varsayilanYetkiKok();
  let bozuk = false;

  const nodeMaj = Number(process.versions.node.split(".")[0]);
  io.stderr.write(`tugra doctor ${TUGRA_SURUM}\n`);
  io.stderr.write(`Node ${process.version} (engines: >=20)\n`);
  if (nodeMaj < 20) {
    io.stderr.write("FIX: install Node 20 or newer — https://nodejs.org\n");
    bozuk = true;
  }

  if (!existsSync(kasa)) {
    io.stderr.write(`MISSING vault: ${kasa}\n`);
    io.stderr.write("FIX: tugra init <dir>  or set TUGRA_KASA\n");
    bozuk = true;
  } else {
    const hepsi = yukleKasa(kasa);
    const uyarilar = hepsi.flatMap((o) =>
      (o.uyarilar ??
        semaUyarilari(
          o.meta as unknown as Record<string, unknown>,
          o.yol,
        ).map((u) => `${u.alan}: ${u.mesaj}`)),
    );
    io.stderr.write(`vault: ${kasa} (${hepsi.length} facts)\n`);
    if (uyarilar.length === 0) {
      io.stderr.write("schema warnings: 0\n");
    } else {
      io.stderr.write(`schema warnings: ${uyarilar.length}\n`);
      for (const u of uyarilar.slice(0, 20)) io.stderr.write(`  - ${u}\n`);
    }
  }

  if (!existsSync(akis)) {
    io.stderr.write(`MISSING events: ${akis}\n`);
    io.stderr.write("FIX: mkdir the directory or tugra init <dir>\n");
    bozuk = true;
  } else {
    io.stderr.write(`events: ${akis}\n`);
  }

  if (existsSync(yetki)) {
    io.stderr.write(`authorization: ${yetki}\n`);
  } else {
    io.stderr.write(
      `authorization: not set (${yetki}) — single-user read is open\n`,
    );
  }

  for (const u of eskiOrtamUyarilari()) {
    io.stderr.write(`${u}\n`);
  }

  io.stderr.write(bozuk ? "doctor: FAIL\n" : "doctor: OK\n");
  return bozuk ? 1 : 0;
}

/**
 * Argümansız + boru → sunucu. Argümansız + TTY → yardım ve çık.
 * stdout'a yalnız sunucu modunda protokol yazılır.
 */
export function tugraCli(io: CliIo): CliSonuc {
  const args = io.argv.filter((a) => a !== "--");
  const kasa = varsayilanKasa();
  const akis = varsayilanAkis();

  if (args[0] === "--version" || args[0] === "-v") {
    io.stderr.write(`${TUGRA_SURUM}\n`);
    return { exit: 0, mode: "version" };
  }
  if (args[0] === "--help" || args[0] === "-h") {
    let n = 0;
    try {
      n = existsSync(kasa) ? yukleKasa(kasa).length : 0;
    } catch {
      n = 0;
    }
    io.stderr.write(yardimMetni(kasa, akis, n));
    return { exit: 0, mode: "help" };
  }
  if (args[0] === "init") {
    const hedef = args[1] ? resolve(io.cwd, args[1]) : join(io.cwd, "tugra");
    tugraInit(hedef, io);
    return { exit: 0, mode: "init" };
  }
  if (args[0] === "doctor") {
    const exit = tugraDoctor(io);
    return { exit, mode: "doctor" };
  }
  if (args[0] === "goc-dil") {
    const yaz = args.includes("--yaz");
    const canli = args.includes("--canli");
    const hedef = args.find(
      (a) => a !== "goc-dil" && a !== "--yaz" && a !== "--canli",
    );
    const r = gocDil(hedef ? resolve(io.cwd, hedef) : varsayilanKasa(), {
      yaz,
      canli,
    });
    if (r.reddedildi) {
      io.stderr.write(`tugra goc-dil: ${r.reddedildi}\n`);
      return { exit: 2, mode: "help" };
    }
    io.stderr.write(
      `tugra goc-dil: ${r.yazilan} would-change, ${r.atlanan} already-english, dry=${r.dry}\n`,
    );
    return { exit: 0, mode: "help" };
  }
  if (io.stdinIsTTY) {
    let n = 0;
    try {
      n = existsSync(kasa) ? yukleKasa(kasa).length : 0;
    } catch {
      n = 0;
    }
    io.stderr.write(yardimMetni(kasa, akis, n));
    return { exit: 0, mode: "help" };
  }
  return { exit: 0, mode: "server" };
}
