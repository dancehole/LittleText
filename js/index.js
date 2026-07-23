/**
 * 应用入口：初始化各模块并接线。
 */
window.onload = function () {
  // 初始化缓存，防止缺键
  initStorage();

  // 缓存用量定时刷新
  refreshCurrentCacheSize();
  setInterval(refreshCurrentCacheSize, 1000 * 60);

  // 各组件初始化
  NAV_LIST.refresh();
  ComponentTextareaContainer.init();
  GLOBAL_SETTINGS_PANEL.init();
  DIALOG_ADD_PANEL.init();

  // 新建面板按钮
  document.getElementById("add-panel-btn").addEventListener("click", () =>
    DIALOG_ADD_PANEL.open()
  );
  // 刷新按钮
  document.getElementById("refresh-btn").addEventListener("click", () => {
    refreshAllFromStorage();
    Toast.show("已刷新工作区", "success");
  });
  // 全局设置按钮
  document.getElementById("global-setting-btn").addEventListener("click", () => {
    GLOBAL_SETTINGS_PANEL.populate();
    Modal.get("global-settings-panel").open();
  });

  // 隐私锁初始态
  const lockTimeBox = document.getElementById("lock-bar");
  if (GLOBAL_DATA.lock) lockTimeBox.classList.add("is-on");

  // 锁定时长推进
  setInterval(() => {
    if (GLOBAL_DATA.lock && !GLOBAL_DATA.isLockCurrent) {
      if (GLOBAL_DATA.lockTimeCurrent >= GLOBAL_DATA.lockTimeMax) {
        GLOBAL_DATA.update("isLockCurrent", true);
        GLOBAL_DATA.update("previousPannel", GLOBAL_DATA.currentPanel);
        GLOBAL_DATA.update("currentPanel", "default");
        NAV_LIST.refresh();
        ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
        Toast.show("已进入隐私保护", "info");
      } else {
        GLOBAL_DATA.update("lockTimeCurrent", GLOBAL_DATA.lockTimeCurrent + 1);
      }
      GLOBAL_SETTINGS_PANEL.setLockProgress(
        GLOBAL_DATA.lockTimeCurrent / GLOBAL_DATA.lockTimeMax
      );
    }
  }, 1000);

  // 鼠标/键盘活动清空计时
  const clearTime = throttle(() => {
    if (GLOBAL_DATA.lock && !GLOBAL_DATA.isLockCurrent) {
      GLOBAL_DATA.update("lockTimeCurrent", 0);
      GLOBAL_SETTINGS_PANEL.setLockProgress(0);
    }
  }, 1000);
  document.addEventListener("mousemove", clearTime);
  document.addEventListener("keydown", clearTime);

  // Ctrl/⌘ + Q 解除隐私锁
  document.addEventListener("keydown", (e) => {
    const qPressed = e.code === "KeyQ" && (e.ctrlKey || e.metaKey);
    if (!qPressed) return;
    if (!GLOBAL_DATA.isLockCurrent) return;
    GLOBAL_DATA.update("isLockCurrent", false);
    GLOBAL_DATA.update("lockTimeCurrent", 0);
    GLOBAL_SETTINGS_PANEL.setLockProgress(0);
    GLOBAL_DATA.update("currentPanel", GLOBAL_DATA.previousPannel);
    NAV_LIST.refresh();
    ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
    Toast.show("已解除隐私保护", "info");
  });

  // 窗口尺寸变化重算 textarea 高度
  window.addEventListener(
    "resize",
    throttle(() => ComponentTextareaContainer.refreshAutoSize(), 200)
  );

  // 自动云同步：开启后，编辑（cell:change）防抖上传到云端
  let _autoSyncTimer = null;
  EventBus.on("cell:change", () => {
    if (!CloudSync.getConfig().auto) return;
    clearTimeout(_autoSyncTimer);
    _autoSyncTimer = setTimeout(() => {
      CloudSync.push().then((r) => {
        if (r.ok) Toast.show("已自动同步到云端", "success");
        else Toast.show("自动同步失败：" + r.error, "error");
      });
    }, 1500);
  });

  // 日期跨天自动刷新今日高亮
  if (!GLOBAL_DATA.lastDate) {
    GLOBAL_DATA.update("lastDate", new Date().toISOString().slice(0, 10));
  }
  setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (GLOBAL_DATA.lastDate !== today) {
      GLOBAL_DATA.update("lastDate", today);
      ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
    }
  }, 1000 * 60);
};

/**
 * 数据整体变更后（文件导入 / 云端下载）重新载入内存状态并刷新界面。
 *
 * 关键点：导入会覆盖/合并 localStorage 里的 GLOBAL_DATA，但内存中的 GLOBAL_DATA
 * 对象不会自动同步；若不重载，refreshDomByPanelName 会用「旧的 currentPanel」
 * 渲染，指向已不存在的面板时还会退化成一个空白宫格，表现为「导入后页面不更新」。
 * 这里统一：重载内存 GLOBAL_DATA → 校正 currentPanel → 刷新导航与工作区。
 */
