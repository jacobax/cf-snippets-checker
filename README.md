# ⚡ Cloudflare Snippets 批量检测工具 (Worker)

> 自动检测您 Cloudflare 账户下，哪些域名已被灰度开放了 **Snippets** 功能。适用于拥有大量域名，不方便手动逐一查看的用户。

该工具以 Cloudflare Worker 形式运行，安全高效，无需外部服务器。

## ✨ 主要特性

* **多 Token 支持**：可同时检测多个 Cloudflare 账户下的域名状态。
* **自动分页**：完全支持账户下超过 50 个域名的自动检测。
* **高可读性**：以 HTML 表格形式展示结果，包括域名、所属账户、套餐类型和 Snippets 状态。
* **并发批处理**：自动限制 API 请求并发数，避免触发速率限制。

## 🚀 部署与运行

### 1. 获取 API Token (必需)

为了让 Worker 能够读取您的域名列表和 Snippets 状态，您需要创建一个 **API Token**。

1.  登录 Cloudflare Dashboard，进入 [API Token 页面](https://dash.cloudflare.com/profile/api-tokens)。
2.  点击 **创建 Token** -> **自定义 Token**。
3.  配置权限如下：

| 权限 (Permission) | 资源 (Resource) | 设置 (Setting) |
| :--- | :--- | :--- |
| **Zone** | **Zones** | **Read** |
| **Snippets** | **Zones** | **Read** |
| **Zone Resources** | **All zones** | **Include** |

> **提示：** 仅需 `Read` 权限，该工具不会对您的域名配置进行任何修改。

### 2. 部署 Worker

1.  在 Cloudflare Dashboard 中，进入 **Workers & Pages** 并创建一个新的 Worker。
2.  进入 Worker 编辑界面，将 [项目代码文件](/src/index.js) 中的所有代码粘贴进去，替换默认代码。
3.  点击 **保存并部署**。

### 3. 配置环境变量 (最重要)

Worker 运行需要您的 API Token 来进行身份验证。

1.  进入您的 Worker **设置 (Settings)** 页面。
2.  找到 **变量 (Variables)**，点击 **添加变量 (Add Variable)**。
3.  **变量名 (Variable name)**：`CF_API_TOKEN`
4.  **值 (Value)**：
    * **单个 Token：** 直接填入您的 API Token。
    * **多个 Token：** 使用英文逗号 `,` 分隔，例如：`Token1,Token2,Token3`。
5.  点击 **加密 (Encrypt)** 选项，确保 Token 安全存储，然后保存。

## 💻 使用方法

完成部署和配置后，直接访问您的 Worker URL（例如 `https://check-snippets.your-name.workers.dev`）即可。

脚本会自动运行检测并返回一个包含以下信息的 HTML 表格：

| 域名 | 所属账户 | Plan | Zone ID (后6位) | Snippets 状态 |
| :--- | :--- | :--- | :--- | :--- |
| example.com | Your Company | Free | ...xxxxxx | **✅ 已开通** / 未开通 |

## ⚠️ 注意事项

* **Worker 限制**：如果您的域名数量超过数百个，Worker 可能会因 I/O 时间过长而超时。建议分批处理或使用计算增强型 Worker。
* **Rate Limit**：该工具已加入批处理机制，但若短时间内频繁访问，仍可能触发 Cloudflare API 的速率限制。

---

## 📜 许可证

本项目基于 MIT License 开放。
