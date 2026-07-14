/* MultiAgentResults — the Results-slot composition root mounted by
   ConfigureRun (T9) once a `MultiAgentRun` group exists. Owns the
   Columns/Tabs `mode` (plain client state — switching modes never touches
   any run-triggering mutation, AC-27) and the "View trace" drawer, which is
   addressed via the page's own `?trace=<runId>` query param/state so a
   refresh keeps the drawer open on the same run. `RunTraceDrawer` itself is
   reused as-is (Wave 1-3, not touched here). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MultiAgentRun } from "@devdigest/shared";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { AgentColumns } from "../AgentColumns";
import { AgentTabs } from "../AgentTabs";
import { ModeToggle, type ResultsMode } from "../ModeToggle";
import { s } from "./styles";

export function MultiAgentResults({ result }: { result: MultiAgentRun }) {
  const [mode, setMode] = React.useState<ResultsMode>("columns");
  const router = useRouter();
  const search = useSearchParams();
  const traceRunId = search.get("trace");

  const openTrace = (runId: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("trace", runId);
    router.replace(`/multi-agent?${sp.toString()}`);
  };
  const closeTrace = () => {
    const sp = new URLSearchParams(search.toString());
    sp.delete("trace");
    router.replace(`/multi-agent${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const traceColumn = result.columns.find((c) => c.run_id === traceRunId) ?? null;

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      {mode === "columns" ? (
        <AgentColumns columns={result.columns} onViewTrace={openTrace} />
      ) : (
        <AgentTabs result={result} />
      )}
      {traceColumn && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          agentName={traceColumn.agent_name}
          prNumber={result.pr_number ?? null}
          running={traceColumn.status === "running"}
          onClose={closeTrace}
        />
      )}
    </div>
  );
}
