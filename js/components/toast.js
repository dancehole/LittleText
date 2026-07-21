/**
 * Toast 轻提示通知，替换原生 alert / confirm 之外的信息反馈。
 * 用法：Toast.show("已保存", "success")
 */
const Toast = (() => {
  const stack = () => document.getElementById("toast-stack");
  const ICON = {
    success: ICONS.check,
    error: ICONS.alert,
    warning: ICONS.alert,
    info: ICONS.info,
  };

  /**
   * @param {string} message
   * @param {"success"|"error"|"warning"|"info"} [type]
   * @param {number} [duration] 毫秒，默认 3200
   */
  function show(message, type = "info", duration = 3200) {
    const root = stack();
    if (!root) return;

    const node = el("div", `toast toast--${type}`);
    node.setAttribute("role", "status");
    node.innerHTML =
      `<span class="toast__icon">${ICON[type] || ICONS.info}</span>` +
      `<span class="toast__msg"></span>`;
    node.querySelector(".toast__msg").textContent = message;
    root.appendChild(node);

    // 触发进入动画
    requestAnimationFrame(() => node.classList.add("is-show"));

    const remove = () => {
      node.classList.remove("is-show");
      node.addEventListener("transitionend", () => node.remove(), { once: true });
      // 兜底移除
      setTimeout(() => node.remove(), 400);
    };
    const timer = setTimeout(remove, duration);
    node.addEventListener("click", () => {
      clearTimeout(timer);
      remove();
    });
  }

  return { show };
})();
