/**
 * 本地数据层封装（localStorage）。
 *
 * 存储方案（v2 优化后）：
 *   - panelList    : 面板名数组（索引）
 *   - panel:<title>: 单个面板的全部数据 { width, height, type, createTime, cells:[...] }
 *   - GLOBAL_DATA  : 全局设置
 * 旧版（<title>-data / <title>-text-<i>）会在首次启动时由 migratePanels() 自动合并迁移。
 *
 * 容量识别（优化2）：浏览器 localStorage 实际按 UTF-16 存储，每个码元固定 2 字节；
 * getSize() 据此计量，并提供 getSizeInfo() 做 80% 预警。
 * set() 带配额兜底，空间不足时不再抛出 QuotaExceededError 导致页面崩溃，而是返回 false 并提示。
 */
const JSON_STORAGE = {
  /** localStorage 占用参考上限（多数浏览器约 5MB） */
  QUOTA_MB: 5,
  /** 预警阈值比例 */
  WARN_RATIO: 0.8,
  /** 配额提示节流时间戳 */
  _lastWarnAt: 0,

  /** 读取并解析，失败/不存在返回 null */
  get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return safeJSONParse(raw, null);
  },

  /**
   * 写入（自动 JSON 序列化）。
   * 带配额兜底：空间不足时不再抛错导致页面崩溃，而是返回 false 并提示。
   * @returns {boolean} 是否写入成功
   */
  set(key, value) {
    if (typeof key !== "string") key = JSON.stringify(key);
    let str;
    try {
      str = JSON.stringify(value);
    } catch (e) {
      console.error("[JSON_STORAGE] 序列化失败:", e);
      this._maybeWarn("数据序列化失败，无法保存", false);
      return false;
    }
    try {
      localStorage.setItem(key, str);
      return true;
    } catch (e) {
      console.error("[JSON_STORAGE] 写入失败:", e);
      const isQuota =
        e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
      this._maybeWarn(
        isQuota
          ? "本地存储空间已满，最新内容未能保存，请清理或导出备份"
          : "保存失败：" + (e && e.message ? e.message : "未知错误"),
        isQuota
      );
      return false;
    }
  },

  delete(key) {
    localStorage.removeItem(key);
  },

  /** 导出当前全部数据为纯对象 */
  exportAll() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = this.get(k);
      if (v !== null) data[k] = v;
    }
    return data;
  },

  /**
   * 导出为可下载的 JSON 文件（带元信息）。
   * @returns {string} 文件名
   */
  downloadExport() {
    const payload = {
      app: "LittleText",
      schema: 3,
      exportedAt: new Date().toISOString(),
      data: this.exportAll(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const date = new Date();
    const name = `宫格记事本-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.json`;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },

  /**
   * 导入前自动备份当前数据：下载一份备份文件。
   * @returns {string} 备份文件名
   */
  backupCurrent() {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const payload = {
      app: "LittleText",
      schema: 3,
      exportedAt: new Date().toISOString(),
      note: "导入前自动备份",
      data: this.exportAll(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const name = `宫格记事本-备份-${ts}.json`;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },

  /**
   * 从 JSON 字符串导入。
   * 兼容两种格式：
   *   - 新版：{ app, schema, data } —— 取 data
   *   - 旧版/裸数据：直接是键值对象
   * 导入后自动迁移旧版 <title>-data / <title>-text-<i> 合并为 panel:<title>。
   *
   * @param {string} contentString
   * @param {{merge?:boolean}} [options] merge=true（默认）时做「合并」：
   *   - panelList 取本地 ∪ 导入（去重，保留本地顺序，导入新增追加在后）；
   *   - GLOBAL_DATA 以本地视图状态为准（保留本地 currentPanel / 隐私锁 / 云同步配置），
   *     避免下载/导入意外改变当前正在查看的面板或本地设置；
   *   - 同名面板数据以导入为准（覆盖），本地独有面板保留。
   *   merge=false 时为纯覆盖导入。
   * @returns {{ok:boolean, count?:number, error?:string}}
   */
  importByJsonString(contentString, options = {}) {
    const merge = options.merge !== false; // 默认合并
    const parsed = safeJSONParse(contentString, undefined);
    if (parsed === undefined) {
      return { ok: false, error: "文件不是有效的 JSON 格式" };
    }
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.data
        ? parsed.data
        : parsed;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "文件内容结构不符合预期" };
    }

    // 合并模式下先取本地快照（用于合并 panelList 与保留本地视图状态）
    const localList = merge ? (this.get("panelList") || []) : null;
    const localGlobal = merge ? this.get("GLOBAL_DATA") : null;

    const keys = Object.keys(data);
    keys.forEach((k) => this.set(k, data[k]));

    if (merge) {
      // 1) 合并 panelList：本地在前，导入新增在后，去重（不丢本地独有面板）
      const importedList = Array.isArray(data.panelList) ? data.panelList : [];
      const mergedList = Array.isArray(localList) ? [...localList] : [];
      importedList.forEach((n) => {
        if (n && !mergedList.includes(n)) mergedList.push(n);
      });
      if (mergedList.length) this.set("panelList", mergedList);

      // 2) 保留本地视图状态：以导入 GLOBAL_DATA 为底、本地字段覆盖在上
      //    这样 currentPanel / lock / 云同步配置仍沿用本地，不被导入内容改写
      if (localGlobal && typeof localGlobal === "object") {
        const importedGlobal =
          data.GLOBAL_DATA && typeof data.GLOBAL_DATA === "object" ? data.GLOBAL_DATA : {};
        this.set("GLOBAL_DATA", { ...importedGlobal, ...localGlobal });
      }
    }

    // 校正 panelList：导入文件可能缺失/不完整 panelList，导致新面板被写入
    // localStorage 却未进入导航（表现为「导入后标签页不更新，只剩 default」）。
    // 这里让 panelList 与实际存在的 panel:*（及旧版 -data）数据对齐；reconcile
    // 会把旧版 -data 对应的面板名补进 panelList，随后 migratePanels 完成转换。
    this.reconcilePanelList();

    // 兼容旧版导出文件：把散落的 -data / -text-i 合并为单 key
    this.migratePanels();

    return { ok: true, count: keys.length };
  },

  /**
   * 让 panelList 与实际存储的面板数据对齐：
   * - 跳过 panelList 中已无对应 panel:*（或旧版 -data）数据的「悬挂」项；
   * - 追加存在于存储但不在 panelList 中的面板（修复导入文件缺 panelList 的情况）；
   * - 保证 default 始终在列表中（首个）。
   * 幂等，不改变顺序（原 panelList 顺序优先）。
   * @returns {string[]} 校正后的 panelList
   */
  reconcilePanelList() {
    const stored = this.get("panelList");
    const list = Array.isArray(stored) ? stored.slice() : [];
    const present = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.indexOf("panel:") === 0) {
        present.add(k.slice(6));
      } else if (k.indexOf("panel:") !== 0 && /-data$/.test(k)) {
        // 旧版存储：<title>-data
        present.add(k.slice(0, -"-data".length));
      }
    }
    // 保留原顺序中的有效项
    const result = [];
    list.forEach((n) => {
      if (n && present.has(n) && !result.includes(n)) result.push(n);
    });
    // 追加缺失项
    present.forEach((n) => {
      if (!result.includes(n)) result.push(n);
    });
    // 确保 default 永远存在
    if (!result.includes("default")) result.unshift("default");
    this.set("panelList", result);
    return result;
  },

  /**
   * 容量计量（UTF-16）：每个码元固定 2 字节，与浏览器实际占用一致。
   * 同时计入 key 名长度（key 名同样占用存储）。
   * @returns {number} 占用大小（MB）
   */
  getSize() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const item = localStorage.getItem(k) || "";
      total += (k.length + item.length) * 2; // UTF-16：字符与 key 名均每单位 2 字节
    }
    return total / (1024 * 1024);
  },

  /**
   * 容量信息，供 UI 预警。
   * @returns {{mb:number, ratio:number, warning:boolean}}
   */
  getSizeInfo() {
    const mb = this.getSize();
    const ratio = mb / this.QUOTA_MB;
    return { mb, ratio, warning: ratio >= this.WARN_RATIO };
  },

  /** 配额/异常提示（节流，避免输入时反复弹窗） */
  _maybeWarn(msg, isQuota) {
    const now = Date.now();
    if (now - this._lastWarnAt < 8000) return;
    this._lastWarnAt = now;
    if (typeof Toast !== "undefined") Toast.show(msg, isQuota ? "error" : "error");
  },

  /** 清空所有数据（仅调试用） */
  clearAll() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      localStorage.removeItem(localStorage.key(i));
    }
  },

  // ---------- 面板存储（v2 优化：每面板单 key，消除 key 爆炸） ----------

  /** 读取单个面板对象；不存在返回 null */
  getPanel(title) {
    return this.get(`panel:${title}`);
  },

  /** 写入单个面板对象（含 cells 数组） */
  setPanel(title, obj) {
    return this.set(`panel:${title}`, obj);
  },

  /**
   * 迁移旧版存储：把 <title>-data 与 <title>-text-<i> 合并为 panel:<title>。
   * 兼容已迁移（跳过并清理残留旧 key）与全新安装（无旧 key，跳过）。可重复幂等调用。
   */
  migratePanels() {
    const panelList = this.get("panelList") || [];
    panelList.forEach((title) => {
      const newKey = `panel:${title}`;
      const oldData = this.get(`${title}-data`);
      const newObj = this.get(newKey);
      if (newObj) {
        // 已为新格式：清理可能残留的旧 key
        if (oldData) this.delete(`${title}-data`);
        for (let i = 0; i < 2000; i++) {
          const k = `${title}-text-${i}`;
          if (this.get(k) === null) break;
          this.delete(k);
        }
        return;
      }
      if (!oldData) return; // 既无新格式也无旧数据
      const total = (oldData.width || 1) * (oldData.height || 1);
      const cells = [];
      for (let i = 0; i < total; i++) {
        const v = this.get(`${title}-text-${i}`);
        cells.push(v === null ? "" : v);
      }
      this.set(newKey, {
        width: oldData.width,
        height: oldData.height,
        type: oldData.type,
        createTime: oldData.createTime,
        cells,
      });
      this.delete(`${title}-data`);
      for (let i = 0; i < total; i++) this.delete(`${title}-text-${i}`);
    });
  },
};
