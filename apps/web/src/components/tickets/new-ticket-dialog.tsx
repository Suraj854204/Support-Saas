"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCustomer, useCustomers } from "@/hooks/use-customers";
import { useCreateTicket } from "@/hooks/use-tickets";

const NEW_CUSTOMER = "__new__";

const ticketSchema = z
  .object({
    subject: z.string().min(1, "Subject is required").max(300),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    initialMessage: z.string().optional(),
    customerSelection: z.string().min(1, "Choose a customer"),
    newCustomerName: z.string().optional(),
    newCustomerEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  })
  .refine((data) => data.customerSelection !== NEW_CUSTOMER || data.newCustomerName || data.newCustomerEmail, {
    message: "Provide a name or email for the new customer",
    path: ["newCustomerName"],
  });
type TicketValues = z.infer<typeof ticketSchema>;

export function NewTicketDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: customers } = useCustomers();
  const createCustomer = useCreateCustomer();
  const createTicket = useCreateTicket();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TicketValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { subject: "", priority: "normal", initialMessage: "", customerSelection: "" },
  });

  const customerSelection = watch("customerSelection");
  const isNewCustomer = customerSelection === NEW_CUSTOMER;
  const isSubmitting = createCustomer.isPending || createTicket.isPending;

  const onSubmit = async (values: TicketValues) => {
    try {
      let customerId = values.customerSelection;

      if (isNewCustomer) {
        const customer = await createCustomer.mutateAsync({
          name: values.newCustomerName || undefined,
          email: values.newCustomerEmail || undefined,
        });
        customerId = customer.id;
      }

      const ticket = await createTicket.mutateAsync({
        subject: values.subject,
        customerId,
        priority: values.priority,
        initialMessage: values.initialMessage || undefined,
      });

      toast.success("Ticket created");
      reset();
      setOpen(false);
      router.push(`/tickets/${ticket.id}`);
    } catch {
      toast.error("Couldn't create the ticket. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerSelection} onValueChange={(v) => setValue("customerSelection", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? c.email ?? "Unnamed customer"}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CUSTOMER}>+ New customer</SelectItem>
                </SelectContent>
              </Select>
              {errors.customerSelection && (
                <p className="text-xs text-danger">{errors.customerSelection.message}</p>
              )}
            </div>

            {isNewCustomer && (
              <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-muted/40 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="newCustomerName">Name</Label>
                  <Input id="newCustomerName" {...register("newCustomerName")} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newCustomerEmail">Email</Label>
                  <Input id="newCustomerEmail" {...register("newCustomerEmail")} placeholder="jane@example.com" />
                </div>
                {errors.newCustomerName && (
                  <p className="col-span-2 text-xs text-danger">{errors.newCustomerName.message}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" {...register("subject")} placeholder="Cannot reset my password" />
              {errors.subject && <p className="text-xs text-danger">{errors.subject.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={watch("priority")}
                onValueChange={(v) => setValue("priority", v as TicketValues["priority"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="initialMessage">Initial message (optional)</Label>
              <Textarea
                id="initialMessage"
                rows={3}
                {...register("initialMessage")}
                placeholder="What did the customer say?"
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
