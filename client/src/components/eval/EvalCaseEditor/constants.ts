export const INPUT_TABS = [
  { key: "diff", label: "Diff" },
  { key: "files", label: "Files" },
  { key: "meta", label: "PR meta" },
] as const;

export type InputTabKey = (typeof INPUT_TABS)[number]["key"];
