// Test-only helpers for putting placements (Book ↔ scene slot) into a known state from Playwright.
// Written for docs/specs/multiple-bookshop-scenes.md. They use `prisma.placement`, never Book.displaySlot, so they
// keep working once that column is gone. The shared `prisma` client and the database guard come from ./db.
import { assertTestDatabase, prisma } from "./db";

export { assertTestDatabase, prisma, reseed } from "./db";

export type PlacedBook = { id: string; slot: number; slug: string; title: string; author: string };

/** Books placed in one scene, in slot order, read straight from the database. */
export async function placedBooks(sceneId: string): Promise<PlacedBook[]> {
  const rows = await prisma.placement.findMany({
    where: { sceneId },
    orderBy: { slot: "asc" },
    select: { slot: true, bookId: true },
  });
  const books = await prisma.book.findMany({
    where: { id: { in: rows.map((r) => r.bookId) } },
    select: { id: true, slug: true, title: true, author: true },
  });
  const byId = new Map(books.map((b) => [b.id, b]));
  return rows.map((r) => {
    const b = byId.get(r.bookId);
    if (!b) throw new Error(`placement ${sceneId}/${r.slot} points at a missing book`);
    return { id: b.id, slot: r.slot, slug: b.slug, title: b.title, author: b.author };
  });
}

/** Puts `bookId` into (sceneId, slot), replacing whoever was there. Callers restore the seed afterwards. */
export async function putPlacement(sceneId: string, slot: number, bookId: string): Promise<void> {
  assertTestDatabase();
  await prisma.$transaction([
    prisma.placement.deleteMany({ where: { sceneId, slot } }),
    prisma.placement.create({ data: { sceneId, slot, bookId } }),
  ]);
}

export async function removePlacements(sceneId: string): Promise<void> {
  assertTestDatabase();
  await prisma.placement.deleteMany({ where: { sceneId } });
}
