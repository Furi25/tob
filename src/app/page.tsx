import { z } from "zod";
import { BookshopScene } from "@/components/bookshop/BookshopScene";
import { DisplayDrawer } from "@/components/bookshop/DisplayDrawer";
import { getDisplayBooks } from "@/server/display";
import styles from "./page.module.css";

// The display changes whenever books are (re)assigned to slots, so render per request.
export const dynamic = "force-dynamic";

const overlayParam = z.enum(["1"]).optional();

type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: HomeProps) {
  const [{ books }, params] = await Promise.all([getDisplayBooks(), searchParams]);
  const overlay = overlayParam.safeParse(params.hotspots);
  const showOverlay = process.env.NODE_ENV !== "production" && overlay.success && overlay.data === "1";

  return (
    <main className={styles.main}>
      <div className={styles.toolbar}>{books.length > 0 ? <DisplayDrawer books={books} /> : null}</div>
      <BookshopScene books={books} showOverlay={showOverlay} />
      {books.length === 0 ? <p className={styles.empty}>The display is being rearranged. Check back soon.</p> : null}
    </main>
  );
}
