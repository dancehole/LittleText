/**
 * 全局设置：导入 / 导出 / 隐私锁 / 云同步。
 * 全部基于模态层与 Toast，不再刷新页面。
 */
const GLOBAL_SETTINGS_PANEL = (() => {
  let modal, exportBtn, importBtn, importInput, lockSwitch, lockState, lockBar, lockFill;

  // 云同步相关元素
  let syncUrlInput, syncTokenInput, syncAutoBtn, syncAutoState, syncPushBtn, syncPullBtn, syncStatus;

  function init() {
    modal = Modal.get("global-settings-panel");
    exportBtn = document.getElementById("export-btn");
    importBtn = document.getElementById("import-btn");
    importInput = document.getElementById("import-file-input");
    lockSwitch = document.getElementById("lock-switch");
    lockState = document.getElementById("lock-state");
    lockBar = document.getElementById("lock-bar");
    lockFill = document.getElementById("lock-bar-fill");

    // —— 云同步元素 ——
    syncUrlInput = document.getElementById("sync-url");
    syncTokenInput = document.getElementById("sync-token");
    syncAutoBtn = document.getElementById("sync-auto");
    syncAutoState = document.getElementById("sync-auto-state");
    syncPushBtn = document.getElementById("sync-push");
    syncPullBtn = document.getElementById("sync-pull");
    syncStatus = document.getElementById("sync-status");

    lockState.textContent = GLOBAL_DATA.lock ? "开启" : "关闭";
    if (GLOBAL_DATA.lock) lockBar.classList.add("is-on");

    exportBtn.addEventListener("click", handleExport);
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", handleImport);
    lockSwitch.addEventListener("click", toggleLock);

    // —— 云同步事件 ——
    // 输入即持久化（地址 / 令牌）
    syncUrlInput.addEventListener("input", (e) =>
      CloudSync.setConfig({ url: e.target.value })
    );
    syncTokenInput.addEventListener("input", (e) =>
      CloudSync.setConfig({ token: e.target.value })
    );
    // 自动同步开关
    syncAutoBtn.addEventListener("click", toggleAutoSync);
    // 上传 / 下载
    syncPushBtn.addEventListener("click", handlePush);
    syncPullBtn.addEventListener("click", handlePull);
  }

  /** 打开弹窗时回填云同步配置 */
  function populate() {
    const cfg = CloudSync.getConfig();
    syncUrlInput.value = cfg.url;
    syncTokenInput.value = cfg.token;
    renderAutoState(cfg.auto);
    setStatus("");
  }

  function renderAutoState(auto) {
    syncAutoState.textContent = auto ? "开启" : "关闭";
    syncAutoBtn.classList.toggle("is-active", auto);
  }

  function setStatus(msg, type) {
    syncStatus.textContent = msg || "";
    syncStatus.className = "sync-status" + (type ? " sync-status--" + type : "");
  }

  function toggleAutoSync() {
    const next = !CloudSync.getConfig().auto;
    CloudSync.setConfig({ auto: next });
    renderAutoState(next);
    setStatus(next ? "已开启：编辑后将自动上传到云端" : "已关闭自动同步", next ? "info" : "");
  }

  async function handlePush() {
    setStatus("正在上传到云端…", "info");
    const r = await CloudSync.push();
    if (r.ok) {
      setStatus("已上传到云端 ✓", "success");
      Toast.show("已上传到云端", "success");
    } else {
      setStatus("上传失败：" + r.error, "error");
      Toast.show("上传失败：" + r.error, "error");
    }
  }

  async function handlePull() {
    // 下载会覆盖本地，先自动备份一份
    const backupName = JSON_STORAGE.backupCurrent();
    setStatus("已备份本地（" + backupName + "），正在从云端下载…", "info");
    const r = await CloudSync.pull();
    if (r.ok) {
      setStatus("已从云端导入 ✓", "success");
      Toast.show(`已从云端导入，共 ${r.count} 项`, "success");
    } else if (r.notFound) {
      setStatus("云端暂无备份", "warning");
      Toast.show("云端暂无备份", "warning");
    } else {
      setStatus("下载失败：" + r.error, "error");
      Toast.show("下载失败：" + r.error, "error");
    }
  }

  function handleExport() {
    const name = JSON_STORAGE.downloadExport();
    Toast.show(`已导出：${name}`, "success");
  }

  function handleImport() {
    const file = importInput.files[0];
    if (!file) {
      Toast.show("请先选择一个文件", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      // 1) 导入前先自动备份当前数据（下载一份备份文件）
      const backupName = JSON_STORAGE.backupCurrent();
      // 2) 再执行导入（失败也不影响已备份的数据）
      const result = JSON_STORAGE.importByJsonString(e.target.result);
      if (!result.ok) {
        Toast.show(`导入失败：${result.error}，已为你备份：${backupName}`, "error");
        importInput.value = "";
        return;
      }
      EventBus.emit("data:imported");
      NAV_LIST.refresh();
      ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
      EventBus.emit("storage:changed");
      Toast.show(`导入成功，共 ${result.count} 项，备份：${backupName}`, "success");
      importInput.value = "";
      modal.close();
    };
    reader.onerror = () => Toast.show("读取文件失败", "error");
    reader.readAsText(file);
  }

  function toggleLock() {
    GLOBAL_DATA.update("lock", !GLOBAL_DATA.lock);
    lockState.textContent = GLOBAL_DATA.lock ? "开启" : "关闭";
    if (GLOBAL_DATA.lock) {
      lockBar.classList.add("is-on");
    } else {
      lockBar.classList.remove("is-on");
    }
    Toast.show(GLOBAL_DATA.lock ? "隐私锁已开启" : "隐私锁已关闭", "info");
  }

  /** 供外部更新锁进度条 */
  function setLockProgress(ratio) {
    if (lockFill) lockFill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  return { init, populate, setLockProgress };
})();
