/**
 * 右键上下文菜单组件
 * 用法: ContextMenu.show(x, y, items) / ContextMenu.hide()
 *
 * items 格式:
 *   { label, icon?, shortcut?, danger?, action? }
 *   { separator: true }
 */
const ContextMenu = (() => {
  let menu = null;

  function init() {
    if (menu) return;
    menu = document.createElement("div");
    menu.className = "context-menu";
    menu.id = "context-menu";
    document.body.appendChild(menu);

    // 点击/右键其他地方关闭
    document.addEventListener("click", (e) => {
      if (menu.contains(e.target)) return;
      hide();
    });
    document.addEventListener("contextmenu", (e) => {
      // 不在菜单本身上右键时关闭
      if (menu.contains(e.target)) return;
      hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
    // 窗口尺寸变化时关闭
    window.addEventListener("resize", hide);
  }

  function show(x, y, items) {
    init();
    menu.innerHTML = "";
    menu.style.display = "block";

    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "context-menu__separator";
        menu.appendChild(sep);
        return;
      }

      const el = document.createElement("div");
      el.className = "context-menu__item" + (item.danger ? " is-danger" : "");

      if (item.icon) {
        const icon = document.createElement("span");
        icon.className = "context-menu__icon";
        icon.innerHTML = item.icon;
        el.appendChild(icon);
      }

      const label = document.createElement("span");
      label.className = "context-menu__label";
      label.textContent = item.label;
      el.appendChild(label);

      if (item.shortcut) {
        const kbd = document.createElement("kbd");
        kbd.className = "context-menu__shortcut";
        kbd.textContent = item.shortcut;
        el.appendChild(kbd);
      }

      if (item.action) {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          hide();
          item.action();
        });
      }

      menu.appendChild(el);
    });

    // 智能定位：不超出视口
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      let left = x;
      let top = y;

      if (left + rect.width > window.innerWidth) {
        left = window.innerWidth - rect.width - 8;
      }
      if (top + rect.height > window.innerHeight) {
        top = window.innerHeight - rect.height - 8;
      }
      left = Math.max(4, left);
      top = Math.max(4, top);

      menu.style.left = left + "px";
      menu.style.top = top + "px";
    });
  }

  function hide() {
    if (menu) {
      menu.style.display = "none";
    }
  }

  return { init, show, hide };
})();
