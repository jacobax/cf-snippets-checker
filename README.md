# ⚡ Cloudflare Snippets 监控工具 (Worker)

> 自动检测您的 Cloudflare 账户下，哪些域名已被灰度开放了 **Snippets** 功能。支持多账号、Web 界面查看、Cron 定时检测及 Telegram 消息推送。

## ✨ 功能特性

* **多 Token 支持**：可同时检测多个 Cloudflare 账户/Team 下的域名。
* **Web 可视化**：提供简洁的 HTML 表格界面，一键查看所有域名状态。
* **自动分页**：完美支持超过 50 个域名的账户。
* **Cron 定时任务**：支持配置后台定时自动检测。
* **Telegram 推送**：当检测到有域名开通 Snippets 功能时，自动发送通知（静默模式：无新开通不打扰）。
* **防风控**：内置分批并发控制，防止触发 API 速率限制。

## 🚀 部署与配置

### 1. 准备 Cloudflare API Token

进入 [API Tokens 页面](https://dash.cloudflare.com/profile/api-tokens) 创建 Token，权限要求如下：

* **Zone** - **Zone** - **Read**
* **Zone** - **Snippets** - **Read**
* **Zone Resources** - **Include** - **All zones**

### 2. 部署 Worker

1.  在 Cloudflare Dashboard 创建一个新的 Worker。
2.  将 `worker.js` 中的代码复制粘贴到编辑器中。
3.  点击 **Deploy**。

### 3. 配置环境变量 (Settings -> Variables)

必须配置 `CF_API_TOKEN`，其余为可选配置。

| 变量名 | 必填 | 说明 |
| :--- | :--- | :--- |
| `CF_API_TOKEN` | ✅ | Cloudflare API Token。如需检测多个账号，用逗号 `,` 分隔。 |
| `TG_BOT_TOKEN` | ❌ | (可选) Telegram Bot Token，用于发送通知。 |
| `TG_CHAT_ID` | ❌ | (可选) 接收通知的 Telegram User ID 或 Chat ID。 |

> **如何获取 Telegram ID:** 搜索 Bot `@userinfobot` 点击 Start 即可获取您的 ID。

### 4. 设置 KV 空间（用于判断是否有新开通）
创建 worker KV 空间，名字随你意，添加 KEY “enabled_domains”，内容留空。worker中绑定 KV 变量名为 “KV”，选择刚创建的 KV 空间。

### 5. 设置定时任务 (Triggers)

如果您希望全自动运行检测：

1.  在 Worker 页面点击 **Triggers (触发器)** 选项卡。
2.  找到 **Cron Triggers** 部分，点击 **Add Cron Trigger**。
3.  设置执行频率，例如：
    * `0 8 * * *` (每天早上 8 点运行一次，推荐)
    * `0 */4 * * *` (每 4 小时运行一次)
4.  保存即可。Worker 将按计划在后台运行，一旦发现已开通 Snippets 的域名，且您配置了 TG 参数，您就会收到通知。

### 6. 手动触发验证（无kv更新无通知）
访问 worker 域名，查看开通情况。验证没问题后**务必disable worker域名，以免被扫频繁触发，消耗API**

## 📸 预览

**Web 界面：**

| 域名 | 账户 | Plan | 状态 |
| :--- | :--- | :--- | :--- |
| example.com | Personal | Free | **✅ 已开通** |
| demo.net | Team A | Pro | 未开通 |

**Telegram 通知：**

> 🎉 **Snippet 功能已开通检测通知** 🎉
>
> 发现以下域名已获得 Snippets 权限：
>
> 🌍 **example.com**
> 👤 账号: `My Account`
>
> 📅 时间: 2023/10/25 08:00:00

## ⚠️ 注意事项

* **Cron 执行时间**：Cron 触发不会产生 HTTP 响应，日志可在 Dashboard 的 Logs 中查看。
* **通知逻辑**：只有当检测结果中存在 `enabled: true` 的域名时，才会发送 Telegram 通知。

---

## 📜 License

MIT License
