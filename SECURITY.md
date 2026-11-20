# Security · 安全说明

Report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/boomkalakasha/codex-model-radar-plugin/security/advisories/new).
Do not post credentials, exploit payloads against real users or private
runtime data in a public issue. No response-time commitment is made.

The current release line is 1.0.x. Include the version and a minimal,
synthetic reproduction when reporting a problem.

The worker listens only on IPv4 loopback, checks Host/Origin and requires a
random local bearer token. This protects the local HTTP interface from
unauthorized web requests; it does not isolate it from other software running
as the same operating-system user. The UI uses MCP tools and bundles assets.
The installer invokes the native Codex CLI and stores private profile-specific
bindings only in its installed cache.

运行数据和安装备份含本机路径，`runtime.json` 还含通信令牌，均不得公开。
只向原站执行公开只读请求；网站结构改变时保留旧缓存。安装不创建系统服务，
也不提供对恶意同用户进程的隔离保证。
