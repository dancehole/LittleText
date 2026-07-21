/**
 * 可复用模态层控制器。
 * 通过 id 绑定 index.html 中的 .modal-overlay 节点，
 * 自动处理：打开/关闭动画、遮罩点击关闭、Esc 关闭、焦点管理。
 */
const Modal = (() => {
  const registry = new Map();
  let activeModal = null;

  function bind(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return null;
    const api = {
      id,
      overlay,
      open() {
        if (activeModal && activeModal !== api) activeModal.close();
        activeModal = api;
        overlay.classList.add("is-open");
        overlay.setAttribute("aria-hidden", "false");
        // 锁定背景滚动
        document.body.style.overflow = "hidden";
        EventBus.emit("modal:open", id);
      },
      close() {
        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        if (activeModal === api) activeModal = null;
        // 仅当没有其它打开的弹窗时恢复滚动
        if (!activeModal) document.body.style.overflow = "";
        EventBus.emit("modal:close", id);
      },
      isOpen() {
        return overlay.classList.contains("is-open");
      },
    };

    // 点击遮罩（非弹窗本体）关闭
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) api.close();
    });
    // 内部的 data-modal-close 关闭按钮
    overlay.querySelectorAll("[data-modal-close]").forEach((btn) => {
      btn.addEventListener("click", () => api.close());
    });

    registry.set(id, api);
    return api;
  }

  // 全局 Esc 关闭当前弹窗
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeModal) activeModal.close();
  });

  /**
   * 动态生成确认弹窗（替换原生 confirm）。
   * @param {Object} opt
   * @param {string} opt.title
   * @param {string} opt.message
   * @param {string} [opt.confirmText]
   * @param {boolean} [opt.danger]
   * @param {() => void} opt.onConfirm
   * @param {() => void} [opt.onCancel]
   */
  function confirm(opt) {
    const overlay = el("div", "modal-overlay");
    overlay.style.zIndex = "60";
    const node = el("div", "modal");
    node.setAttribute("role", "alertdialog");
    node.setAttribute("aria-modal", "true");
    node.innerHTML =
      `<div class="modal__header"><h2 class="modal__title"></h2></div>` +
      `<div class="modal__body"><p style="color:var(--text-secondary)"></p></div>` +
      `<div class="modal__footer">` +
      `<button class="btn btn--ghost" data-cancel>取消</button>` +
      `<button class="btn ${opt.danger ? "btn--danger" : "btn--primary"}" data-confirm></button>` +
      `</div>`;
    node.querySelector(".modal__title").textContent = opt.title || "请确认";
    node.querySelector(".modal__body p").textContent = opt.message || "";
    node.querySelector("[data-confirm]").textContent = opt.confirmText || "确定";

    const close = () => {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 400);
    };
    const onConfirm = () => {
      close();
      opt.onConfirm && opt.onConfirm();
    };
    node.querySelector("[data-confirm]").addEventListener("click", onConfirm);
    node.querySelector("[data-cancel]").addEventListener("click", () => {
      close();
      opt.onCancel && opt.onCancel();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        close();
        opt.onCancel && opt.onCancel();
      }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        close();
        opt.onCancel && opt.onCancel();
        document.removeEventListener("keydown", esc);
      }
    });
  }

  return {
    bind,
    get(id) {
      return registry.get(id) || bind(id);
    },
    /** 关闭所有已打开的模态层 */
    closeAll() {
      if (activeModal) activeModal.close();
    },
    confirm,
  };
})();
