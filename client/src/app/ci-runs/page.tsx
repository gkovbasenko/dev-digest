import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs — the workspace-wide CI Runs page (AC-25/26/27). Runs that
   came back from GitHub Actions (ingested into `ci_runs`), NOT local studio
   runs. Thin route entry; the table view + helpers + styles + tests are
   colocated under _components/CiRunsView. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
