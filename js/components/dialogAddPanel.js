/**
 * 新建面板逻辑。面板类型以可扩展的注册表方式维护。
 */
const PANEL_TYPES = {
  CLASSICS: { name: "经典六宫格", width: 3, height: 2 },
  SINGLE: { name: "单文档", width: 1, height: 1 },
  LEFT_RIGHT: { name: "左右分屏", width: 2, height: 1 },
  CROSS: { name: "十字格", width: 2, height: 2 },
  EIGHT: { name: "八宫格", width: 4, height: 2 },
  NINE: { name: "九宫格", width: 3, height: 3 },
  WEEK: { name: "一周七天", width: 7, height: 1 },
  MOON: { name: "一月表格", width: 7, height: 6 },
  YEAR: { name: "一年十二月", width: 4, height: 3 },
};

const DIALOG_ADD_PANEL = (() => {
  let modal, selectEle, titleInput;
  let title = "";
  let currentSelect = "CLASSICS";
  // 当前类型对应的默认名称，用于在用户未手动修改时跟随类型切换
  let lastDefault = PANEL_TYPES[currentSelect].name;

  /** 取某类型的默认面板名（即类型名） */
  function defaultNameOf(select) {
    return PANEL_TYPES[select].name;
  }

  function init() {
    modal = Modal.get("add-panel");
    selectEle = document.getElementById("panel-type");
    titleInput = document.getElementById("panel-name");

    // 填充类型选项
    for (const key in PANEL_TYPES) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = PANEL_TYPES[key].name;
      selectEle.appendChild(opt);
    }
    selectEle.value = currentSelect;

    titleInput.addEventListener("input", (e) => (title = e.target.value.trim()));
    selectEle.addEventListener("change", (e) => {
      currentSelect = e.target.value;
      const def = defaultNameOf(currentSelect);
      // 名称仍为上一类型的默认名时，同步为新类型默认名
      if (titleInput.value === lastDefault) {
        titleInput.value = def;
        title = def;
      }
      lastDefault = def;
    });

    document.getElementById("panel-create").addEventListener("click", create);
  }

  function open() {
    const def = defaultNameOf(currentSelect);
    titleInput.value = def;
    title = def;
    lastDefault = def;
    selectEle.value = currentSelect;
    modal.open();
    setTimeout(() => titleInput.focus(), 50);
  }

  function create() {
    if (title === "") {
      Toast.show("面板名称不能为空", "warning");
      return;
    }
    if (ComponentTextareaContainer.isRepeat(title)) {
      Toast.show("面板名称已存在", "warning");
      return;
    }
    const type = PANEL_TYPES[currentSelect];
    // 月历高度由实际周数决定（不污染共享注册表 PANEL_TYPES）
    let height = type.height;
    if (currentSelect === "MOON") {
      const d = new Date();
      height = Math.ceil(generateCalendarArray(d.getFullYear(), d.getMonth()).length / 7);
    }
    const content = generateDefaultContent(currentSelect);
    const panel = new ComponentTextareaContainer(title, type.width, height, currentSelect);
    panel.create(content);
    modal.close();

    GLOBAL_DATA.update("currentPanel", title);
    NAV_LIST.refresh();
    ComponentTextareaContainer.refreshDomByPanelName(title);
    EventBus.emit("panel:created", title);
    Toast.show(`已创建【${title}】`, "success");
  }

  /** 部分内置类型自带初始内容 */
  function generateDefaultContent(select) {
    if (select === "WEEK") {
      return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((d) => d + "\n\n");
    }
    if (select === "MOON") {
      const d = new Date();
      return generateCalendarArray(d.getFullYear(), d.getMonth());
    }
    if (select === "YEAR") {
      return [
        "一月", "二月", "三月", "四月", "五月", "六月",
        "七月", "八月", "九月", "十月", "十一月", "十二月",
      ].map((m) => m + "\n\n");
    }
    return null;
  }

  return { init, open };
})();

/**
 * 生成某月日历一维数组（周一起始），前后以空串填充。
 */
function generateCalendarArray(year, month) {
  const daysOfWeek = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startingIndex = firstDay === 0 ? 6 : firstDay - 1;
  const calendar = [];
  for (let i = 0; i < startingIndex; i++) calendar.push("");
  for (let day = 1; day <= totalDays; day++) {
    const dow = daysOfWeek[new Date(year, month, day).getDay()];
    calendar.push(`${month + 1}月${day}日 ${dow}\n\n`);
  }
  const weeksNum = Math.ceil((startingIndex + totalDays) / 7);
  while (calendar.length < 7 * weeksNum) calendar.push("");
  return calendar;
}
