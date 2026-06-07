import { readFileSync } from "node:fs";
import { join } from "node:path";

const UPLOAD_DIR = "/var/app/uploads";

export function readUpload(name: string): string {
  return readFileSync(join(UPLOAD_DIR, name), "utf8");
}
