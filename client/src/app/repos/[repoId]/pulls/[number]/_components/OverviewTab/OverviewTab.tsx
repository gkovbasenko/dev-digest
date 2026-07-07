"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastPanel } from "../BlastPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | number | null | undefined;
  prBody: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function OverviewTab({ prId, prBody, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {/* Intent (left) + Blast Radius (right) sit side-by-side per the design;
          the Blast panel is part of the Overview, not a standalone tab. */}
      <div style={s.columns}>
        <div style={s.column}>
          <IntentCard prId={prId} />
        </div>
        <div style={s.column}>
          <BlastPanel
            prId={prId != null ? String(prId) : null}
            repoId={repoId}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        </div>
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
