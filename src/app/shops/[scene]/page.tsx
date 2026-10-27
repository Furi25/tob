import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_SCENE_ID, getScene } from "@/components/bookshop/scenes";
import { ShopPage } from "../../ShopPage";

// The display changes whenever books are (re)assigned to slots, so render per request.
export const dynamic = "force-dynamic";

// A registry id, or nothing: anything else (including path-like values such as `../x`) is "not found" and
// runs no database query.
const sceneParam = z.string().refine((id) => getScene(id) !== undefined);

type ShopRouteProps = {
  params: Promise<{ scene: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ShopRoute({ params, searchParams }: ShopRouteProps) {
  const parsed = sceneParam.safeParse((await params).scene);
  const scene = parsed.success ? getScene(parsed.data) : undefined;
  if (!scene) notFound();
  // One URL per scene: the default scene lives at `/`.
  if (scene.id === DEFAULT_SCENE_ID) permanentRedirect("/");

  return <ShopPage scene={scene} searchParams={searchParams} />;
}
