/* ArchitectureSection — the one section allowed a mermaid `diagram` (server
   nulls diagram out on every other section kind, AC-8). MermaidDiagram itself
   renders null on an invalid/empty chart — no crash, no broken box — so a
   missing/bad diagram degrades to body-only automatically (AC-16). */
"use client";

import { Markdown } from "@devdigest/ui";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { s } from "./styles";

export function ArchitectureSection({
  body,
  diagram,
}: {
  body: string;
  diagram?: string | null;
}) {
  return (
    <div>
      {diagram && (
        <div style={s.diagramWrap}>
          <MermaidDiagram chart={diagram} />
        </div>
      )}
      <Markdown>{body}</Markdown>
    </div>
  );
}

export default ArchitectureSection;
