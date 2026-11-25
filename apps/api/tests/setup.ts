import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

/**
 * Preloaded by `bun test` (see bunfig.toml): points DATA_DIR at a scratch folder before any test
 * imports the server, so tests never open the real database in ./data.
 */
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "ledger-test-"))
