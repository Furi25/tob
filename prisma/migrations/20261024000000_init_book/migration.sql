-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "whyPopular" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "affiliateUrl" TEXT NOT NULL,
    "coverImage" TEXT,
    "palette" JSONB,
    "popularityRank" INTEGER NOT NULL,
    "displaySlot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Book_slug_key" ON "Book"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Book_popularityRank_key" ON "Book"("popularityRank");

-- CreateIndex
CREATE UNIQUE INDEX "Book_displaySlot_key" ON "Book"("displaySlot");

-- The bookshop scene has exactly 25 slots (docs/specs/bookshop-display.md). Prisma cannot express this range.
ALTER TABLE "Book" ADD CONSTRAINT "Book_displaySlot_range" CHECK ("displaySlot" BETWEEN 1 AND 25);
