export function compute(expr: string): unknown {
  return eval(expr);
}

export function parsePayload(raw: string): unknown {
  return eval("(" + raw + ")");
}
