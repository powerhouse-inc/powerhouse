-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE IF NOT EXISTS "Listener" (
	"listenerId" text PRIMARY KEY NOT NULL,
	"driveId" text NOT NULL,
	"label" text,
	"block" boolean NOT NULL,
	"system" boolean NOT NULL,
	"filter" jsonb NOT NULL,
	"callInfo" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SynchronizationUnit" (
	"id" text NOT NULL,
	"syncId" text NOT NULL,
	"driveId" text NOT NULL,
	"documentId" text NOT NULL,
	"scope" text NOT NULL,
	"branch" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT '-1' NOT NULL,
	"lastModified" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Drive" (
	"slug" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"operationId" text NOT NULL,
	"mimeType" text NOT NULL,
	"data" text NOT NULL,
	"filename" text,
	"extension" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Operation" (
	"id" text PRIMARY KEY NOT NULL,
	"opId" text,
	"driveId" text NOT NULL,
	"documentId" text NOT NULL,
	"scope" text NOT NULL,
	"branch" text NOT NULL,
	"index" integer NOT NULL,
	"skip" integer NOT NULL,
	"hash" text NOT NULL,
	"timestamp" timestamp(3) NOT NULL,
	"input" text NOT NULL,
	"type" text NOT NULL,
	"clipboard" boolean DEFAULT false,
	"context" jsonb,
	"resultingState" "bytea"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Document" (
	"id" text NOT NULL,
	"driveId" text NOT NULL,
	"created" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastModified" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" text,
	"initialState" text NOT NULL,
	"documentType" text NOT NULL,
	CONSTRAINT "Document_pkey" PRIMARY KEY("id","driveId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SynchronizationUnit" ADD CONSTRAINT "SynchronizationUnit_documentId_driveId_fkey" FOREIGN KEY ("driveId","documentId") REFERENCES "public"."Document"("id","driveId") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."Operation"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Operation" ADD CONSTRAINT "Operation_driveId_documentId_scope_branch_fkey" FOREIGN KEY ("driveId","documentId","scope","branch") REFERENCES "public"."SynchronizationUnit"("driveId","documentId","scope","branch") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SynchronizationUnit_driveId_documentId_scope_branch_revisio_idx" ON "SynchronizationUnit" USING btree ("driveId","documentId","scope","branch","revision");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SynchronizationUnit_driveId_syncId_key" ON "SynchronizationUnit" USING btree ("driveId","syncId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SynchronizationUnit_id_key" ON "SynchronizationUnit" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Operation_driveId_documentId_scope_branch_index_key" ON "Operation" USING btree ("driveId","documentId","scope","branch","index" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Document_driveId_idx" ON "Document" USING btree ("driveId");
*/