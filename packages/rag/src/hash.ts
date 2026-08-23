import { createHash } from "node:crypto";

/** Short content fingerprint used in Chroma metadata for change detection. */
export function sha1Hex(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}