function refreshAllFromStorage() {
  // 1) 重载内存 GLOBAL_DATA（与 localStorage 保持一致）
  const stored = JSON_STORAGE.get("GLOBAL_DATA");
  if (stored && typeof stored === "object") {
    for (const key in stored) GLOBAL_DATA[key] = stored[key];
  }

  // 2) 确保 default 仍为单文档（幂等，不丢内容）
  ensureDefaultIsDoc();

  // 3) 校正 currentPanel：若指向的面板在新数据中不存在，则回退
  const list = JSON_STORAGE.get("panelList") || ["default"];
  if (!list.includes(GLOBAL_DATA.currentPanel)) {
    const fallback = list.includes("default") ? "default" : list[0] || "default";
    GLOBAL_DATA.update("currentPanel", fallback);
  }

  // 4) 刷新导航与工作区
  NAV_LIST.refresh();
  ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
  refreshCurrentCacheSize();
  EventBus.emit("storage:changed");
}

/** 刷新缓存用量显示（含 80% 预警标红） */
function refreshCurrentCacheSize() {
  const node = document.querySelector(".current-cache");
  if (!node) return;
  const info = JSON_STORAGE.getSizeInfo();
  node.textContent = info.mb.toFixed(2);
  node.classList.toggle("is-warning", info.warning);
  node.title = info.warning ? "本地存储已接近上限，建议导出备份" : "";
}

/** default 面板的示例内容（首次初始化时展示 markdown 渲染效果） */
const DEFAULT_SAMPLE_MD =
  "# 这是标题\n" +
  "## 二级标题\n" +
  "\n" +
  "**加粗文本**\n" +
  "*斜体*\n" +
  "`code`\n" +
  "\n" +
  "[这是一个连接](https://dancehole.cn)\n" +
  "\n" +
  "![这是一个图片](https://cdn.jsdelivr.net/gh/dancehole/image@main/notebooks/test.png)\n" +
  "\n" +
  "- 列表1\n" +
  "- 列表2\n" +
  "\n" +
  "> 引用文本1\n" +
  "\n" +
  "分割线：\n" +
  "------";

/** 初始化本地缓存结构 */
function initStorage() {
  let panelList = JSON_STORAGE.get("panelList");
  if (panelList === null) {
    panelList = ["default"];
    JSON_STORAGE.set("panelList", panelList);
    JSON_STORAGE.setPanel("default", {
      width: 1,
      height: 1,
      type: "SINGLE",
      createTime: new Date().getTime(),
      cells: [DEFAULT_SAMPLE_MD],
    });
  } else {
    // 迁移旧版存储（<title>-data / <title>-text-<i> → panel:<title>）
    JSON_STORAGE.migratePanels();
    // 确保 default 面板为单文档（首次/存量迁移）
    ensureDefaultIsDoc();
  }
  const global = JSON_STORAGE.get("GLOBAL_DATA");
  if (global === null) {
    JSON_STORAGE.set("GLOBAL_DATA", GLOBAL_DATA);
  } else {
    for (const key in global) GLOBAL_DATA[key] = global[key];
  }
}

/**
 * 确保 default 面板为单文档（SINGLE，1×1）。
 * - 不存在 / 不在列表中：新建并写入示例 markdown。
 * - 已是单文档且为空：填充示例 markdown。
 * - 已是单文档且有内容：保留用户内容。
 * - 原为多宫格：合并所有格内容为一个文档（不丢数据），为空则填示例。
 * 幂等：转换后 width*height===1，不会重复合并。
 */
function ensureDefaultIsDoc() {
  const panelList = JSON_STORAGE.get("panelList") || [];
  const hasDefault = panelList.includes("default");
  const panel = JSON_STORAGE.getPanel("default");

  if (!hasDefault || !panel) {
    if (!hasDefault) {
      panelList.push("default");
      JSON_STORAGE.set("panelList", panelList);
    }
    JSON_STORAGE.setPanel("default", {
      width: 1,
      height: 1,
      type: "SINGLE",
      createTime: new Date().getTime(),
      cells: [DEFAULT_SAMPLE_MD],
    });
    return;
  }

  // 已是单文档
  if (panel.width === 1 && panel.height === 1) {
    const empty =
      !panel.cells ||
      panel.cells.length === 0 ||
      panel.cells.every((c) => !(c && String(c).trim()));
    if (empty) {
      panel.cells = [DEFAULT_SAMPLE_MD];
      JSON_STORAGE.setPanel("default", panel);
    }
    return;
  }

  // 多宫格 → 合并为单文档（保留全部内容）
  const merged = (panel.cells || [])
    .filter((c) => c != null)
    .map((c) => String(c))
    .join("\n\n");
  const finalText = merged.trim() ? merged : DEFAULT_SAMPLE_MD;
  JSON_STORAGE.setPanel("default", {
    width: 1,
    height: 1,
    type: "SINGLE",
    createTime: panel.createTime || new Date().getTime(),
    cells: [finalText],
  });
}
