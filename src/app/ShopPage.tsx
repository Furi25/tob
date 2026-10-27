import { z } from "zod";
import { BookshopScene } from "@/components/bookshop/BookshopScene";
import { DisplayDrawer } from "@/components/bookshop/DisplayDrawer";
import type { Scene } from "@/components/bookshop/scenes";
import { ShopSwitcher } from "@/components/bookshop/ShopSwitcher";
import { getDisplayBooks } from "@/server/display";
import styles from "./page.module.css";

const overlayParam = z.enum(["1"]).optional();

type ShopPageProps = {
  scene: Scene;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The page of one scene, shared by `/` and `/shops/[scene]`: toolbar, scene and the empty state. */
export async function ShopPage({ scene, searchParams }: ShopPageProps) {
  const [{ books }, params] = await Promise.all([getDisplayBooks(scene.id), searchParams]);
  const overlay = overlayParam.safeParse(params.hotspots);
  const showOverlay = process.env.NODE_ENV !== "production" && overlay.success && overlay.data === "1";

  return (
    <main className={styles.main}>
      <div className={styles.toolbar}>
        <ShopSwitcher current={scene} />
        {books.length > 0 ? <DisplayDrawer books={books} /> : null}
      </div>
      <BookshopScene key={scene.id} scene={scene} books={books} showOverlay={showOverlay} />
      {books.length === 0 ? <p className={styles.empty}>The display is being rearranged. Check back soon.</p> : null}
    </main>
  );
}
