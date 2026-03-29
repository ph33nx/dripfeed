---
title: Feature Specification
description: Complete feature set for dripfeed — the SQLite-native API soak testing tool
category: specification
---

# Feature Specification

## What dripfeed IS

A lightweight, zero-infrastructure CLI and library for continuous API soak testing. It hits your endpoints at human-readable intervals, logs every response to SQLite, and tells you what broke.

**Not a load testing tool.** Not a firehose. A slow IV drip.

## What dripfeed is NOT

- Not k6 / artillery / vegeta (throughput-focused load generators)
- Not Uptime Kuma / Better Stack (uptime ping monitors — no POST bodies, no error logging)
- Not Datadog / Grafana (full observability stacks requiring infrastructure)

---

## Core Features (MVP)

### 1. Config-driven endpoint rotation

YAML, JSON, or TypeScript config file defining endpoints to test.

```yaml
# dripfeed.config.yaml
interval: 3s
timeout: 30s
storage: sqlite          # sqlite | json | memory

endpoints:
  - name: user-profile
    url: https://api.example.com/v1/users/me
    method: GET
    headers:
      Authorization: Bearer ${API_TOKEN}
    weight: 2             # 2x more likely to be picked

  - name: create-order
    url: https://api.example.com/v1/orders
    method: POST
    headers:
      Authorization: Bearer ${API_TOKEN}
      Content-Type: application/json
    body:
      product_id: "sku-123"
      quantity: 1
    weight: 1
```

**Config discovery** (via c12):
- `dripfeed.config.{ts,js,mjs,cjs,json,yaml,toml}`
- `.dripfeedrc` / `.dripfeedrc.{json,yaml,yml}`
- `.config/dripfeed.{ts,js,...}`
- `"dripfeed"` key in `package.json`

### 2. SQLite-first storage

Every request logged to a local SQLite database. WAL mode for crash safety.

```sql
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER,              -- null on network error
  duration_ms INTEGER NOT NULL,
  response_body TEXT,          -- captured on non-2xx only
  error TEXT,                  -- network/timeout error message
  request_id TEXT              -- optional correlation ID
);
```

**Runtime-detected adapters:**
| Runtime | Adapter | Dependencies |
|---------|---------|-------------|
| Bun | `bun:sqlite` (built-in) | Zero |
| Node.js | `better-sqlite3` (optional peer dep) | 1 optional |
| Any | JSON file fallback | Zero |
| Programmatic | In-memory | Zero |

### 3. Live console output

Color-coded, compact, real-time:

```
dripfeed v1.0.0 — https://api.example.com — every 3s
Results: dripfeed-results.db | Ctrl+C to stop

✓ #1    user-profile          200   142ms | ok:1 fail:0 (100.0%)
✓ #2    create-order          201   387ms | ok:2 fail:0 (100.0%)
✗ #3    user-profile          500   891ms | ok:2 fail:1 (66.7%) | Internal Server Error
✓ #4    create-order          201   245ms | ok:3 fail:1 (75.0%)
```

### 4. Graceful shutdown with summary

Ctrl+C (SIGINT) or SIGTERM prints aggregate stats:

```
── Summary ─────────────────────────────────────────
   Duration: 2h 14m 38s
   Total: 2,692 | OK: 2,688 | Failed: 4
   Uptime: 99.85%

┌──────────────┬───────┬────────┬────────┬────────┬────────┐
│ Endpoint     │  Reqs │ Avg ms │ p95 ms │ p99 ms │ Max ms │
├──────────────┼───────┼────────┼────────┼────────┼────────┤
│ user-profile │ 1,795 │    138 │    312 │    891 │  1,204 │
│ create-order │   897 │    241 │    487 │    612 │    783 │
└──────────────┴───────┴────────┴────────┴────────┴────────┘

4 errors:
  500 user-profile (3x) — Internal Server Error
  TIMEOUT create-order (1x) — Request timed out after 30000ms
```

### 5. Duration flag for CI

```bash
# Run for 10 minutes, then exit with code 0 (pass) or 1 (fail)
npx dripfeed run --duration 10m --config dripfeed.config.yaml
```

### 6. Threshold assertions

Fail with exit code 1 if thresholds are breached. Essential for CI/CD.

```yaml
thresholds:
  error_rate: "< 1%"           # Fail if error rate exceeds 1%
  p95: "< 500ms"               # Fail if p95 latency exceeds 500ms
  p99: "< 2000ms"              # Fail if p99 exceeds 2 seconds
```

---

## Report Outputs

### JSON summary (must-have)

Machine-readable. Pipe to jq, parse in CI, feed into dashboards.

```bash
npx dripfeed run --duration 10m --report json > results.json
```

