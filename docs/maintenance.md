# 维护与发布 / Maintenance and release

Run `npm ci`, `npm run build`, `npm test`. Check installation from the final
prebuilt ZIP in a separate Codex home, source links, model preferences and
the rendered README in both languages. The installer binds local executable
paths privately; builds must not write personal paths into tracked files.

After review, commit the source. From a clean fixed Git commit, run:

```powershell
npm run release:package
```

Packaging requires Python 3 on the maintainer's PATH in addition to Node.
The ZIP includes tracked source from that commit and the generated bundles,
dependency notices and manifest. `SHA256SUMS.txt` binds the final ZIP.
End users installing the ZIP do not need Python or npm dependencies.

Before creating a public repository, pushing a new commit/tag or uploading a
release, review the exact source, reachable history, metadata, PNG/SVG assets
and archive members. Run Gitleaks with default rules and REUSE; investigate
unreadable/binary objects rather than treating a regex scan as proof.
Keep private review records outside the public repository. Do not republish
site HTML, credentials, runtime/configuration backups or personal test records.

Publish an immutable SemVer tag from the audited default-branch commit, then
upload the ZIP and checksum file. Use the reviewed release notes. Confirm
the actual public README rendering, CI/CodeQL results and an unauthenticated
asset download. Repository files do not establish remote protection settings;
check those settings separately. Later changes use focused reviewed PRs.

首版私人环境已完成构建、定时与错误恢复、MCP 沙箱交互和独立安装/卸载验证；
原生渲染截图由所有者提供。不要据此推断其他 Codex 版本、其他操作系统或未来
来源网页结构已通过测试。首次上手与发布证据在维护者的私有任务记录中保留。
