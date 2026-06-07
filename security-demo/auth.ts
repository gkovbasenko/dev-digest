interface Ctx {
  userId: string;
  isAdmin: boolean;
}

interface Store {
  deleteRepo(id: string): Promise<void>;
  getInvoice(id: string): Promise<unknown>;
}

export async function deleteRepo(store: Store, ctx: Ctx, repoId: string) {
  return store.deleteRepo(repoId);
}

export async function getInvoice(store: Store, ctx: Ctx, invoiceId: string) {
  return store.getInvoice(invoiceId);
}
