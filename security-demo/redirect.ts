interface Res {
  redirect(url: string): void;
}

export function loginRedirect(res: Res, next: string) {
  res.redirect(next);
}
