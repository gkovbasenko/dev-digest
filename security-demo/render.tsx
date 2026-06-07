import React from "react";

export function Comment({ comment }: { comment: string }) {
  return <div dangerouslySetInnerHTML={{ __html: comment }} />;
}

export function highlight(term: string): string {
  return `<mark>${term}</mark>`;
}
