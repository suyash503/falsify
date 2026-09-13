CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question" text NOT NULL,
	"spec" jsonb NOT NULL,
	"spec_fingerprint" text NOT NULL,
	"assumptions" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"status" text NOT NULL,
	"parent_id" text,
	"forked_because" text,
	"interpretation_provenance" jsonb NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE INDEX "experiments_parent_idx" ON "experiments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "experiments_created_idx" ON "experiments" USING btree ("created_at");