CREATE TABLE IF NOT EXISTS "Challenge" (
	"nonce" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"signature" text,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"createdBy" text NOT NULL,
	"referenceExpiryDate" timestamp(3),
	"name" text,
	"revokedAt" timestamp(3),
	"referenceTokenId" text NOT NULL,
	"isUserCreated" boolean DEFAULT false NOT NULL,
	"allowedOrigins" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "User" (
	"address" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "searchTable" (
	"driveId" text NOT NULL,
	"documentId" text NOT NULL,
	"objectId" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "searchTable_driveId_documentId_objectId_pk" PRIMARY KEY("driveId","documentId","objectId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Session" ADD CONSTRAINT "Session_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("address") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Challenge_message_key" ON "Challenge" USING btree ("message");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Session_createdBy_id_key" ON "Session" USING btree ("createdBy","id");