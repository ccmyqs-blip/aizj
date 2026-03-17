import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("[prisma-run] 用法: tsx scripts/prisma-run.ts <prisma args>");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  shell: true,
  env: process.env
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
