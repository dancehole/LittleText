/**
 * 本地数据层封装（localStorage）。
 * 兼容原数据键：panelList / <title>-data / <title>-text-<i> / GLOBAL_DATA
 * 并增强导入导出：带元信息、导入前自动备份、结构校验、友好错误。
 */
const JSON_STORAGE = {
  /** 读取并解析，失败/不存在返回 null */
  get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return safeJSONParse(raw, null);
  },

  /** 写入（自动 JSON 序列化） */
  set(key, value) {
    if (typeof key !== "string") key = JSON.stringify(key);
    localStorage.setItem(key, JSON.stringify(value));
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
      schema: 2,
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
      schema: 2,
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
   * @param {string} contentString
   * @returns {{ok:boolean, count?:number, error?:string}}
   */
  importByJsonString(contentString) {
    const parsed = safeJSONParse(contentString, undefined);
    if (parsed === undefined) {
      return { ok: false, error: "文件不是有效的 JSON 格式" };
    }
    // 提取真实数据对象
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.data
        ? parsed.data
        : parsed;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "文件内容结构不符合预期" };
    }

    // 写入（同键覆盖）
    const keys = Object.keys(data);
    keys.forEach((k) => this.set(k, data[k]));

    return { ok: true, count: keys.length };
  },

  /** localStorage 占用大小（MB） */
  getSize() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const item = localStorage.getItem(k) || "";
      for (let j = 0; j < item.length; j++) {
        total += item.charCodeAt(j) <= 0xff ? 1 : 2;
      }
    }
    return total / (1024 * 1024);
  },

  /** 清空所有数据（仅调试用） */
  clearAll() {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      localStorage.removeItem(localStorage.key(i));
    }
  },
};
