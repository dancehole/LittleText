/**
 * 云同步模块：与极简后端通信，云端为单用户保留一份数据副本。
 * 仅支持：上传覆盖（导出到云端）/ 下载读取（从云端导入）。
 *
 * 后端接口（均由 settings 里配置的 baseUrl + ?token= 拼成）：
 *   POST   {baseUrl}?token=XXX   上传覆盖
 *   GET    {baseUrl}?token=XXX   下载读取（无数据 404）
 *
 * 同步地址和令牌在设置面板中配置，保存在 localStorage，不会上传到服务器。
 */
const CLOUD_SYNC_DEFAULT_URL = "https://dancehole.cn/api/littletext/sync/";

const CloudSync = (() => {
  const K_URL = "cloudSyncUrl";
  const K_TOKEN = "cloudSyncToken";
  const K_AUTO = "cloudSyncAuto";

  /** 读取配置 */
  function getConfig() {
    return {
      url: (localStorage.getItem(K_URL) || CLOUD_SYNC_DEFAULT_URL).trim(),
      token: localStorage.getItem(K_TOKEN) || "",
      auto: localStorage.getItem(K_AUTO) === "1",
    };
  }

  /** 写入配置（仅传入的字段会被更新） */
  function setConfig({ url, token, auto } = {}) {
    if (url !== undefined) localStorage.setItem(K_URL, url.trim());
    if (token !== undefined) localStorage.setItem(K_TOKEN, token);
    if (auto !== undefined) localStorage.setItem(K_AUTO, auto ? "1" : "0");
  }

  /** 组装带 token 的请求地址 */
  function buildUrl() {
    const { url, token } = getConfig();
    if (!url) return { ok: false, error: "未配置同步地址" };
    const sep = url.includes("?") ? "&" : "?";
    return { ok: true, url: url + sep + "token=" + encodeURIComponent(token) };
  }

  /**
   * 导出到云端（覆盖式保存）。
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function push() {
    const built = buildUrl();
    if (!built.ok) return built;
    if (!getConfig().token) return { ok: false, error: "未配置同步令牌" };

    const payload = {
      app: "LittleText",
      schema: 2,
      exportedAt: new Date().toISOString(),
      data: JSON_STORAGE.exportAll(),
    };
    try {
      const res = await fetch(built.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error || `服务器返回 ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "网络错误：" + e.message };
    }
  }

  /**
   * 从云端导入（下载读取并覆盖本地）。
   * 注意：调用方应自行先备份本地数据。
   * @returns {Promise<{ok:boolean, count?:number, error?:string, notFound?:boolean}>}
   */
  async function pull() {
    const built = buildUrl();
    if (!built.ok) return built;
    if (!getConfig().token) return { ok: false, error: "未配置同步令牌" };

    try {
      const res = await fetch(built.url, { method: "GET" });
      if (res.status === 404) return { ok: false, error: "云端暂无备份", notFound: true };
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return { ok: false, error: j.error || `服务器返回 ${res.status}` };
      }
      const payload = await res.json();
      const data = payload && payload.data ? payload.data : payload;
      // 合并导入（不丢本地独有面板、保留本地视图状态）
      const result = JSON_STORAGE.importByJsonString(JSON.stringify(data), { merge: true });
      if (!result.ok) return { ok: false, error: result.error };
      // 重载内存状态并自动刷新页面（与文件导入逻辑一致）
      EventBus.emit("data:imported");
      refreshAllFromStorage();
      return { ok: true, count: result.count };
    } catch (e) {
      return { ok: false, error: "网络错误：" + e.message };
    }
  }

  return { getConfig, setConfig, push, pull };
})();
