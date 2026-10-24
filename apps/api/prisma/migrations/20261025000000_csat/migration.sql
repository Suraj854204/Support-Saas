-- CreateTable
CREATE TABLE "csat_responses" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csat_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "csat_responses_rating_range" CHECK ("rating" BETWEEN 1 AND 5)
);

-- CreateIndex
CREATE UNIQUE INDEX "csat_responses_ticket_id_key" ON "csat_responses"("ticket_id");

-- CreateIndex
CREATE INDEX "csat_responses_org_id_created_at_idx" ON "csat_responses"("org_id", "created_at");

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
