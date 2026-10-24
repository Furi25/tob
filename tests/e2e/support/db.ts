// Test-only helpers for putting the Book table into a known state from Playwright.
// Every write is guarded so it can never touch a non-test database.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export type DisplayRow = { slot: number; slug: string; title: string; author: string };
type SlotSnapshot = Array<{ id: string; displaySlot: number | null }>;

export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      "Refusing to modify the database: DATABASE_URL must point at a disposable test database (name containing 'test').",
    );
  }
}

export function reseed(): void {
  assertTestDatabase();
  execSync("npx prisma db seed", { cwd: process.cwd(), stdio: "pipe", timeout: 120_000 });
}

/** Books currently on display, in slot order, read straight from the database. */
export async function displayedBooks(): Promise<DisplayRow[]> {
  const rows = await prisma.book.findMany({
    where: { displaySlot: { not: null } },
    orderBy: { displaySlot: "asc" },
    select: { displaySlot: true, slug: true, title: true, author: true },
  });
  return rows.flatMap((r) =>
    r.displaySlot === null ? [] : [{ slot: r.displaySlot, slug: r.slug, title: r.title, author: r.author }],
  );
}

export async function snapshotSlots(): Promise<SlotSnapshot> {
  return prisma.book.findMany({ select: { id: true, displaySlot: true } });
}

export async function restoreSlots(snapshot: SlotSnapshot): Promise<void> {
  assertTestDatabase();
  await prisma.$transaction([
    prisma.book.updateMany({ data: { displaySlot: null } }),
    ...snapshot.map((s) => prisma.book.update({ where: { id: s.id }, data: { displaySlot: s.displaySlot } })),
  ]);
}

export async function clearSlots(slots: number[] | "all"): Promise<void> {
  assertTestDatabase();
  await prisma.book.updateMany({
    where: slots === "all" ? {} : { displaySlot: { in: slots } },
    data: { displaySlot: null },
  });
}
