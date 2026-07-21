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

/** 刷新缓存用量显示 */
function refreshCurrentCacheSize() {
  const node = document.querySelector(".current-cache");
  if (node) node.textContent = JSON_STORAGE.getSize().toFixed(2);
}

/** 初始化本地缓存结构 */
function initStorage() {
  let panelList = JSON_STORAGE.get("panelList");
  if (panelList === null) {
    panelList = ["default"];
    JSON_STORAGE.set("panelList", panelList);
    JSON_STORAGE.set("default-data", {
      width: 3,
      height: 2,
      type: "CLASSICS",
      createTime: new Date().getTime(),
    });
    for (let i = 0; i < 6; i++) JSON_STORAGE.set(`default-text-${i}`, "");
  }
  const global = JSON_STORAGE.get("GLOBAL_DATA");
  if (global === null) {
    JSON_STORAGE.set("GLOBAL_DATA", GLOBAL_DATA);
  } else {
    for (const key in global) GLOBAL_DATA[key] = global[key];
  }
}
