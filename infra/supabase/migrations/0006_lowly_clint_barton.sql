CREATE TABLE IF NOT EXISTS "kg_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kg_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"src_id" uuid NOT NULL,
	"dst_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"confidence" real DEFAULT 0.7 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"source_chunk" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kg_entities" ADD CONSTRAINT "kg_entities_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kg_relations" ADD CONSTRAINT "kg_relations_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kg_relations" ADD CONSTRAINT "kg_relations_src_id_kg_entities_id_fk" FOREIGN KEY ("src_id") REFERENCES "public"."kg_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kg_relations" ADD CONSTRAINT "kg_relations_dst_id_kg_entities_id_fk" FOREIGN KEY ("dst_id") REFERENCES "public"."kg_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kg_relations" ADD CONSTRAINT "kg_relations_source_chunk_chunks_id_fk" FOREIGN KEY ("source_chunk") REFERENCES "public"."chunks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kg_entities_creator_name_kind_uq" ON "kg_entities" USING btree ("creator_id","name","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kg_relations_triple_uq" ON "kg_relations" USING btree ("src_id","dst_id","relation","source_chunk");