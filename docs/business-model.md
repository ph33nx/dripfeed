---
title: Business Model
description: OSS-to-cloud business model analysis and pricing strategy for dripfeed
category: strategy
---

# Business Model — Free OSS + Paid Cloud

## The Model

Free npm package (CLI + library) with optional paid cloud for scheduled runs, dashboards, alerting, and team collaboration. Identical to the k6 / k6 Cloud model.

## Competitive Landscape

| Company | Free Tier | Paid Cloud | Price Range |
|---------|-----------|------------|-------------|
| **k6** (Grafana) | Full CLI, local execution | Cloud execution, dashboards, trending | $19/mo + PAYG |
| **Checkly** | CLI + local tests | Scheduled monitoring, alerting | $24-64/mo |
| **Inngest** | SDK + local dev server | Managed orchestration, observability | $0-75/mo + usage |
| **Trigger.dev** | Full OSS platform | Managed infra, dashboards, alerts | $0-50/mo + compute |
| **Cronitor** | 5 monitors | More monitors, SMS, retention | $2/monitor/mo |
| **Better Stack** | 10 monitors | Faster checks, phone alerts, on-call | ~$269/mo bundle |
| **Uptime Kuma** | Everything (self-hosted) | None | Free forever |

## What's Free (npm package)

Everything needed for standalone use:
- CLI with all commands (`run`, `report`, `export`, `init`)
- Library API for programmatic integration
- SQLite, JSON, and in-memory storage
- Console, JSON, Markdown, and HTML reporters
- Threshold assertions with CI exit codes
- Config file discovery and env var interpolation
- Indefinite or time-boxed runs
- Post-hoc SQLite queries

## What's Paid (cloud)

Features that require infrastructure the user does not manage:

| Feature | Why users pay |
|---------|--------------|
| **Scheduled runs** | "Run this soak test every night at 2 AM" without a VM or cron job |
| **Dashboard** | Historical results, trend lines, regression detection across runs |
| **Alerting** | Slack, email, webhook, SMS when thresholds breach |
| **Data retention** | 30-90 days of results without managing SQLite files |
| **Team collaboration** | Shared dashboards, RBAC, SSO |
| **Multi-region execution** | Run from US, EU, APAC to detect regional issues |
| **Status pages** | Public or internal status page showing soak test health |
| **CI integration** | Auto-comment on PRs with soak test results |
| **Run comparison** | Baseline vs current with automated regression detection |

## Proposed Pricing Tiers

| | Free (npm) | Starter ($29/mo) | Team ($49/mo) | Pro ($99/mo) |
|---|---|---|---|---|
| Local CLI + library | Yes | Yes | Yes | Yes |
| Local reports (all formats) | Yes | Yes | Yes | Yes |
| Cloud scheduled runs | - | 5 | 20 | Unlimited |
| Dashboard | - | Basic | Full trending | Full + compare |
| Data retention | Local only | 30 days | 90 days | 1 year |
| Alerting | - | Email + Slack | + Webhook + PagerDuty | + SMS |
| Team members | - | 1 | 5 | 25+ |
| Status page | - | - | 1 basic | Branded + custom domain |
| Environments | - | 1 | 3 | Unlimited |
| Regions | - | 1 | 3 | All |
| CI integration | Exit codes only | Basic | PR comments | Full API |
| Support | GitHub issues | Email | Priority email | Dedicated Slack |

## Conversion Funnel

1. **Discovery** — Developer finds `dripfeed` via npm search, blog post, or GitHub. Runs `npx dripfeed init` and gets a working soak test in 2 minutes.

2. **Habit** — Developer adds soak test to CI. Runs on every merge. Catches a regression. Becomes a believer.

3. **Pain point** — Results disappear after CI runs. No historical trending. No alerting. Team lead asks "how do we know latency has not regressed over the past month?"

4. **Conversion** — `npx dripfeed login` adds a cloud API key. Same config, same CLI. Results stream to cloud dashboard. Zero code changes. 30-second upgrade path.

5. **Expansion** — Team members need access. Need status page for stakeholders. Want SMS alerts. Upgrade tiers.

## Key Insight

> The single biggest pattern across all seven companies: the free tool must be genuinely excellent standalone.

k6 has 29K stars. Uptime Kuma has 60K. The free tool builds community and reputation. The cloud converts 1-5% of active users who need scheduling, retention, collaboration, and alerting.

## Revenue Assumptions (Conservative)

| Metric | Year 1 | Year 2 |
|--------|--------|--------|
| npm weekly downloads | 500-2K | 5K-20K |
| GitHub stars | 500-2K | 3K-10K |
| Active CLI users (monthly) | 200-800 | 2K-8K |
| Cloud conversion rate | 2-3% | 3-5% |
| Paying customers | 4-24 | 60-400 |
| Average plan | $39/mo | $49/mo |
| MRR | $156-936 | $2,940-19,600 |

These are conservative estimates. The real value may be in positioning (brand authority, hiring signal, ecosystem leverage) rather than direct revenue in year 1.

## Build vs Buy for Cloud

**Phase 1 (MVP):** No cloud. Ship the npm package. Build community. Validate demand.

**Phase 2 (Cloud MVP):** Simple API that receives soak test results from CLI. Dashboard with basic trending. Use existing infra (Postgres, a simple web app). Alerting via webhooks.

**Phase 3 (Scale):** Scheduled execution on managed infrastructure. Multi-region. Status pages. The full product.

Do not build the cloud before the npm package has 1K+ weekly downloads and organic demand for it.

## Comparable Businesses

| Company | Founded | Stars | Revenue Signal |
|---------|---------|-------|---------------|
| Checkly | 2018 | 4K | Series A funded, profitable |
| Grafana (k6) | 2016 (acquired 2021) | 29K | Part of $1B+ Grafana |
| Better Stack | 2021 | N/A | $7.5M raised, profitable |
| Cronitor | 2015 | N/A | Bootstrapped, profitable |
| Trigger.dev | 2022 | 14K | $16M Series A |
| Inngest | 2021 | 5K | $17M Series A |

The space is validated. Multiple companies are profitable or well-funded doing variations of "free OSS tool + paid cloud execution/monitoring."
