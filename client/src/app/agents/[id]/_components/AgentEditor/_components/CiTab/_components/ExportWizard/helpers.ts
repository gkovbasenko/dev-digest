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

/** Trigger a browser download for one generated file — no zip library is
    installed, so each file is offered as its own download rather than a
    single archive; functionally equivalent for AC-11 ("let the user download
    the returned files without requiring a PR"). */
export function downloadFile(file: Pick<CiFile, "path" | "contents">) {
  const blob = new Blob([file.contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.path.split("/").pop() || file.path;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadFiles(files: Pick<CiFile, "path" | "contents">[]) {
  for (const f of files) downloadFile(f);
}