```json
{
  "duration_s": 600,
  "total_requests": 200,
  "success_count": 198,
  "failure_count": 2,
  "uptime_pct": 99.0,
  "latency": {
    "min": 89,
    "avg": 201,
    "p50": 178,
    "p95": 412,
    "p99": 891,
    "max": 1204
  },
  "status_codes": { "200": 180, "201": 18, "500": 2 },
  "endpoints": [
    {
      "name": "user-profile",
      "requests": 134,
      "avg_ms": 162,
      "p95_ms": 312,
      "error_count": 2
    }
  ],
  "errors": [
    { "endpoint": "user-profile", "status": 500, "count": 2, "sample_body": "Internal Server Error" }
  ],
  "thresholds": {
    "error_rate": { "target": "< 1%", "actual": "1.0%", "passed": false },
    "p95": { "target": "< 500ms", "actual": "412ms", "passed": true }
  }
}
```

### Markdown summary (must-have)

Paste into GitHub issues, PRs, Slack. Generated on shutdown or with `--report markdown`.

### HTML report (should-have)

Self-contained single HTML file with embedded charts (no external CDN dependencies). Inspired by k6 web dashboard.

Charts:
1. **Latency over time** — p50, p95, p99 as lines
2. **Error rate over time** — percentage per time bucket
3. **Status code distribution** — stacked area
4. **Throughput** — successful requests per time bucket

```bash
npx dripfeed run --duration 2h --report html --output report.html
```

The HTML file should be printable to PDF from any browser (no separate PDF generation needed).

### CSV export (nice-to-have)

Per-request data for pandas, Excel, Tableau analysis.

```bash
npx dripfeed export csv --db dripfeed-results.db --output results.csv
```

---

## CLI Interface

```
Usage: dripfeed <command> [options]

Commands:
  run           Start soak test
  report        Generate report from existing SQLite database
  export        Export raw data (csv, json)
  init          Generate a starter config file
  version       Show version

Options (run):
  --config, -c     Config file path (auto-discovered if omitted)
  --duration, -d   Run duration (e.g., 10m, 2h, 24h). Omit for indefinite
  --interval, -i   Override config interval (e.g., 3s, 5s, 1m)
  --output, -o     Output file path for reports
  --report, -r     Report format: console (default), json, markdown, html
  --db             SQLite database path (default: dripfeed-results.db)
  --quiet, -q      Suppress live console output (useful in CI)
  --verbose, -v    Show response bodies for all requests (not just errors)
  --no-color       Disable colored output
  --bail           Stop on first error
```

---

## Configurable Parameters

### Request-level

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | Full URL to request |
| `method` | string | `GET` | HTTP method |
| `headers` | object | `{}` | Request headers. Supports `${ENV_VAR}` interpolation |
| `body` | object/string | none | JSON body (object) or raw string |
| `timeout` | string | global timeout | Per-endpoint timeout override |
| `weight` | number | `1` | Relative selection probability |
| `name` | string | URL path | Human-readable label |
| `assertions` | object | none | Per-endpoint response validation (status, body contains, JSON path) |

### Global

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | string | `3s` | Time between requests. Supports: `500ms`, `1s`, `3s`, `5s`, `30s`, `1m` |
| `timeout` | string | `30s` | Default request timeout |
| `storage` | string | `sqlite` | Storage adapter: `sqlite`, `json`, `memory` |
| `db` | string | `dripfeed-results.db` | SQLite database path |
| `rotation` | string | `weighted-random` | Endpoint selection: `weighted-random`, `round-robin`, `sequential` |
| `headers` | object | `{}` | Global headers applied to all requests |
| `thresholds` | object | none | Pass/fail criteria |
| `env` | string | none | `.env` file path for variable interpolation |
| `keepAlive` | boolean | `true` | Reuse TCP connections |
| `followRedirects` | boolean | `true` | Follow 3xx redirects |
| `insecure` | boolean | `false` | Skip TLS verification |

### Threshold syntax

```yaml
thresholds:
  error_rate: "< 1%"
  p50: "< 200ms"
  p95: "< 500ms"
  p99: "< 2000ms"
  max: "< 5000ms"
  min_uptime: "> 99.5%"
```

---

## Library API (Programmatic Use)

Importable in Express, Hono, Next.js, background jobs, schedulers.

```typescript
import { createSoakTest, SqliteStorage, ConsoleReporter } from 'dripfeed';

const test = createSoakTest({
  interval: '3s',
  endpoints: [
    {
      name: 'health',
      url: 'https://api.example.com/health',
      method: 'GET',
    },
  ],
  storage: new SqliteStorage('results.db'),
  reporters: [new ConsoleReporter()],
  thresholds: {
    error_rate: '< 1%',
    p95: '< 500ms',
  },
});

// Start
await test.start();

// Stop programmatically
const stats = await test.stop();
console.log(stats.uptime_pct);

// Or run for a fixed duration
const stats = await test.run({ duration: '10m' });
```

