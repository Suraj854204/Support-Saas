"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { useCreateTeam } from "@/hooks/use-teams";

const teamSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
});
type TeamValues = z.infer<typeof teamSchema>;

export function TeamFormDialog() {
  const [open, setOpen] = useState(false);
  const createTeam = useCreateTeam();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TeamValues>({ resolver: zodResolver(teamSchema), defaultValues: { name: "" } });

  const onSubmit = (values: TeamValues) => {
    createTeam.mutate(values.name, {
      onSuccess: () => {
        toast.success("Team created");
        reset();
        setOpen(false);
      },
      onError: () => toast.error("Couldn't create the team. Try again."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New team
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" {...register("name")} placeholder="Billing support" />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={createTeam.isPending}>
              {createTeam.isPending ? "Creating..." : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
