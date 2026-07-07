"use client";

import React from "react";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Read-only rendered-markdown view of a skill's body. */
export function PreviewTab({ skill }: { skill: Skill }) {
  return (
    <div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
