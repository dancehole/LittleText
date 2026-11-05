/**
 * Cookie 读写工具。
 *
 * 云同步的「同步地址 / 同步令牌」改用 cookie 保存，原因有二：
 *  1) 浏览器的表单自动填充（autofill / 密码管理器）只针对 <input> 元素，
 *     与数据存放在 localStorage 还是 cookie 无关；把数据放进 cookie 后，
 *     Edge 不会对 cookie 做自动填充，配置也就不会被它改动。
 *  2) cookie 不受「清除浏览器数据 → 保留密码」这类策略影响，跨会话更稳。
 *
 * 同时 cloudSync.js 仍会把值回写到 localStorage 作为兜底（file:// 本地打开时
 * cookie 可能不可用），读取时优先取 cookie。
 */
const COOKIE = (() => {
  const ONE_DAY = 24 * 60 * 60 * 1000;

  /**
   * 写入 cookie
   * @param {string} name
   * @param {string} value
   * @param {object} [opts]
   * @param {number} [opts.days=365] 有效期（天）
   * @param {string} [opts.path='/'] 作用路径
   */
  function set(name, value, opts = {}) {
    const days = opts.days != null ? opts.days : 365;
    const path = opts.path != null ? opts.path : "/";
    const expires = new Date(Date.now() + days * ONE_DAY).toUTCString();
    const safe = encodeURIComponent(value == null ? "" : String(value));
    document.cookie =
      name + "=" + safe + "; expires=" + expires + "; path=" + path + "; SameSite=Lax";
  }

  /**
   * 读取 cookie
   * @param {string} name
   * @returns {string|null}
   */
  function get(name) {
    if (!document.cookie) return null;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /**
   * 删除 cookie
   * @param {string} name
   * @param {string} [path='/']
   */
  function remove(name, path = "/") {
    document.cookie =
      name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=" + path + "; SameSite=Lax";
  }

  return { set, get, remove };
})();
