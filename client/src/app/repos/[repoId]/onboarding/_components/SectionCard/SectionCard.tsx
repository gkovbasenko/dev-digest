/* SectionCard — one collapsible onboarding SECTION (architecture, critical
   paths, how to run, guided reading, first tasks). Local useState collapse,
   mirroring ReviewRunAccordion's pattern (pulls/[number]/_components). */
"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export function SectionCard({
  id,
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  id?: string;
  icon: IconName;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const I = Icon[icon];

  return (
    <div id={id} style={s.card}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.header}
      >
        <I size={15} style={s.icon} />
        <span style={s.title}>{title}</span>
        <span style={{ flex: 1 }} />
        <Icon.ChevronDown size={16} style={s.chevron(open)} />
      </div>
      {open && <div style={s.body}>{children}</div>}
    </div>
  );
}

export default SectionCard;
