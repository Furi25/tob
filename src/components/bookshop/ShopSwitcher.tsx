import { SCENES, sceneHref, type Scene } from "./scenes";
import styles from "./switcher.module.css";

/**
 * Links between the shops. Plain links, so it works without JS. Rendered only when there is more than one scene.
 * It scrolls sideways inside its own region instead of wrapping, so the toolbar never grows.
 */
export function ShopSwitcher({ current }: { current: Scene }) {
  if (SCENES.length < 2) return null;
  return (
    <nav aria-label="Shops" className={styles.switcher}>
      <ul className={styles.list}>
        {SCENES.map((scene) => (
          <li key={scene.id}>
            <a
              href={sceneHref(scene)}
              className={styles.link}
              aria-current={scene.id === current.id ? "page" : undefined}
            >
              {scene.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
