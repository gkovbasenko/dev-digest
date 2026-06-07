import { createHash } from "node:crypto";

export function hashPassword(password: string): string {
  return createHash("md5").update(password).digest("hex");
}

export function resetToken(): string {
  return Math.random().toString(36).slice(2);
}
