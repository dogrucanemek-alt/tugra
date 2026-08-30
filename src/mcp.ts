#!/usr/bin/env node
/**
 * Tugra MCP entry — local filesystem only.
 * Public tools: fact_search, fact_read, fact_propose, event_report.
 * Stored fact field names stay Turkish (kaynak, guven, raf_omru, sinir).
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { akisBildir, type Eylem, type AkisDurum } from "./akis.js";
import { olguAra, olguOkuMcp, olguOner, type OlguOnerKaynak } from "./arama.js";
import { presentation, toWire } from "./outbound.js";
import type { KaynakTur, Tur } from "./sema.js";
import { MCP_OKUMA_AJAN, yetkiKontrol } from "./yetki.js";

export { MCP_OKUMA_AJAN };
import { tugraCli } from "./kurulum.js";
import { konuHaritasiYukle } from "./konu.js";
import { varsayilanAkis, varsayilanKasa } from "./yollar.js";

export const TUGRA_ARACLAR = [
  "fact_search",
  "fact_read",
  "fact_propose",
  "event_report",
] as const;
export type TugraArac = (typeof TUGRA_ARACLAR)[number];

const TUR_DIS: Record<string, Tur> = {
  fact: "olgu",
  decision: "karar",
  rule: "kural",
  observation: "gozlem",
  boundary: "sinir",
};

const KAYNAK_DIS: Record<string, KaynakTur> = {
  sql: "sql",
  file: "dosya",
  mail: "mail",
  measurement: "olcum",
  human: "insan",
  web: "web",
  clipboard: "pano",
  window: "pencere",
};

const EYLEM_DIS: Record<string, Eylem> = {
  read: "okuma",
  write: "yazma",
  search: "arama",
  run: "calistirma",
  decide: "karar",
  wait: "bekleme",
};

const DURUM_DIS: Record<string, AkisDurum> = {
  started: "basladi",
  running: "suruyor",
  done: "bitti",
  error: "hata",
};

export interface TugraMcpSecenek {
  kasaKok?: string;
  akisKok?: string;
  yetkiKok?: string;
  /**
   * A0–A5 scale vault. Defaults to `varsayilanKasa()` (TUGRA_KASA / cockpit),
   * not to `kasaKok`. Pass this when the target vault has no scale facts.
   */
  skalaKasa?: string;
}

/**
 * Dört aracın aynı kökleri görmesi.
 * Skala varsayılanı merkezi kasa (`varsayilanKasa` / TUGRA_KASA / kokpit),
 * programatik `kasaKok` değil — ayrı hedef + merkezi yönetişim kurulumu
 * sessizce erişim kaybetmesin. Hedef kasadan skala okumak için `skalaKasa` ver.
 */
export function kokCoz(secenek: TugraMcpSecenek = {}): {
  kasaKok: string;
  akisKok: string;
  yetkiKok: string | undefined;
  skalaKasa: string;
} {
  const kasaKok = secenek.kasaKok ?? varsayilanKasa();
  return {
    kasaKok,
    akisKok: secenek.akisKok ?? varsayilanAkis(),
    yetkiKok: secenek.yetkiKok,
    skalaKasa: secenek.skalaKasa ?? varsayilanKasa(),
  };
}

/**
 * Tek çıkış kapısı. Her araç cevabı buradan geçer, bu yüzden sınır çevirisi
 * (anahtar + değer + üretilen cümle) burada uygulanır — tek tek çağrılarda
 * unutulamaz. Bekçisi: tests/mcp-dil.test.ts.
 */
function jsonCevap(govde: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(toWire(govde), null, 2) },
    ],
  };
}

function nedenIngilizce(neden: string): string {
  if (neden.startsWith("sır deseni:") || neden.startsWith("sir deseni:")) {
    return "secret pattern: not written";
  }
  if (neden === "geçersiz tur" || neden === "gecersiz tur") {
    return "invalid type";
  }
  if (neden.startsWith("yetki yok") || neden.includes("yetki")) {
    return `unauthorized: ${neden.replace(/^yetki yok:?\s*/i, "")}`;
  }
  return neden;
}

function uyariIngilizce(u: string): string {
  if (u.startsWith("yetki yok:")) {
    return `unauthorized:${u.slice("yetki yok:".length)}`;
  }
  return u;
}

