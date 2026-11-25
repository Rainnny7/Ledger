import { defineConfig } from "drizzle-kit"

/** drizzle-kit configuration: `bun run db:generate` writes SQL migrations into `./drizzle`. */
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema",
	out: "./drizzle",
})
