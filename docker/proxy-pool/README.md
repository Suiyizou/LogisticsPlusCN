# COSCO proxy pool

This directory contains only the non-secret Mihomo routing policy. Never copy an airport
subscription or provider file into Git.

The private provider must be a Mihomo/Clash proxy-provider YAML file with a top-level
`proxies:` list. At deployment time, set `PROXY_PROVIDER_FILE` to its absolute host path and
start Compose with both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy-pool.yml up -d --build
```

`TRACKING-POOL` admits Hong Kong, Taiwan, Japan, Korea, Singapore, and US nodes while excluding
free/download-only entries. The tracking service orders Hong Kong first and asks Mihomo to move
to the next eligible node after a COSCO 403/429 or proxy transport failure. Rejected nodes remain
in an application-side cooldown before they can be selected again.
