# 测试规范

[English](en/TESTING.md) · [首页](../README.md)

运行 `npm test`，并对修改过的 JavaScript 文件运行 `node --check`。认证或刷新行为变更需要覆盖缓存复用、刷新、登录回退及凭据不丢失；CLI/API 变更需要覆盖参数拒绝、输出遮蔽和迁移路径。测试使用模拟传输与临时状态目录，不访问真实 Pixiv 账号。

不要把真实 access token、refresh token、Cookie 或密码写入日志、断言输出或测试夹具。未经明确授权，不运行真实账号登录测试。只报告实际执行过的检查结果。
