-- Additive only: one new table.
CREATE TABLE "ticket_escalations" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact_due_at" TIMESTAMP(3) NOT NULL,
    "preferred_method" TEXT,
    "contacted_at" TIMESTAMP(3),
    "contact_method" TEXT,
    "contacted_by_id" TEXT,
    "contact_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_escalations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_escalations_ticket_id_key" ON "ticket_escalations"("ticket_id");
CREATE INDEX "ticket_escalations_org_id_contacted_at_idx" ON "ticket_escalations"("org_id", "contacted_at");

ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_escalations" ADD CONSTRAINT "ticket_escalations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