function kaynakCevir(
  kaynak:
    | {
        type: string;
        pointer: string;
        taken?: string;
        inherited?: boolean;
      }[]
    | undefined,
): OlguOnerKaynak[] | undefined {
  if (!kaynak?.length) return undefined;
  return kaynak.map((k) => {
    const tur = KAYNAK_DIS[k.type];
    if (!tur) {
      throw new Error(`invalid source type: ${k.type}`);
    }
    return {
      tur,
      isaret: k.pointer,
      alindi: k.taken,
      miras: k.inherited,
    };
  });
}

export async function tugraArac(
  ad: TugraArac,
  args: Record<string, unknown>,
  secenek: TugraMcpSecenek = {},
): Promise<{ content: { type: "text"; text: string }[] }> {
  const { kasaKok, akisKok, yetkiKok, skalaKasa } = kokCoz(secenek);

  if (ad === "fact_search") {
    const query = String(args.query ?? "");
    const r = olguAra(query, {
      kasaKok,
      kapsam: typeof args.scope === "string" ? args.scope : undefined,
      dunya: typeof args.world === "string" ? args.world : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      arsiv: args.archive === true,
      ajan: String(args.agent ?? "").trim() || MCP_OKUMA_AJAN,
      yetkiKok,
      akisKok,
      skalaKasa,
    });
    // İngilizce sunum: guvenliSunum Türkçe kalır (CLI + kokpit onu kullanır),
    // MCP kendi yüzeyini üretir. Dış kaynak alıntı kuralı ikisinde de aynı.
    const sunum = r.sonuclar.map((s) => presentation(s)).join("\n\n---\n\n");
    const { indeksTazelendi, ...govde } = r;
    return jsonCevap({
      ...(indeksTazelendi != null ? { indeks_tazelendi: indeksTazelendi } : {}),
      ...govde,
      sinirUyarilari: r.sinirUyarilari.map(uyariIngilizce),
      sunum,
    });
  }

  if (ad === "fact_read") {
    const uid = String(args.uid ?? "");
    const kim = String(args.agent ?? "").trim() || MCP_OKUMA_AJAN;
    const k = yetkiKontrol({
      ajan: kim,
      eylem: "okuma",
      kapsam: "kurum",
      kasaKok: skalaKasa,
      akisKok,
      yetkiKok,
      dosyaYoksaIzin: false,
    });
    if (!k.izin) {
      return jsonCevap({
        olgu: null,
        durum: "unauthorized",
        notlar: [`unauthorized: ${k.neden} (request ${k.talep_id})`],
      });
    }
    const r = olguOkuMcp(uid, kasaKok);
    return jsonCevap({ ...r, superseded_by: r.yerine_uid });
  }

  if (ad === "fact_propose") {
    const typeHam = typeof args.type === "string" ? args.type : "fact";
    const tur = TUR_DIS[typeHam];
    if (!tur) {
      return jsonCevap({
        ok: false,
        izin: false,
        talep_id: "none",
        neden: "invalid type",
      });
    }
    let kaynak: OlguOnerKaynak[] | undefined;
    try {
      kaynak = kaynakCevir(
        args.source as
          | {
              type: string;
              pointer: string;
              taken?: string;
              inherited?: boolean;
            }[]
          | undefined,
      );
    } catch (e) {
      return jsonCevap({
        ok: false,
        izin: false,
        talep_id: "none",
        neden: e instanceof Error ? e.message : "invalid source",
      });
    }
    const r = olguOner(
      {
        baslik: String(args.title ?? ""),
        govde: String(args.body ?? ""),
        ajan: String(args.agent ?? ""),
        konu: typeof args.topic === "string" ? args.topic : undefined,
        dunya: typeof args.world === "string" ? args.world : undefined,
        tur,
        kaynak,
      },
      kasaKok,
      { yetkiKok, akisKok, skalaKasa },
    );
    if (!r.izin) {
      return jsonCevap({
        ok: false,
        ...r,
        neden: nedenIngilizce(r.neden),
      });
    }
    return jsonCevap({ ok: true, ...r });
  }

  const eylem = EYLEM_DIS[String(args.action ?? "")];
  const durum = DURUM_DIS[String(args.status ?? "")];
  if (!eylem || !durum) {
    return jsonCevap({
      ok: false,
      izin: false,
      neden: "invalid action or status",
    });
  }
  const r = akisBildir(
    {
      ajan: String(args.agent ?? ""),
      is: String(args.job ?? ""),
      eylem,
      durum,
      dunya: typeof args.world === "string" ? args.world : undefined,
      dokundu: Array.isArray(args.touched)
        ? (args.touched as string[])
        : undefined,
      guven: typeof args.confidence === "number" ? args.confidence : undefined,
      not: typeof args.note === "string" ? args.note : undefined,
      bloke: args.blocked === null || typeof args.blocked === "string"
        ? (args.blocked as string | null)
        : undefined,
    },
    akisKok,
    {
      dosyaYoksaIzin: false,
      yetkiKok,
      kasaKok: skalaKasa,
    },
  );
  return jsonCevap(r.izin ? { ok: true, ...r } : { ok: false, ...r });
}

