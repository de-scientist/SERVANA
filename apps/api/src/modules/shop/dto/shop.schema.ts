import { z } from 'zod';

const imageSchema = z.object({
  key: z.string().min(1).max(500),
  url: z.string().url().max(2000),
});

// --- products ---------------------------------------------------------------

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.string().uuid().optional(),
  brand: z.string().max(120).optional(),
  sku: z.string().min(2).max(80),
  price: z.number().positive().max(100_000_000),
  salePrice: z.number().positive().max(100_000_000).optional(),
  currency: z.string().default('KES'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
  providerId: z.string().uuid().optional(),
  images: z.array(imageSchema).max(20).optional(),
  variants: z
    .array(
      z.object({
        attrs: z.record(z.string(), z.unknown()),
        priceDelta: z.number().min(-100_000_000).max(100_000_000).default(0),
      }),
    )
    .max(50)
    .optional(),
  inventory: z
    .array(
      z.object({
        // variantSelector matches a variant by its attrs when variants are
        // created inline (no ids exist yet at validation time).
        variantSelector: z.record(z.string(), z.unknown()).optional(),
        quantity: z.number().int().min(0).max(1_000_000),
      }),
    )
    .max(100)
    .optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brand: z.string().max(120).nullable().optional(),
  price: z.number().positive().max(100_000_000).optional(),
  salePrice: z.number().positive().max(100_000_000).nullable().optional(),
  currency: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  providerId: z.string().uuid().nullable().optional(),
  images: z.array(imageSchema).max(20).optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsSchema = z.object({
  q: z.string().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListProductsInput = z.infer<typeof listProductsSchema>;

export const setInventorySchema = z.object({
  variantId: z.string().uuid().nullable().default(null),
  quantity: z.number().int().min(0).max(1_000_000),
});
export type SetInventoryInput = z.infer<typeof setInventorySchema>;

// --- cross-sell ---------------------------------------------------------------

export const crossSellQuerySchema = z.object({
  serviceId: z.string().uuid().optional(),
  providerServiceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type CrossSellQuery = z.infer<typeof crossSellQuerySchema>;

export const createCrossSellLinkSchema = z.object({
  serviceId: z.string().uuid(),
  productId: z.string().uuid(),
  reason: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type CreateCrossSellLinkInput = z.infer<typeof createCrossSellLinkSchema>;

// --- cart ---------------------------------------------------------------------

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  qty: z.number().int().min(1).max(999),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  qty: z.number().int().min(0).max(999),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

// --- orders -------------------------------------------------------------------

export const checkoutSchema = z.object({
  address: z.record(z.string(), z.unknown()).optional(),
  method: z.enum(['MPESA', 'CARD', 'BANK', 'OTHER']).default('OTHER'),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const listOrdersSchema = z.object({
  status: z
    .enum(['PENDING', 'PAID', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;

export const advanceOrderSchema = z.object({
  // Explicit step avoids ambiguous "next" semantics; must be the legal successor.
  to: z.enum(['PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED']),
});
export type AdvanceOrderInput = z.infer<typeof advanceOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const refundOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
