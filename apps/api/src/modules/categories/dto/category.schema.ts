import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case')
    .optional(),
  parentId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesSchema = z.object({
  rootOnly: z.boolean().optional(),
});
export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>;