### Integration patterns

**Express/Hono middleware — health check endpoint:**
```typescript
import { querySoakStats } from 'dripfeed';

app.get('/internal/soak-status', (req, res) => {
  const stats = querySoakStats('dripfeed-results.db', { last: '1h' });
  res.json(stats);
});
```

**Background job (BullMQ, Inngest, Trigger.dev):**
```typescript
import { createSoakTest } from 'dripfeed';

// Run a 10-minute soak test as a scheduled job
export const soakJob = inngest.createFunction(
  { id: 'nightly-soak' },
  { cron: '0 2 * * *' },
  async () => {
    const test = createSoakTest({ /* config */ });
    return await test.run({ duration: '10m' });
  },
);
```

**CI/CD — GitHub Actions:**
```yaml
- name: Soak test staging
  run: npx dripfeed run -c soak.config.yaml -d 10m --report json -o results.json
- name: Upload results
  uses: actions/upload-artifact@v4
  with:
    name: soak-results
    path: results.json
```

---

## Metrics Collected

### Per-request (stored in SQLite)

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 | When the request was sent |
| `endpoint` | string | Endpoint name from config |
| `method` | string | HTTP method |
| `url` | string | Full URL |
| `status` | int/null | HTTP status code. Null on network error |
| `duration_ms` | int | Total request time (DNS + connect + TLS + transfer) |
| `response_body` | text/null | Captured on non-2xx responses only |
| `error` | text/null | Error message on network/timeout failure |

### Aggregate (computed on shutdown / report generation)

| Metric | Description |
|--------|-------------|
| `total_requests` | Count of all requests sent |
| `success_count` | Count of 2xx responses |
| `failure_count` | Count of non-2xx + network errors |
| `uptime_pct` | `success_count / total_requests * 100` |
| `p50`, `p95`, `p99`, `p99.9` | Latency percentiles |
| `min`, `avg`, `max` | Latency extremes |
| `status_codes` | `{code: count}` histogram |
| `errors` | Deduplicated error list with counts and sample bodies |
| `latency_trend` | Slope of p95 over time (detects degradation) |

### Latency trend detection

The defining signal of a soak test is not absolute latency but **latency slope over time**. dripfeed computes linear regression on p95 values across time windows. A positive slope indicates degradation.

```
Trend: p95 started at 142ms, ended at 387ms (+172% over 2h) ⚠️ DEGRADING
```

---

## Post-hoc Query Examples

After a soak test, the SQLite database is the primary artifact.

```bash
# How many 500s?
sqlite3 dripfeed-results.db "SELECT COUNT(*) FROM results WHERE status = 500"

# Worst endpoints by error rate
sqlite3 dripfeed-results.db "
  SELECT endpoint,
    COUNT(*) as total,
    SUM(CASE WHEN status >= 400 OR status IS NULL THEN 1 ELSE 0 END) as errors,
    ROUND(AVG(duration_ms)) as avg_ms
  FROM results
  GROUP BY endpoint
  ORDER BY errors DESC"

# Latency over time (1-minute buckets)
sqlite3 dripfeed-results.db "
  SELECT strftime('%H:%M', timestamp) as minute,
    ROUND(AVG(duration_ms)) as avg_ms,
    MAX(duration_ms) as max_ms
  FROM results
  GROUP BY minute
  ORDER BY minute"

# All error response bodies
sqlite3 dripfeed-results.db "
  SELECT timestamp, endpoint, status, response_body
  FROM results
  WHERE status >= 400 OR status IS NULL
  ORDER BY timestamp"
```

---

## Environment Variable Interpolation

Config values support `${VAR}` syntax, resolved from process environment or a `.env` file.

```yaml
env: .env.local

endpoints:
  - name: api
    url: ${API_BASE_URL}/health
    headers:
      Authorization: Bearer ${API_TOKEN}
```

---

## Future Features (Post-MVP)

### Alerting (v1.1)
- Webhook on threshold breach
- Slack notification on failure
- Email alert (via SMTP or webhook)

### Response validation (v1.1)
```yaml
endpoints:
  - name: user-profile
    url: https://api.example.com/v1/users/me
    assertions:
      status: 200
      body_contains: "email"
      json_path:
        $.data.active: true
```

### Ramp-up / ramp-down phases (v1.2)
```yaml
phases:
  - duration: 5m
    interval: 10s    # Warm up slowly
  - duration: 2h
    interval: 1s     # Sustained
  - duration: 5m
    interval: 10s    # Cool down
```

### Distributed execution (cloud only)
- Run from multiple geographic regions
- Aggregate results into single dashboard
- Detect region-specific issues

### Compare runs
```bash
npx dripfeed compare baseline.db current.db
```

Output: side-by-side latency, error rate, degradation detection.
