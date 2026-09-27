/**
 * Inventory row lookup shared by shop + payment flows.
 *
 * Rows are keyed by (productId, variantId) with a NULLABLE variantId, which
 * Prisma's compound-unique input types reject (and Postgres treats NULLs as
 * distinct). All reads therefore go through findFirst with nullable equality
 * (IS NULL) instead of the compound unique key.
 */
export async function findInventoryRow(
  db: any,
  productId: string,
  variantId: string | null,
): Promise<any> {
  return db.inventory.findFirst({ where: { productId, variantId } });
}