export function createTugraMcp(secenek: TugraMcpSecenek = {}): McpServer {
  konuHaritasiYukle(secenek.kasaKok ?? varsayilanKasa());
  const server = new McpServer({
    name: "tugra",
    version: "0.1.0",
  });

  server.registerTool(
    "fact_search",
    {
      description:
        "Search stored facts. Retired and rotten facts are omitted unless archive is true. Rank: token score, then freshness, then confidence. Boundary facts add a no-claim warning. Authorization required.",
      inputSchema: z.object({
        query: z.string().describe("search text"),
        scope: z
          .string()
          .optional()
          .describe("evrensel | kurum | dunya (stored scope values)"),
        world: z.string().optional().describe("world id when scope is dunya"),
        limit: z.number().int().min(1).max(50).optional(),
        archive: z
          .boolean()
          .optional()
          .describe("include retired and rotten facts; default is the active set"),
        agent: z
          .string()
          .optional()
          .describe(`authorization agent id (default ${MCP_OKUMA_AJAN})`),
      }),
    },
    async (args) => tugraArac("fact_search", args, secenek),
  );

  server.registerTool(
    "fact_read",
    {
      description:
        "Read one fact by uid. Body passes through the presentation layer (injection escaping). Retired facts include superseded_by and the reason.",
      inputSchema: z.object({
        uid: z.string(),
        agent: z
          .string()
          .optional()
          .describe(`authorization agent id (default ${MCP_OKUMA_AJAN})`),
      }),
    },
    async (args) => tugraArac("fact_read", args, secenek),
  );

  server.registerTool(
    "fact_propose",
    {
      description:
        "Write a draft fact under kasa/_oneriler/ (or quarantine). Secret patterns are rejected before any write; the matching text is never returned. type=boundary is always quarantined. Fake mcp:// sources are not injected.",
      inputSchema: z.object({
        title: z.string(),
        body: z.string(),
        agent: z.string().describe("authorization agent id"),
        topic: z.string().optional(),
        world: z.string().optional(),
        type: z
          .enum(["fact", "decision", "rule", "observation", "boundary"])
          .optional()
          .describe("stored as tur; boundary is always quarantined"),
        source: z
          .array(
            z.object({
              type: z.enum([
                "sql",
                "file",
                "mail",
                "measurement",
                "human",
                "web",
                "clipboard",
                "window",
              ]),
              pointer: z.string(),
              taken: z.string().optional(),
              inherited: z.boolean().optional(),
            }),
          )
          .optional()
          .describe(
            "real evidence; if omitted, kaynak is written empty — mcp:// is not injected",
          ),
      }),
    },
    async (args) => tugraArac("fact_propose", args, secenek),
  );

  server.registerTool(
    "event_report",
    {
      description:
        "Append a telemetry line to akis/YYYY-MM-DD.jsonl. No network.",
      inputSchema: z.object({
        agent: z.string().min(1),
        job: z.string().min(1),
        action: z.enum(["read", "write", "search", "run", "decide", "wait"]),
        status: z.enum(["started", "running", "done", "error"]),
        world: z.string().optional(),
        touched: z.array(z.string()).optional(),
        confidence: z.number().min(0).max(1).optional(),
        note: z.string().max(200).optional(),
        blocked: z.string().nullable().optional(),
      }),
    },
    async (args) => tugraArac("event_report", args, secenek),
  );

  return server;
}

function girisDosyasiMi(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    const a = argv1.replace(/\\/g, "/").toLowerCase();
    return (
      a.endsWith("/mcp.js") ||
      a.endsWith("/tugra") ||
      a.endsWith("/tugra.js") ||
      /\/tugra[/\\]dist(?:-paket)?\/mcp\.js$/.test(a)
    );
  }
}

function main(): void {
  const r = tugraCli({
    argv: process.argv.slice(2),
    stdinIsTTY: Boolean(process.stdin.isTTY),
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (r.mode !== "server") {
    process.exit(r.exit);
  }
  serveStdio(() => createTugraMcp());
  console.error(
    `tugra MCP: kasa=${varsayilanKasa()} akis=${varsayilanAkis()}`,
  );
}

if (girisDosyasiMi()) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
