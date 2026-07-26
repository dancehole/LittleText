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
      // 拖拽排序手柄（hover 显示，位于删除按钮左侧）
      const drag = el("button", "nav-item__drag");
      drag.innerHTML = ICONS.drag;
      drag.title = "拖动调整顺序";
      drag.setAttribute("aria-label", `调整${name}顺序`);
      drag.addEventListener("click", (e) => e.stopPropagation());
      // 仅在手柄上按下时才允许拖拽，避免点击标题误触发拖拽
      drag.addEventListener("mousedown", () => (item._armed = true));
      drag.addEventListener("mouseup", () => {
        if (!item.classList.contains("dragging")) item._armed = false;
      });
      item.appendChild(drag);

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

    // 拖拽排序：整项可拖，但只有从手柄发起才生效
    item.setAttribute("draggable", "true");
    item.addEventListener("dragstart", (e) => {
      if (!item._armed) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", name);
      item.classList.add("dragging");
    });
    item.addEventListener("dragover", (e) => {
      const dragging = navEle().querySelector(".nav-item.dragging");
      if (!dragging || dragging === item) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      item.classList.add("drop-target");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drop-target");
      const dragging = navEle().querySelector(".nav-item.dragging");
      if (!dragging || dragging === item) return;
      reorderPanel(dragging.dataset.name, item.dataset.name, e.clientY, item);
    });
    item.addEventListener("dragend", () => {
      item._armed = false;
      item.classList.remove("dragging");
      navEle()
        .querySelectorAll(".drop-target")
        .forEach((n) => n.classList.remove("drop-target"));
    });

    item.addEventListener("click", () => selectPanel(name));

    // 右键查看详情
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPanelContextMenu(e.clientX, e.clientY, name);
    });

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

  /**
   * 显示面板详情右键菜单
   */
  function showPanelContextMenu(x, y, name) {
    const panel = JSON_STORAGE.getPanel(name);
    if (!panel) return;

    const cells = panel.cells || [];
    const firstContent = cells.find((c) => c && c.trim());
    const preview = firstContent ? firstContent.slice(0, 50) : "(空)";
    const created = new Date(panel.createTime);
    const typeMap = {
      SINGLE: "单文档",
      CLASSICS: "经典多格",
      WEEK: "周计划",
      MOON: "月计划",
      YEAR: "年计划",
    };
    const typeName = typeMap[panel.type] || panel.type || "未知";

    ContextMenu.show(x, y, [
      { label: `📋 ${name}`, icon: ICONS.info },
      { separator: true },
      { label: `类型：${typeName}` },
      { label: `网格：${panel.width} × ${panel.height}` },
      { label: `格子数：${cells.length}` },
      {
        label: `创建时间：${created.toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })}`,
      },
      { separator: true },
      { label: `内容预览：${preview}` },
      { separator: true },
      {
        label: "复制名称",
        icon: ICONS.copy,
        action: () => {
          navigator.clipboard.writeText(name);
          Toast.show("已复制面板名称", "success");
        },
      },
      {
        label: "重命名",
        icon: ICONS.edit,
        action: () => {
          const newName = prompt("输入新的面板名称：", name);
          if (!newName || newName === name || !newName.trim()) return;
          const trimmed = newName.trim();
          if (ComponentTextareaContainer.isRepeat(trimmed) && trimmed !== name) {
            Toast.show("名称已存在", "warning");
            return;
          }
          // 更新 panelList 中的名称
          const list = JSON_STORAGE.get("panelList") || [];
          const idx = list.indexOf(name);
          if (idx === -1) return;
          list[idx] = trimmed;
          JSON_STORAGE.set("panelList", list);
          // 迁移面板数据键名
          const data = JSON_STORAGE.getPanel(name);
          if (data) {
            JSON_STORAGE.setPanel(trimmed, data);
            JSON_STORAGE.delete(`panel:${name}`);
          }
          if (GLOBAL_DATA.currentPanel === name) {
            GLOBAL_DATA.update("currentPanel", trimmed);
          }
          refresh();
          ComponentTextareaContainer.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
          Toast.show(`已重命名为 ${trimmed}`, "success");
        },
      },
      {
        label: "删除面板",
        icon: ICONS.trash,
        danger: true,
        action: () => deletePanel(name),
      },
    ]);
  }

  /**
   * 拖拽落点后重排 panelList 并持久化。
   * @param {string} fromName 被拖动的面板名
   * @param {string} toName 目标面板名
   * @param {number} clientY 鼠标 Y，用于判断插入到目标项上方或下方
   * @param {HTMLElement} toItem 目标项 DOM（用于取中点）
   */
  function reorderPanel(fromName, toName, clientY, toItem) {
    const list = JSON_STORAGE.get("panelList") || [];
    const from = list.indexOf(fromName);
    if (from === -1) return;
    const [moved] = list.splice(from, 1);
    const newTo = list.indexOf(toName);
    if (newTo === -1) {
      list.push(moved);
    } else {
      const rect = toItem.getBoundingClientRect();
      const after = clientY > rect.top + rect.height / 2;
      list.splice(after ? newTo + 1 : newTo, 0, moved);
    }
    JSON_STORAGE.set("panelList", list);
    refresh();
    EventBus.emit("panel:reordered", list);
  }

  return { refresh, selectPanel, deletePanel };
})();
