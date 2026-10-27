import { DEFAULT_SCENE } from "@/components/bookshop/scenes";
import { ShopPage } from "./ShopPage";

// The display changes whenever books are (re)assigned to slots, so render per request.
export const dynamic = "force-dynamic";

type HomeProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function Home({ searchParams }: HomeProps) {
  return <ShopPage scene={DEFAULT_SCENE} searchParams={searchParams} />;
}
