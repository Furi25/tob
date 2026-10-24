import { execSync } from "node:child_process";

/** Applies migrations to the disposable test database before the app server is exercised. */
export default function globalSetup(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error("Refusing to migrate: DATABASE_URL must point at a test database (name containing 'test').");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
