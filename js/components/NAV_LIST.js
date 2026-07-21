/**
 * 侧边栏 / 顶部栏 面板列表。
 * 通过 EventBus 与宫格、弹窗解耦通信。
 */
const NAV_LIST = (() => {
  const navEle = () => document.getElementById("nav-content");

  function refresh() {
    const root = navEle();
    root.innerHTML = "";
    let panelNameList = JSON_STORAGE.get("panelList") || ["default"];

    // 隐私锁激活时仅显示 default
    if (GLOBAL_DATA.isLockCurrent) panelNameList = ["default"];

    panelNameList.forEach((name) => {
      if (!name) return;
      root.appendChild(createItem(name, GLOBAL_DATA.currentPanel === name));
    });
  }

  /**
   * 创建单个面板项（胶囊样式）
   * @param {string} name
   * @param {boolean} isSelected
   */
  function createItem(name, isSelected) {
    const item = el("div", "nav-item" + (isSelected ? " is-active" : ""));
    item.dataset.name = name;

    const title = el("span", "nav-item__title");
    title.textContent = name;
    item.appendChild(title);

    if (!GLOBAL_DATA.isLockCurrent) {
      const del = el("button", "nav-item__del");
      del.innerHTML = ICONS.trash;
      del.title = "删除面板";
      del.setAttribute("aria-label", `删除${name}`);
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deletePanel(name, item);
      });
      item.appendChild(del);
    }

    item.addEventListener("click", () => selectPanel(name));
    return item;
  }

  function selectPanel(name) {
    GLOBAL_DATA.update("currentPanel", name);
    document
      .querySelectorAll(".nav-item.is-active")
      .forEach((n) => n.classList.remove("is-active"));
    const target = document.querySelector(`.nav-item[data-name="${CSS.escape(name)}"]`);
    target?.classList.add("is-active");
    ComponentTextareaContainer.refreshDomByPanelName(name);
    EventBus.emit("panel:selected", name);
  }

  function deletePanel(name, itemNode) {
    if (name === "default") {
      Toast.show("default 面板不可删除", "warning");
      return;
    }
    Modal.confirm({
      title: "删除面板",
      message: `确定要删除【${name}】吗？此操作不可撤销。`,
      confirmText: "删除",
      danger: true,
      onConfirm: () => {
        ComponentTextareaContainer.fromCache(name).delete();
        if (GLOBAL_DATA.currentPanel === name) {
          GLOBAL_DATA.update("currentPanel", "default");
        }
        refresh();
        ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
        EventBus.emit("panel:deleted", name);
        Toast.show(`已删除【${name}】`, "success");
      },
    });
  }

  return { refresh, selectPanel };
})();
