-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
