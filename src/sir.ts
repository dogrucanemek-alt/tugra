/**
 * Sır yakalayıcı — çıktıya asla girmez (kasa-sağlığı 13. değişmez).
 * Desenler yakalayıcıdır, sır değil.
 */

/** Tam sır deseni. */
export const SIR_DESENLERI: RegExp[] = [
  /sbp_[A-Za-z0-9]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
];

export function sirRedakte(metin: string): string {
  let out = metin;
  for (const re of SIR_DESENLERI) out = out.replace(re, "«redakte»");
  return out;
}

/** Eşleşen metni DÖNMEZ — yalnız güvenli desen adı. */
export function sirDeseniBul(metin: string): string | null {
  if (!metin) return null;
  for (const re of SIR_DESENLERI) {
    re.lastIndex = 0;
    if (!re.test(metin)) continue;
    const src = re.source;
    if (src.startsWith("sbp_")) return "sbp_";
    if (src.startsWith("sk-ant-")) return "sk-ant-";
    if (src.startsWith("gh")) return "gh*_";
    if (src.startsWith("xox")) return "xox*-";
    if (src.startsWith("AKIA")) return "AKIA";
    if (src.includes("PRIVATE KEY")) return "BEGIN PRIVATE KEY";
    if (src.startsWith("eyJ")) return "eyJ";
    return "bilinmeyen";
  }
  return null;
}
