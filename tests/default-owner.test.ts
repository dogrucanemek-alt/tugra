import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A note written by the package names its owner with the vault's English
// vocabulary ("owner", as setup writes it), never a person's or a role's name.
describe("default owner", () => {
  it("no source file writes a default owner other than \"owner\"", () => {
    const src = join(__dirname, "..", "src");
    const offenders: string[] = [];
    for (const name of readdirSync(src)) {
      if (!name.endsWith(".ts")) continue;
      const text = readFileSync(join(src, name), "utf8");
      for (const m of text.matchAll(/sahip:\s*"([^"]*)"/g)) {
        if (m[1] !== "owner") offenders.push(`${name}: sahip: "${m[1]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
