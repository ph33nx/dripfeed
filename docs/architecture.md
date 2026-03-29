---
title: Architecture & Build
description: Technical architecture, build tooling, and package structure decisions
category: technical
---

# Architecture & Build

## Build Tooling

### tsdown (replaces tsup)

tsup is officially deprecated as of 2026. tsdown is the successor, powered by Rolldown (Rust).

```bash
bun add -d tsdown typescript @biomejs/biome vitest
```

**tsdown config:**
```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});
```

**Why tsdown over alternatives:**
- tsup is deprecated, points users to tsdown
- Rolldown engine (Rust) — fastest bundler available
- Auto-generates dual ESM/CJS + `.d.ts` + `.d.cts`
- Built-in `publint` and `attw` validation
- Migration path from tsup: `npx tsdown-migrate`

**Why not bun build:** No `.d.ts` generation — dealbreaker for TypeScript packages on npm.

### Package.json exports

```jsonc
{
  "name": "dripfeed",
  "version": "0.1.0",
  "type": "module",
  "description": "SQLite-native API soak testing. Drip, not firehose.",

  "bin": {
    "dripfeed": "./dist/cli.mjs"
  },

  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",

  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./reporters": {
      "import": {
        "types": "./dist/reporters.d.mts",
        "default": "./dist/reporters.mjs"
      },
      "require": {
        "types": "./dist/reporters.d.cts",
        "default": "./dist/reporters.cjs"
      }
    },
    "./package.json": "./package.json"
  },

  "files": ["dist", "AGENTS.md", "docs/llms-full.txt"],

  "engines": {
    "node": ">=20"
  }
}
```

**Rules:**
- `"types"` MUST come before `"default"` inside each condition (TypeScript requires this order)
- Always include `"./package.json": "./package.json"` (bundlers need it)
- Use explicit `.mjs`/`.cjs` extensions
- Separate `.d.mts` and `.d.cts` for each format

---

## CLI Framework: citty

Zero dependencies. Uses Node.js native `util.parseArgs`. Lazy sub-command loading.

```typescript
import { defineCommand, runMain } from 'citty';

const run = defineCommand({
  meta: { name: 'run', description: 'Start soak test' },
  args: {
    config: { type: 'string', alias: 'c', description: 'Config file path' },
    duration: { type: 'string', alias: 'd', description: 'Run duration (e.g., 10m, 2h)' },
    interval: { type: 'string', alias: 'i', description: 'Override interval' },
    report: { type: 'string', alias: 'r', description: 'Report format' },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress live output' },
  },
  run({ args }) {
    // ...
  },
});

const main = defineCommand({
  meta: { name: 'dripfeed', version: '0.1.0' },
  subCommands: { run, report, export: exportCmd, init },
});

runMain(main);
```

**Why citty:**
- Zero deps, uses native `util.parseArgs`
- Built-in TypeScript inference on parsed args
- Lazy sub-command loading (only imports the command being executed)
- Auto-generated help and version
- Used by Nuxt, Nitro (unjs ecosystem — proven at scale)

---

## Config Loading: c12

Automatic config discovery from multiple file formats and locations.

```typescript
import { loadConfig } from 'c12';

const { config } = await loadConfig({
  name: 'dripfeed',
  defaults: {
    interval: '3s',
    timeout: '30s',
    storage: 'sqlite',
    db: 'dripfeed-results.db',
    rotation: 'weighted-random',
  },
});
```

**Auto-discovers:**
- `dripfeed.config.{ts,js,mjs,cjs,json,yaml,toml}`
- `.dripfeedrc` / `.dripfeedrc.{json,yaml,yml,js,ts}`
- `.config/dripfeed.{ts,js,...}`
- `"dripfeed"` key in `package.json`

**Why c12:** Supports TypeScript configs natively (via jiti), deep merging, env-specific overrides, package.json key — used by Nuxt, Prisma, Trigger.dev.

---

## Runtime Compatibility

Works on npm, pnpm, yarn, and bun. No special treatment needed.

