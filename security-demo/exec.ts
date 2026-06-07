import { exec, execSync } from "node:child_process";

export function pingHost(host: string, cb: (out: string) => void) {
  exec(`ping -c 1 ${host}`, (_err, stdout) => cb(stdout));
}

export function gzip(filename: string): Buffer {
  return execSync(`gzip -c ${filename}`);
}
