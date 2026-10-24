-- Additive only: one new table.
CREATE TABLE "macros" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reply_body" TEXT,
    "set_status" TEXT,
    "set_priority" TEXT,
    "add_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "macros_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "macros_org_id_idx" ON "macros"("org_id");

ALTER TABLE "macros" ADD CONSTRAINT "macros_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
