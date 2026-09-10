/**
 * One version, derived once — the three declarations cannot drift again.
 *
 * Found 2026-09-10: the package published to npm as `tugra@0.1.1` reported
 * `0.1.0` to every MCP host, and `tugra --version` said `0.1.0` too. The
 * version was written by hand in three files (`package.json`, `kurulum.ts`,
 * `mcp.ts`); two went stale and no test saw it, because each file was
 * consistent with itself.
 *
 * The fix is to derive the value from `package.json`. Derivation can break
 * quietly — a path moves, a bundler inlines — so this guard measures both
 * that the derived value matches and that no literal version has crept back
 * into the source.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TUGRA_SURUM, tugraCli } from "../src/kurulum.js";
import { TUGRA_MCP_BILGI } from "../src/mcp.js";

const require_ = createRequire(import.meta.url);
const paketSurum: string = require_("../package.json").version;
const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function versionIo() {
  let err = "";
  return {
    bag: {
      argv: ["--version"],
      stdinIsTTY: true,
      cwd: process.cwd(),
      stdout: { write: () => {} },
      stderr: { write: (s: string) => { err += s; } },
    },
    get err() {
      return err;
    },
  };
}

describe("the version derives from a single source", () => {
  it("package.json carries a semver (the anchor of the comparison)", () => {
    expect(paketSurum).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("TUGRA_SURUM equals the package version", () => {
    expect(TUGRA_SURUM).toBe(paketSurum);
  });

  it("`tugra --version` prints the package version", () => {
    const i = versionIo();
    const r = tugraCli(i.bag);
    expect(r.mode).toBe("version");
    expect(i.err.trim()).toBe(paketSurum);
  });

  it("the MCP server reports the package version to the host", () => {
    expect(TUGRA_MCP_BILGI.name).toBe("tugra");
    expect(TUGRA_MCP_BILGI.version).toBe(paketSurum);
  });

  it("no hand-written version is left in the source", () => {
    for (const dosya of ["kurulum.ts", "mcp.ts"]) {
      const metin = readFileSync(join(src, dosya), "utf8");
      const gomulu = metin.match(/"\d+\.\d+\.\d+"/g) ?? [];
      expect(gomulu, `${dosya} carries a hard-coded version`).toEqual([]);
    }
  });
});
