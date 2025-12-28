/**
 * Cloudflare Snippets Monitor V3.0 (最终稳定版)
 * Features: Auto Pagination, Multi-Token, Cron Trigger, Telegram Notification
 */

export default {
  async fetch(request, env, ctx) {
    const { allResults, logMessages } = await processAllTokens(env);
    const html = generateHtml(allResults, logMessages);
    return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  },

  async scheduled(event, env, ctx) {
    const { allResults } = await processAllTokens(env);
    const enabled = allResults.filter(r => r.enabled);

    // 从 KV 加载之前已开通的域名列表
    const previousJson = await env.KV.get('enabled_domains');
    const previous = previousJson ? JSON.parse(previousJson) : [];
    const prevSet = new Set(previous);

    // 计算新增开通域名
    const newEnabled = enabled.filter(d => !prevSet.has(d.name));

    console.log(`Detected enabled domains: ${enabled.length}, new enabled: ${newEnabled.length}`);

    if (newEnabled.length > 0 && env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      const msgPromise = sendTelegramNotification(env, newEnabled, enabled);
      ctx.waitUntil(msgPromise);
    } else {
      console.log("无新增开通域名或未配置 TG 通知，跳过推送。");
    }

    // 更新 KV 中的已开通域名列表
    const currentNames = enabled.map(d => d.name);
    ctx.waitUntil(env.KV.put('enabled_domains', JSON.stringify(currentNames)));
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
      const zones = await fetchAllZones(token);
      if (zones.length === 0) continue;

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
 * 辅助：最终稳定版 checkSnippets (基于您提供的状态码精准判断)
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
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/snippets/snippet_rules`, {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
    });

    const status = resp.status;

    // 1. 状态码 200 (Success)
    if (status === 200) {
      const data = await resp.json();
      result.enabled = data.success === true;
      result.msg = result.enabled ? "✅ 已开通" : "❌ 状态异常";

    } 

    // 2. 状态码 403 (Token 权限不足) -> 您的测试结果
    else if (status === 403) {
      result.msg = `⚠️ Token权限不足 (请添加 'Snippets:Read')`; 

    } 

    // 3. 状态码 400 (功能未授权/需升级) -> 您的测试结果
    else if (status === 400) {
      result.msg = "❌ 未开通 (需升级/等待)";
    }

    // 4. 状态码 404 (接口不存在)
    else if (status === 404) {
      result.msg = "❌ 未开放 (接口不存在)";
    }

    // 5. 其他错误
    else {
        // 尝试解析错误信息，否则显示HTTP状态码
        let data = null;
        try {
            data = await resp.clone().json();
        } catch(e) { /* ignore */ }

        const msg = (data && data.errors && data.errors[0]) 
            ? data.errors[0].message 
            : `Http ${status}`;
        result.msg = `❌ 其他错误: ${msg}`;
    }

  } catch (e) {
    result.msg = "⚠️ 脚本请求失败";
  }

  return result;
}

/**
 * 辅助：发送 Telegram 通知
 */
async function sendTelegramNotification(env, newDomains, allDomains) {
  const token = env.TG_BOT_TOKEN;
  const chatId = env.TG_CHAT_ID;

  let text = '🎉 *Snippet 功能已开通检测通知* 🎉\n\n本次新增开通域名：\n';

  if (newDomains.length === 0) {
    text += '无\n';
  } else {
    newDomains.forEach(d => {
      text += '\n🌍 *' + d.name + '* \n👤 账号: `' + d.accountName + '`\n';
    });
  }

  text += '\n所有已开通域名：\n';

  if (allDomains.length === 0) {
    text += '无\n';
  } else {
    allDomains.forEach(d => {
      text += '\n🌍 *' + d.name + '* \n👤 账号: `' + d.accountName + '`\n';
    });
  }

  text += '\n📅 时间: ' + new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});

  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
    console.log('Telegram send response:', await response.text());
  } catch (e) {
    console.error("Telegram 推送失败", e);
  }
}

/**
 * 辅助：生成 HTML 页面 (已包含显示 r.msg 的修复)
 */
function generateHtml(results, logs) {
  results.sort((a, b) => (b.enabled === a.enabled) ? 0 : (a.enabled ? -1 : 1));

  const rows = results.map(r => `
    <tr class="border-b border-gray-200/60 hover:bg-blue-50/60 transition-colors duration-150">
      <td class="py-4 px-6 text-sm font-semibold text-gray-800">${r.name}</td>
      <td class="py-4 px-6 text-xs text-gray-600">${r.accountName}</td>
      <td class="py-4 px-6 text-xs">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
          ${r.plan === 'Enterprise' ? 'bg-purple-100 text-purple-800' :
            r.plan === 'Business'   ? 'bg-blue-100 text-blue-800' :
            r.plan === 'Pro'        ? 'bg-indigo-100 text-indigo-800' :
                                      'bg-gray-100 text-gray-600'}">
          ${r.plan}
        </span>
      </td>
      <td class="py-4 px-6 text-sm font-medium">
        ${r.enabled 
          ? `<span class="inline-flex items-center gap-1.5 text-green-600">
               <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
               已开通
             </span>`
          : `<span class="text-xs text-gray-500">${r.msg}</span>` // 显示准确的 msg
        }
      </td>
    </tr>
  `).join("");

  const errorHtml = logs.length > 0 
    ? `<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm flex items-center gap-2">
         <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
         <div>${logs.join('<br>')}</div>
       </div>` 
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CF Snippets Monitor</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          theme: {
            extend: {
              fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] }
            }
          }
        }
      </script>
      <link href="https://rsms.me/inter/inter.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-slate-50 to-gray-100 min-h-screen p-6 font-sans">
      <div class="max-w-5xl mx-auto">
        <div class="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200/50">
          <div class="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 text-white">
            <div class="flex justify-between items-center">
              <h1 class="text-2xl font-bold tracking-tight">Cloudflare Snippets Monitor</h1>
              <div class="text-sm opacity-90">共检测 ${results.length} 个域名</div>
            </div>
          </div>

          ${errorHtml}

          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th class="text-left py-4 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">域名</th>
                  <th class="text-left py-4 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">账户</th>
                  <th class="text-left py-4 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">套餐</th>
                  <th class="text-left py-4 px-6 text-xs font-semibold text-gray-600 uppercase tracking-wider">状态</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${rows}
              </tbody>
            </table>
          </div>

          <div class="bg-gradient-to-r from-gray-50 to-slate-50 px-8 py-5 border-t border-gray-200">
            <div class="text-center text-sm text-gray-600">
              <span class="font-semibold text-green-600">${results.filter(r => r.enabled).length}</span> 个域名已开通 Snippets
              <span class="mx-2 text-gray-400">•</span>
              Generated by Cloudflare Workers
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}