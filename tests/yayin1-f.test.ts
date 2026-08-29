import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motorKok } from "../src/yollar.js";

describe("YAYIN/1 F: README", () => {
  const readme = readFileSync(join(motorKok(), "README.md"), "utf8");

  it("üstte tek komut: npx tugra init", () => {
    const ilkKod = readme.match(/```bash\n([\s\S]*?)```/);
    expect(ilkKod?.[1]).toMatch(/npx tugra init/);
  });

  it("garanti ETMEDİKLERİMİZ bölümü duruyor", () => {
    expect(readme).toMatch(/## What we do not guarantee/);
    expect(readme).toMatch(/No cloud sync/);
    expect(readme).toMatch(/No hosted service/);
  });
});
