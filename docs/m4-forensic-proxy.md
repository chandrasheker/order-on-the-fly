# M4 forensic IP trust boundary

TableTap records client IP addresses on `PlatformAuditEvent` for investigation.

The application does **not** treat arbitrary `X-Forwarded-For`, `X-Real-IP`, or `Forwarded` headers from internet clients as fact.

## Required production proxy behavior

Production is expected to sit behind Caddy or Nginx.

The reverse proxy MUST **overwrite** (not append) these headers with the actual remote client address before forwarding to Next.js:

- `X-Forwarded-For`
- `X-Real-IP`

Do not pass through client-supplied forwarding headers.

Do not change Host preservation. M0 hostname behavior remains authoritative: the proxy must continue to send the original `Host` (`abc.dvadtech.in`, `dvadtech.in`, …).

Then set:

```text
FORENSIC_TRUST_PROXY=1
```

When this flag is set, TableTap records the proxy-derived address as `clientIp` with `clientIpSource = trusted-proxy`.

When the flag is not set, TableTap stores:

```text
clientIp = null
clientIpSource = untrusted
```

rather than treating a spoofed header as the client address. Localhost development may record `127.0.0.1` / `::1` with `clientIpSource = local`.

## Caddy

```caddy
example.com {
  reverse_proxy 127.0.0.1:3000 {
    header_up Host {host}
    header_up X-Forwarded-For {remote_host}
    header_up X-Real-IP {remote_host}
  }
}
```

## Nginx

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
```

This is a documentation requirement only. It does not add a second reverse-proxy stack.