| Runtime | Version | SQLite Adapter | Notes |
|---------|---------|----------------|-------|
| Node.js | >= 20 | `better-sqlite3` (optional peer dep) | Most users |
| Bun | >= 1.0 | `bun:sqlite` (built-in, auto-detected) | Best experience, zero deps |
| Deno | >= 1.38 | JSON fallback | Lower priority |

**Runtime detection:**
```typescript
const isBun = typeof globalThis.Bun !== 'undefined';
const isDeno = typeof globalThis.Deno !== 'undefined';
```

When Bun is detected, use `bun:sqlite` directly. When Node, check if `better-sqlite3` is installed. Fall back to JSON file storage if neither is available.

**Gotchas to avoid:**
- No `postinstall` scripts (pnpm/yarn can skip them)
- No `node:` protocol stripping needed (Node 20+ supports it)
- Ship compiled JS, never require Bun as a runtime
- Declare every import in `dependencies` or `peerDependencies` (pnpm strict mode)

---

## Dependency Budget

**Runtime dependencies (target: 3-5 total):**
| Dep | Purpose | Size | Alternatives considered |
|-----|---------|------|------------------------|
| `citty` | CLI framework | ~2.5KB | commander (10KB), yargs (30KB) |
| `c12` | Config loading | ~15KB (with jiti) | cosmiconfig, custom loader |
| `zod` | Config validation | ~14KB | none (too useful) |

**Optional peer dependencies:**
| Dep | Purpose | When |
|-----|---------|------|
| `better-sqlite3` | SQLite on Node.js | Only if storage=sqlite on Node |

**Dev dependencies:**
| Dep | Purpose |
|-----|---------|
| `tsdown` | Build (dual ESM/CJS + dts) |
| `typescript` | Type checking |
| `vitest` | Testing |
| `@biomejs/biome` | Lint + format |
| `lefthook` | Git hooks |

---

## Directory Structure

```
dripfeed/
  CLAUDE.md              # Maintainer instructions (not published)
  AGENTS.md              # AI agent guide (published in npm package)
  package.json
  tsdown.config.ts
  tsconfig.json
  tsconfig.build.json
  biome.json
  lefthook.yml
  vitest.config.ts
  LICENSE                # MIT
  README.md

  src/
    index.ts             # Public library API (barrel export)
    cli.ts               # CLI entry point (bin target)
    core/
      runner.ts          # Main loop: schedule, fetch, record
      config.ts          # Config schema (Zod) + c12 loader
      types.ts           # Shared TypeScript types
    adapters/
      storage/
        interface.ts     # StorageAdapter interface
        sqlite.ts        # better-sqlite3 / bun:sqlite (runtime-detected)
        json.ts          # JSON file fallback
        memory.ts        # In-memory (programmatic use)
      reporters/
        interface.ts     # Reporter interface
        console.ts       # Live TTY output
        json.ts          # JSON summary
        html.ts          # Self-contained HTML report
        markdown.ts      # Markdown summary
    utils/
      http.ts            # fetch wrapper with timing
      stats.ts           # Percentile calculations
      runtime.ts         # Runtime detection
      duration.ts        # Parse "3s", "10m", "2h" strings

  tests/
    runner.test.ts
    config.test.ts
    stats.test.ts
    storage/
      sqlite.test.ts
      json.test.ts
    reporters/
      console.test.ts
      json.test.ts

  docs/
    features.md          # Feature specification
    architecture.md      # This file
    business-model.md    # OSS + cloud strategy
    best-practices.md    # Soak testing best practices
    llms-full.txt        # AI agent reference (shipped in package)

  scripts/
    build.ts             # Custom build steps if needed
```

---

## AGENTS.md (shipped in package)

Included in `files` array. Enables any AI coding agent to understand and use dripfeed.

Content should cover:
1. What dripfeed does (one paragraph)
2. Install and basic usage
3. Config file format
4. Library API with examples
5. CLI commands
6. Common tasks (CI integration, scheduled runs, querying results)
7. Gotchas (runtime detection, optional deps, SQLite availability)
