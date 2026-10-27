import "server-only";
import { prisma } from "@/lib/prisma";

export type DisplayBook = { slot: number; slug: string; title: string; author: string };
export type DisplayData = { books: DisplayBook[] };

/**
 * Books placed in one scene, sorted by slot. Only the fields a scene page needs.
 * The caller has already checked `sceneId` against the registry; an id with no placements gives an empty list.
 */
export async function getDisplayBooks(sceneId: string): Promise<DisplayData> {
  const rows = await prisma.placement.findMany({
    where: { sceneId },
    orderBy: { slot: "asc" },
    select: { slot: true, book: { select: { slug: true, title: true, author: true } } },
  });
  return {
    books: rows.map((r) => ({ slot: r.slot, slug: r.book.slug, title: r.book.title, author: r.book.author })),
  };
}
