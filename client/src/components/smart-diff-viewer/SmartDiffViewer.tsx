/* SmartDiffViewer — risk-based re-layout of a PR's changed files: files grouped
   into Core logic / Wiring / Boilerplate (boilerplate collapsed by default), a
   "N findings" badge on flagged files that opens the file and jumps to the
   line, and finding lines colored by severity.

   No LLM call here — GET /pulls/:id/smart-diff (useSmartDiff) already composed
   the groups server-side from already-fetched files + already-computed
   findings, and each file carries its own findings (line range + severity), so
   the badge count, jump-to-line target, and per-line color all read from that
   ONE source (no separately-cached reviews query to drift out of sync). This
   component only joins the real unified-diff `patch`:
     - usePullDetail(prId).files → the `patch` per file (the smart-diff payload
       omits it — see docs/plans/smart-diff.md)
   The grouped layout renders correctly before the patch loads — the patch-less
   fallback is a header-only row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, Badge, Button, type IconName } from "@devdigest/ui";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { usePullDetail } from "@/lib/hooks/core";
import { FileCard } from "@/components/diff-viewer/FileCard";
import type { PrFile, Severity, SmartDiffResponse } from "@/lib/types";
import { s } from "./styles";

type SmartDiffGroup = SmartDiffResponse["groups"][number];
type SmartDiffFile = SmartDiffGroup["files"][number];
type SmartDiffRole = SmartDiffGroup["role"];

/** Fixed render order — core logic first, mechanical/generated files last. */
const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

const ROLE_META: Record<SmartDiffRole, { icon: IconName; labelKey: string; descKey: string }> = {
  core: { icon: "Layers", labelKey: "coreLabel", descKey: "coreDescription" },
  wiring: { icon: "Workflow", labelKey: "wiringLabel", descKey: "wiringDescription" },
  boilerplate: { icon: "Boxes", labelKey: "boilerplateLabel", descKey: "boilerplateDescription" },
};

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

export interface FindingRange {
  start: number;
  end: number;
  severity: Severity;
}

/** Worst (most severe) finding covering this line, if any. Exported for unit
    testing — it's the whole correctness of the per-line color overlay. */
export function severityAt(ranges: FindingRange[] | undefined, line: number): Severity | undefined {
  if (!ranges) return undefined;
  let result: Severity | undefined;
  for (const r of ranges) {
    if (line >= r.start && line <= r.end && (!result || SEVERITY_RANK[r.severity] > SEVERITY_RANK[result])) {
      result = r.severity;
    }
  }
  return result;
}

function SmartDiffFileRow({
  file,
  patchFile,
}: {
  file: SmartDiffFile;
  patchFile: PrFile | undefined;
}) {
  const t = useTranslations("prReview");
  // Bumping `nonce` re-triggers FileCard's open+scrollIntoView effect even when
  // `line` is unchanged (e.g. clicking the same badge twice).
  const [jump, setJump] = React.useState<{ line: number; nonce: number } | null>(null);

  // Severity ranges come straight off this file's own findings (composed
  // server-side from the latest review) — no separate reviews query to drift.
  const ranges = React.useMemo<FindingRange[]>(
    () => file.findings.map((f) => ({ start: f.start_line, end: f.end_line, severity: f.severity })),
    [file.findings],
  );

  const findingCount = file.findings.length;
  const badge =
    findingCount > 0 ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // don't also toggle the FileCard header's own open/close
          const line = file.findings[0]!.start_line;
          setJump((prev) => ({ line, nonce: (prev?.nonce ?? 0) + 1 }));
        }}
        style={s.findingsBadgeBtn}
        aria-label={t("smartDiff.findingsBadge", { count: findingCount })}
      >
        <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
          {t("smartDiff.findingsBadge", { count: findingCount })}
        </Badge>
      </button>
    ) : undefined;

  if (!patchFile) {
    // No matching PrFile yet (usePullDetail still loading, or a path mismatch)
    // — render the header only, no expand affordance.
    return (
      <div style={s.headerOnlyCard}>
        <Icon.FileText size={14} style={s.headerOnlyIcon} />
        <span className="mono" style={s.headerOnlyPath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.headerOnlyStat}>
          <span style={s.addText}>+{file.additions}</span> <span style={s.delText}>−{file.deletions}</span>
        </span>
        {badge}
      </div>
    );
  }

  return (
    <FileCard
      file={patchFile}
      severityForLine={(line) => severityAt(ranges, line)}
      headerRight={badge}
      jumpTarget={jump}
    />
  );
}

function GroupSection({
  role,
  group,
  filesByPath,
}: {
  role: SmartDiffRole;
  group: SmartDiffGroup;
  filesByPath: Map<string, PrFile>;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  // Boilerplate starts collapsed (generated/mechanical — skim, not review);
  // Core/Wiring start open.
  const [open, setOpen] = React.useState(role !== "boilerplate");

  return (
    <section>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.groupHeaderRow}
        aria-expanded={open}
      >
        <Icon.ChevronDown
          size={14}
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform .12s",
            color: "var(--text-muted)",
          }}
        />
        <SectionLabel
          icon={meta.icon}
          right={<Badge>{t("smartDiff.filesCount", { count: group.files.length })}</Badge>}
        >
          {t(`smartDiff.${meta.labelKey}`)}
        </SectionLabel>
      </div>
      <p style={s.groupDescription}>{t(`smartDiff.${meta.descKey}`)}</p>
      {open && (
        <div style={s.fileList}>
          {group.files.map((file) => (
            <SmartDiffFileRow
              key={file.path}
              file={file}
              patchFile={filesByPath.get(file.path)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function SmartDiffViewer({ prId }: { prId: string | null | undefined }) {
  const t = useTranslations("common");
  const { data: smartDiff, isError, refetch } = useSmartDiff(prId);
  const { data: pullDetail } = usePullDetail(prId);

  const filesByPath = React.useMemo(() => {
    const map = new Map<string, PrFile>();
    for (const f of pullDetail?.files ?? []) map.set(f.path, f);
    return map;
  }, [pullDetail?.files]);

  // A failed query must not masquerade as a perpetual loader — show an error
  // with a retry. (Only when there's no data to fall back on; a background
  // refetch error keeps the last good render.)
  if (isError && !smartDiff) {
    return (
      <div style={s.empty}>
        <div>{t("states.error")}</div>
        <div style={{ marginTop: 12 }}>
          <Button kind="secondary" size="sm" onClick={() => refetch()}>
            {t("actions.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!smartDiff) {
    return <div style={s.empty}>{t("states.loading")}</div>;
  }

  const groupsByRole = new Map(smartDiff.groups.map((g) => [g.role, g] as const));
  const totalFiles = smartDiff.groups.reduce((n, g) => n + g.files.length, 0);

  if (totalFiles === 0) {
    return <div style={s.empty}>{t("states.empty")}</div>;
  }

  return (
    <div style={s.root}>
      {ROLE_ORDER.map((role) => {
        const group = groupsByRole.get(role);
        if (!group || group.files.length === 0) return null;
        return (
          <GroupSection
            key={role}
            role={role}
            group={group}
            filesByPath={filesByPath}
          />
        );
      })}
    </div>
  );
}
