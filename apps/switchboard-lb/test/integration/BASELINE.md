# M0 baseline — nginx-alone overhead

Measured by `./test/integration/baseline.sh` (k6, 10 VUs, 10s, `GET /health`
served locally by the LB with no upstream). This is the "before any Lua enters
the path" reference; regressions in later milestones are evaluated against it.

## Initial measurement

Host: Apple Silicon (aarch64), Docker Desktop, `openresty/openresty:1.27.1.1-alpine`.

| metric                   | value   |
| ------------------------ | ------- |
| requests/sec             | ~91,000 |
| http_req_duration median | ~84µs   |
| http_req_duration p90    | ~148µs  |
| http_req_duration p95    | ~172µs  |
| http_req_duration max    | ~7.4ms  |
| http_req_failed          | 0.00%   |

Re-run after any change that touches `conf/` or introduces Lua; capture the
same five rows and compare.
