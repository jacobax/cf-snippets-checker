/**
 * Cloudflare Snippets Monitor
 * Features: Auto Pagination, Multi-Token, Batch Processing, Cron Trigger, Telegram Notification
 * Author: Gemini
 */

export default {
  // 1. HTTP 请求处理 (浏览器访问)
  async fetch(request, env, ctx) {
    // 执行检测逻辑
    const { allResults, logMessages } = await processAllTokens(env);

    // 生成 HTML 页面
    const html = generateHtml(allResults, logMessages);

    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  },

  // 2. Cron 定时任务处理
  async scheduled(event, env, ctx) {
    // 执行检测逻辑
    const { allResults } = await processAllTokens(env);

    // 筛选出已开通的域名
    const enabledDomains = allResults.filter(r => r.enabled);

    // 如果发现有已开通的域名，且配置了 TG 信息，则发送通知
    if (enabledDomains.length > 0 && env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      const msgPromise = sendTelegramNotification(env, enabledDomains);
      ctx.waitUntil(msgPromise); // 确保 Worker 在发送完成前不退出
    } else {
      console.log("无新开通域名或未配置 TG 通知，跳过推送。");
    }
  }
};

/**
 * 核心逻辑：遍历 Token 并检测所有域名
 */
async function processAllTokens(env) {
  const tokenString = env.CF_API_TOKEN;
  let allResults = [];
  let logMessages = [];

  if (!tokenString) {
    return { allResults: [], logMessages: ["请在 Worker 设置中配置 CF_API_TOKEN"] };
  }

  const tokens = tokenString.split(',').map(t => t.trim()).filter(t => t.length > 0);

  for (const token of tokens) {
    try {
      // A. 获取该 Token 下的所有 Zone
      const zones = await fetchAllZones(token);
      
      if (zones.length === 0) continue;

      // B. 分批检测 Snippets (并发控制 10)
      const BATCH_SIZE = 10;
      for (let i = 0; i < zones.length; i += BATCH_SIZE) {
        const batch = zones.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(zone => checkSnippets(zone, token)));
        allResults = allResults.concat(batchResults);
      }
    } catch (err) {
      logMessages.push(`Token 处理出错 (...${token.slice(-4)}): ${err.message}`);
    }
  }

  return { allResults, logMessages };
}

/**
 * 辅助：获取单个 Token 下的所有 Zone (递归分页)
 */
async function fetchAllZones(token) {
  let allZones = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    try {
      const resp = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=50&page=${page}`, {
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      });
      if (!resp.ok) break;
      const data = await resp.json();
      if (data.success) {
        allZones = allZones.concat(data.result);
        totalPages = data.result_info.total_pages;
        page++;
      } else {
        break;
      }
    } catch (e) { break; }
  }
  return allZones;
}

/**
 * 辅助：检测单个 Zone 的 Snippets 状态
 */
async function checkSnippets(zone, token) {
  const result = {
    name: zone.name,
    accountName: zone.account ? zone.account.name : '-',
    plan: zone.plan ? zone.plan.name : '-',
    zoneId: '...' + zone.id.slice(-6),
    enabled: false,
    msg: "Checking..."
  };

  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/snippets/rules`, {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });
    const data = await resp.json();
    if (data.success === true) {
      result.enabled = true;
      result.msg = "✅ 已开通";
    } else {
      result.enabled = false;
      result.msg = "未开通";
    }
  } catch (e) {
    result.msg = "⚠️ API 错误";
  }
  return result;
}

/**
 * 辅助：发送 Telegram 通知
 */
async function sendTelegramNotification(env, domains) {
  const token = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;

  // 构建消息内容
  let text = `🎉 *Snippet 功能已开通检测通知* 🎉\n\n发现以下域名已获得 Snippets 权限：\n`;
  
  domains.forEach(d => {
    text += `\n🌍 *${d.name}* \n👤 账号: \`${d.accountName}\`\n`;
  });
  
  text += `\n📅 时间: ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
  } catch (e) {
    console.error("Telegram 推送失败", e);
  }
}

/**
 * 辅助：生成 HTML 页面
 */
function generateHtml(results, logs) {
  // 简单的排序：已开通在前
  results.sort((a, b) => (b.enabled === a.enabled) ? 0 : (a.enabled ? -1 : 1));

  const rows = results.map(r => `
    <tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="py-3 px-6 text-sm font-medium text-gray-900">${r.name}</td>
      <td class="py-3 px-6 text-xs text-gray-500">${r.accountName}</td>
      <td class="py-3 px-6 text-xs text-gray-500">${r.plan}</td>
      <td class="py-3 px-6 text-sm">
        <span class="${r.enabled ? 'text-green-600 font-bold' : 'text-gray-400'}">${r.msg}</span>
      </td>
    </tr>
  `).join("");

  const errorHtml = logs.length > 0 
    ? `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 text-xs">${logs.join('<br>')}</div>` 
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CF Snippets Monitor</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 p-6 font-sans">
      <div class="max-w-5xl mx-auto bg-white shadow rounded-lg overflow-hidden">
        <div class="p-6 bg-gray-900 text-white flex justify-between items-center">
          <h1 class="text-xl font-bold">Cloudflare Snippets Monitor</h1>
          <div class="text-xs text-gray-400">检测了 ${results.length} 个域名</div>
        </div>
        ${errorHtml}
        <div class="overflow-x-auto">
          <table class="min-w-full text-left">
            <thead class="bg-gray-100 text-gray-600 text-xs uppercase">
              <tr>
                <th class="py-3 px-6">域名</th>
                <th class="py-3 px-6">账户</th>
                <th class="py-3 px-6">Plan</th>
                <th class="py-3 px-6">状态</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="p-4 bg-gray-50 text-xs text-center text-gray-400">
           ${results.filter(r => r.enabled).length} 个域名已开通 | Generated by CF Workers
        </div>
      </div>
    </body>
    </html>
  `;
}
