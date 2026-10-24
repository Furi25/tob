import "server-only";
import { prisma } from "@/lib/prisma";

export type DisplayBook = { slot: number; slug: string; title: string; author: string };
export type DisplayData = { books: DisplayBook[] };

/** Books placed in the bookshop scene, sorted by slot. Only the fields the landing page needs. */
export async function getDisplayBooks(): Promise<DisplayData> {
  const rows = await prisma.book.findMany({
    where: { displaySlot: { not: null } },
    orderBy: { displaySlot: "asc" },
    select: { displaySlot: true, slug: true, title: true, author: true },
  });
  return {
    books: rows.flatMap((r) =>
      r.displaySlot === null ? [] : [{ slot: r.displaySlot, slug: r.slug, title: r.title, author: r.author }],
    ),
  };
}
