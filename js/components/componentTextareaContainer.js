/**
 * 主工作区：一个或多个宫格 textarea 组成的面板。
 * 负责数据读写、今日高亮、移动端自适应高度与三层布局适配。
 */
class ComponentTextareaContainer {
  constructor(title, width, height, type = "UNKNOW") {
    this.title = title;
    this.width = width;
    this.height = height;
    this.type = type;
    this.createTime = new Date();
  }

  static init() {
    this.refreshDomByPanelName(GLOBAL_DATA.currentPanel);
  }

  /** 是否处于移动端/平板端（≤ 1024px），桌面端才用原始宫格 */
  static isMobile() {
    return window.matchMedia("(max-width: 1024px)").matches;
  }

  /** 让 textarea 高度自适应内容（移动端单列/双列） */
  static autoSizeTextarea(node) {
    node.style.height = "auto";
    node.style.height = node.scrollHeight + "px";
  }

  /** 根据设备类型重算所有 textarea 高度（resize / 布局切换时） */
  static refreshAutoSize() {
    const nodes = document.querySelectorAll("#workspace .cell-edit");
    if (this.isMobile()) {
      nodes.forEach((n) => this.autoSizeTextarea(n));
    } else {
      nodes.forEach((n) => (n.style.height = ""));
    }
  }

  static isRepeat(title) {
    return (JSON_STORAGE.get("panelList") || []).includes(title);
  }

  static refreshDomByPanelName(panelName) {
    this.fromCache(panelName).refreshTextArea();
  }

  static fromCache(title) {
    const panelList = JSON_STORAGE.get("panelList") || [];
    if (!panelList.includes(title)) {
      return new ComponentTextareaContainer(title, 3, 2, "CLASSICS");
    }
    const obj = JSON_STORAGE.getPanel(title);
    if (obj === null) {
      const res = new ComponentTextareaContainer(title, 3, 2, "CLASSICS");
      res.createTime = new Date();
      // 兜底写入空面板对象，避免后续读取 cells 出错
      JSON_STORAGE.setPanel(title, {
        width: 3,
        height: 2,
        type: "CLASSICS",
        createTime: res.createTime.getTime(),
        cells: new Array(6).fill(""),
      });
      return res;
    }
    const res = new ComponentTextareaContainer(title, obj.width, obj.height, obj.type);
    res.createTime = new Date(obj.createTime);
    return res;
  }

  create(defaultContent) {
    const panelList = JSON_STORAGE.get("panelList") || [];
    if (!panelList.includes(this.title)) panelList.push(this.title);
    JSON_STORAGE.set("panelList", panelList);
    const total = this.width * this.height;
    const cells = [];
    for (let i = 0; i < total; i++) {
      cells.push(defaultContent ? defaultContent[i] : "");
    }
    const ok = JSON_STORAGE.setPanel(this.title, {
      width: this.width,
      height: this.height,
      type: this.type,
      createTime: this.createTime.getTime(),
      cells,
    });
    if (!ok) Toast.show("面板创建失败：本地存储空间不足", "error");
  }

  delete() {
    if (this.title === "default") {
      Toast.show("default 不能删除", "warning");
      return;
    }
    const panelList = JSON_STORAGE.get("panelList") || [];
    const idx = panelList.indexOf(this.title);
    if (idx === -1) return;
    panelList.splice(idx, 1);
    JSON_STORAGE.set("panelList", panelList);
    JSON_STORAGE.delete(`panel:${this.title}`);
  }

