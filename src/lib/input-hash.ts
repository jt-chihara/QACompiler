import { createHash } from "node:crypto";

export function computeInputHash(resolvedPrompt: string, model: string): string {
  const hash = createHash("sha256");
  hash.update(resolvedPrompt);
  hash.update(model);
  return hash.digest("hex");
}
