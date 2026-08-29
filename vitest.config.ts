import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // Her koşum GERÇEK sayıyı diske bırakır. Yol haritası bunu okur; kaynaktan
    // `it(` sayarak TAHMİN etmeyi bıraktı (o sayım `it.each` bloklarını hiç
    // görmüyordu: 228 diyordu, gerçek 244). Ölçüm yoksa "ölçülmedi" der.
    reporters: ["default", ["json", { outputFile: ".test-sonuc.json" }]],
  },
});
