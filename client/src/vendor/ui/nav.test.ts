import { describe, it, expect } from "vitest";
import { NAV } from "./nav";
import shellMessages from "../../../messages/en/shell.json";

describe("NAV — Project Context (T9)", () => {
  it("registers a 'Project Context' item under the WORKSPACE group, routed to /repos/:repoId/context", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE");
    expect(workspace).toBeDefined();
    const item = workspace!.items.find((it) => it.key === "context");
    expect(item).toBeDefined();
    expect(item).toMatchObject({
      label: "Project Context",
      icon: "Folder",
      href: "/repos/:repoId/context",
    });
  });

  it("shell.json's nav.context message renders 'Go to Project Context' via the commandPalette.goTo template", () => {
    // useShellCommands builds each nav command's label as
    // t("commandPalette.goTo", { label: t(`nav.${item.key}`) }) — assert the
    // same substitution here without needing the full provider stack.
    expect(shellMessages.nav.context).toBe("Project Context");
    const rendered = shellMessages.commandPalette.goTo.replace(
      "{label}",
      shellMessages.nav.context
    );
    expect(rendered).toBe("Go to Project Context");
  });
});
