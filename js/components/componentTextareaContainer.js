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
    const nodes = document.querySelectorAll("#workspace .cell");
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
    const obj = JSON_STORAGE.get(`${title}-data`);
    if (obj === null) {
      const res = new ComponentTextareaContainer(title, 3, 2, "CLASSICS");
      res.createTime = new Date();
      JSON_STORAGE.set(`${title}-data`, {
        width: 3,
        height: 2,
        type: "CLASSICS",
        createTime: res.createTime.getTime(),
      });
      return res;
    }
    const res = new ComponentTextareaContainer(title, obj.width, obj.height, obj.type);
    res.createTime = new Date(obj.createTime);
    return res;
  }

  create(defaultContent) {
    const panelList = JSON_STORAGE.get("panelList") || [];
    panelList.push(this.title);
    JSON_STORAGE.set("panelList", panelList);
    JSON_STORAGE.set(`${this.title}-data`, {
      width: this.width,
      height: this.height,
      type: this.type,
      createTime: this.createTime.getTime(),
    });
    for (let i = 0; i < this.width * this.height; i++) {
      JSON_STORAGE.set(
        `${this.title}-text-${i}`,
        defaultContent ? defaultContent[i] : ""
      );
    }
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
    for (let i = 0; i < this.width * this.height; i++) {
      JSON_STORAGE.delete(`${this.title}-text-${i}`);
    }
    JSON_STORAGE.delete(`${this.title}-data`);
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

    // 桌面端使用 CSS grid 模板；移动/平板由 CSS 控制布局
    if (!ComponentTextareaContainer.isMobile()) {
      mainEle.style.gridTemplateColumns = `repeat(${this.width}, 1fr)`;
      mainEle.style.gridTemplateRows = `repeat(${this.height}, auto)`;
    } else {
      mainEle.style.gridTemplateColumns = "";
      mainEle.style.gridTemplateRows = "";
    }

    const total = this.width * this.height;
    for (let i = 0; i < total; i++) {
      const cell = document.createElement("textarea");
      cell.className = "cell";
      cell.placeholder = "记点什么…";
      const value = JSON_STORAGE.get(`${this.title}-text-${i}`);
      cell.value = value === null ? "" : value;

      // 今日高亮
      if (this.type === "WEEK") {
        if (cell.value.split("\n")[0] === todayIs) cell.classList.add("is-today");
      } else if (this.type === "MOON") {
        const dateStr = cell.value.split("\n")[0].split(" ")[0];
        if (dateStr === `${currentMonth + 1}月${currentDay}日`) cell.classList.add("is-today");
      } else if (this.type === "YEAR") {
        if (cell.value.split("\n")[0] === monthName) cell.classList.add("is-today");
      }

      // Tab 键插入制表符
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const s = this.selectionStart;
          const en = this.selectionEnd;
          this.value = this.value.slice(0, s) + "\t" + this.value.slice(en);
          this.setSelectionRange(s + 1, s + 1);
        }
      });

      // 输入即存 + 移动端实时自适应
      cell.addEventListener("input", (e) => {
        JSON_STORAGE.set(`${this.title}-text-${i}`, e.target.value);
        if (ComponentTextareaContainer.isMobile()) {
          ComponentTextareaContainer.autoSizeTextarea(e.target);
        }
        EventBus.emit("cell:change", { panel: this.title, index: i });
      });

      mainEle.appendChild(cell);
    }

    if (ComponentTextareaContainer.isMobile()) {
      requestAnimationFrame(() => {
        mainEle
          .querySelectorAll(".cell")
          .forEach((n) => ComponentTextareaContainer.autoSizeTextarea(n));
      });
    }
  }
}
