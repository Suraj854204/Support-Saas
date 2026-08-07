import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  isVip: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const mergeCustomerSchema = z.object({
  targetCustomerId: z.string().uuid(),
});
export type MergeCustomerInput = z.infer<typeof mergeCustomerSchema>;
