-- Book.displaySlot (one scene, slots 1-25) becomes Placement (any number of scenes). docs/specs/multiple-bookshop-scenes.md.

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "bookId" TEXT NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Placement_sceneId_slot_key" ON "Placement"("sceneId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_sceneId_bookId_key" ON "Placement"("sceneId", "bookId");

-- CreateIndex
CREATE INDEX "Placement_bookId_idx" ON "Placement"("bookId");

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The upper bound of a slot is the number of hotspots in the scene, which lives in code. The database only knows the floor.
-- Prisma cannot express this range.
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_slot_min" CHECK ("slot" >= 1);

-- Keep today's layout: every placed book goes to the default scene, in the same slot.
INSERT INTO "Placement" ("id", "sceneId", "slot", "bookId")
SELECT gen_random_uuid()::text, 'bookshop', "displaySlot", "id"
FROM "Book"
WHERE "displaySlot" IS NOT NULL;

-- DropIndex
DROP INDEX "Book_displaySlot_key";

-- AlterTable (also drops the Book_displaySlot_range CHECK, which belongs to the column)
ALTER TABLE "Book" DROP COLUMN "displaySlot";
