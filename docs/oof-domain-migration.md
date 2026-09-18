# OOF domain namespace (production)

Canonical hosts:

- Company: `https://dvadtech.in` (`www.dvadtech.in` → apex)
- Product marketing: `https://dvadtech.in/oof` (`oof.dvadtech.in` → `/oof`)
- PlatformAdmin: `https://dvadtech.in/oof/platform`
- Restaurant / tenant hub: `https://{slug}.oof.dvadtech.in`

Legacy `{slug}.dvadtech.in` stays accepted until printed QR codes and bookmarks are retired. Do not redirect operational legacy hosts in the same change that introduces the OOF namespace.

## DNS

| Name | Type | Target |
| --- | --- | --- |
| `@` | A/AAAA | app host |
| `www` | CNAME or A | apex |
| `oof` | A/AAAA | app host |
| `*.oof` | A/AAAA | app host |
| `*` (legacy) | A/AAAA | app host (keep during transition) |

## TLS

Certificate SANs must include `dvadtech.in`, `www.dvadtech.in`, `oof.dvadtech.in`, `*.oof.dvadtech.in`, and (while legacy hosts remain) `*.dvadtech.in`. A `*.dvadtech.in` wildcard does **not** cover `*.oof.dvadtech.in`.

## Nginx

Use `scripts/deploy/nginx-wildcard-subdomain.conf`. Preserve the original `Host` header. Do not expose the Node port.

## Environment

```
TENANT_BASE_DOMAIN=dvadtech.in
OOF_BASE_DOMAIN=oof.dvadtech.in
APP_URL=https://dvadtech.in
```

If `OOF_BASE_DOMAIN` is unset, production derives `oof.${TENANT_BASE_DOMAIN}`. Cookies remain host-only — never set `Domain=.dvadtech.in`.

## Migration order

1. Deploy application code that accepts **both** legacy and canonical hosts.
2. Add DNS, TLS, and Nginx for `oof` / `*.oof` (keep `*.dvadtech.in`).
3. Verify `https://{slug}.oof.dvadtech.in` and `https://dvadtech.in/oof`.
4. New QR codes and Platform hostname previews use canonical OOF hosts.
5. Keep legacy hosts until existing printed QRs, staff bookmarks, and host-only cookies are intentionally retired.
