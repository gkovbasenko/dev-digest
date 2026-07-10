import { Suspense } from "react";
import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (Eval Dashboard, home surface for eval health — AC-15/AC-22).
   Thin route entry — the list/agent-detail/compare views, their styles,
   helpers and tests are colocated under _components/EvalDashboardView.
   `EvalDashboardView` reads `?agentId=` via `useSearchParams`, hence the
   Suspense boundary (Next.js CSR-bailout requirement). */
export default function EvalPage() {
  return (
    <Suspense fallback={null}>
      <EvalDashboardView />
    </Suspense>
  );
}
