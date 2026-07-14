import { zipSync, strToU8 } from "fflate";
import type { CiExportInputBody, CiFile } from "@devdigest/shared";
import { DEFAULT_TRIGGERS } from "./constants";

/** The wizard's accumulated, editable input (Target + Configure steps),
    independent of the `agentId` the mutation needs separately. */
export interface WizardInput {
  repo: string;
  target: CiExportInputBody["target"];
  triggers: string[];
  post_as: CiExportInputBody["post_as"];
  base: string;
}

export function initialWizardInput(): WizardInput {
  return {
    repo: "",
    target: "gha",
    triggers: [...DEFAULT_TRIGGERS],
    post_as: "github_review",
    base: "main",
  };
}

/** Build a real `.zip` (AC-11 "Copy files as a zip") preserving each file's
    FULL repo-relative path (`.devdigest/agents/<slug>.yaml`,
    `.github/workflows/devdigest-review.yml`, …) as its directory structure
    inside the archive — flattening to basenames would silently drop the
    `.devdigest/`/`.github/workflows/` layout the user needs to reproduce by
    hand. Synchronous `zipSync` (fflate) is fine at this bundle's size (a few
    small text files + the runner bundle, well under a browser-blocking
    threshold). */
export function buildZip(files: Pick<CiFile, "path" | "contents">[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.contents);
  return zipSync(entries, { level: 6 });
}

/** Trigger a single browser download of the bundle as one `.zip` archive. */
export function downloadFiles(files: Pick<CiFile, "path" | "contents">[]) {
  const zipped = buildZip(files);
  // `zipped.buffer` is typed `ArrayBufferLike` (could be a `SharedArrayBuffer`
  // per lib.dom); `Blob` wants a concrete `ArrayBuffer`-backed view — slicing
  // into a fresh `Uint8Array` normalizes the type without a real copy cost at
  // this bundle's size.
  const blob = new Blob([zipped.slice()], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "devdigest-ci.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
