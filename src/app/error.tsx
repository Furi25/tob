"use client";

import styles from "./page.module.css";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.main}>
      <div className={styles.toolbar} />
      <p className={styles.empty} role="alert">
        The bookshop could not be opened just now.
      </p>
      <p className={styles.empty}>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </p>
    </main>
  );
}
