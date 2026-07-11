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
