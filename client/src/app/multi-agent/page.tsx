import { Suspense } from "react";
import { ConfigureRun } from "./_components/ConfigureRun";

/* Route: /multi-agent (Configure run + Results — AC-5). Thin route entry —
   the PR-picker/agent-checklist/estimate view, its styles, helpers and tests
   are colocated under _components/ConfigureRun. `ConfigureRun` reads `?pr=`
   via `useSearchParams`, hence the Suspense boundary (Next.js CSR-bailout
   requirement, same pattern as `app/eval/page.tsx`). */
export default function MultiAgentPage() {
  return (
    <Suspense fallback={null}>
      <ConfigureRun />
    </Suspense>
  );
}
