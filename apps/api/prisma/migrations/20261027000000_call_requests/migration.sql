-- CreateTable
CREATE TABLE "call_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "phone" TEXT NOT NULL,
    "preferred_time" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "assignee_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "call_requests_status_check" CHECK ("status" IN ('requested','scheduled','completed','no_answer','cancelled'))
);

-- CreateIndex
CREATE INDEX "call_requests_org_id_status_created_at_idx" ON "call_requests"("org_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "call_requests_ticket_id_idx" ON "call_requests"("ticket_id");

-- AddForeignKey
ALTER TABLE "call_requests" ADD CONSTRAINT "call_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_requests" ADD CONSTRAINT "call_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