  refreshTextArea() {
    const mainEle = document.getElementById("workspace");
    mainEle.innerHTML = "";

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const todayIs = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
    const monthName = [
      "一月", "二月", "三月", "四月", "五月", "六月",
      "七月", "八月", "九月", "十月", "十一月", "十二月",
    ][currentMonth];

    // 单文档（1×1）：让格子铺满整个工作区高度
    const isDoc = this.type === "SINGLE" || (this.width === 1 && this.height === 1);

    // 桌面端使用 CSS grid 模板；移动/平板由 CSS 控制布局
    if (!ComponentTextareaContainer.isMobile()) {
      if (isDoc) {
        mainEle.style.gridTemplateColumns = "1fr";
        mainEle.style.gridTemplateRows = "1fr";
      } else {
        mainEle.style.gridTemplateColumns = `repeat(${this.width}, 1fr)`;
        mainEle.style.gridTemplateRows = `repeat(${this.height}, auto)`;
      }
    } else {
      mainEle.style.gridTemplateColumns = "";
      mainEle.style.gridTemplateRows = "";
    }

    const self = this;
    const panel = JSON_STORAGE.getPanel(this.title);
    const cells = panel && Array.isArray(panel.cells) ? panel.cells : [];
    const total = this.width * this.height;
    for (let i = 0; i < total; i++) {
      const value = cells[i] === undefined ? "" : cells[i];

      // 容器：默认显示渲染视图，双击进入编辑
      const cell = document.createElement("div");
      cell.className = "cell is-render" + (isDoc ? " is-doc" : "");
      cell.dataset.index = i;

      // 渲染视图（markdown）
      const render = document.createElement("div");
      render.className = "cell-render";
      render.innerHTML = value ? Markdown.render(value) : "";
      if (!value) render.classList.add("is-empty");

      // 编辑视图（textarea）
      const edit = document.createElement("textarea");
      edit.className = "cell-edit";
      edit.placeholder = "记点什么…（双击编辑，支持 # 标题、**加粗** 等）";
      edit.value = value;

      // 今日高亮
      if (this.type === "WEEK") {
        if (value.split("\n")[0] === todayIs) cell.classList.add("is-today");
      } else if (this.type === "MOON") {
        const dateStr = value.split("\n")[0].split(" ")[0];
        if (dateStr === `${currentMonth + 1}月${currentDay}日`) cell.classList.add("is-today");
      } else if (this.type === "YEAR") {
        if (value.split("\n")[0] === monthName) cell.classList.add("is-today");
      }

      // 双击进入编辑（点击链接不触发）
      cell.addEventListener("dblclick", (e) => {
        if (e.target.closest("a")) return;
        enterEdit();
      });

      // Tab 键插入制表符 / Esc 退回渲染
      edit.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const s = edit.selectionStart;
          const en = edit.selectionEnd;
          edit.value = edit.value.slice(0, s) + "\t" + edit.value.slice(en);
          edit.setSelectionRange(s + 1, s + 1);
        } else if (e.key === "Escape") {
          e.preventDefault();
          exitEdit();
        }
      });

      // 输入即存 + 移动端实时自适应
      edit.addEventListener("input", (e) => {
        saveCell(e.target.value);
        if (ComponentTextareaContainer.isMobile()) {
          ComponentTextareaContainer.autoSizeTextarea(e.target);
        }
      });

      // 失焦保存并退回渲染
      edit.addEventListener("blur", exitEdit);

      // —— 双态辅助函数（闭包，绑定当前格子）——
      function enterEdit() {
        cell.classList.remove("is-render");
        cell.classList.add("is-editing");
        edit.focus();
        const len = edit.value.length;
        edit.setSelectionRange(len, len);
      }
      function exitEdit() {
        if (!cell.classList.contains("is-editing")) return;
        saveCell(edit.value);
        cell.classList.remove("is-editing");
        cell.classList.add("is-render");
      }
      function saveCell(val) {
        const p = JSON_STORAGE.getPanel(self.title);
        if (!p) return;
        p.cells[i] = val;
        JSON_STORAGE.setPanel(self.title, p);
        render.innerHTML = val ? Markdown.render(val) : "";
        render.classList.toggle("is-empty", !val);
        EventBus.emit("cell:change", { panel: self.title, index: i });
      }

      cell.appendChild(render);
      cell.appendChild(edit);
      mainEle.appendChild(cell);
    }

    if (ComponentTextareaContainer.isMobile()) {
      requestAnimationFrame(() => {
        mainEle
          .querySelectorAll(".cell-edit")
          .forEach((n) => ComponentTextareaContainer.autoSizeTextarea(n));
      });
    }
  }
}
