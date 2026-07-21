/**
 * 轻量发布订阅事件总线，用于组件间解耦通信。
 * 例如：面板新建后广播 "panel:created"，导航栏与宫格各自响应刷新。
 */
const EventBus = (() => {
  const listeners = new Map();

  return {
    /** 订阅事件 @returns {Function} 取消订阅函数 */
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    /** 单次订阅 */
    once(event, handler) {
      const off = this.on(event, (payload) => {
        off();
        handler(payload);
      });
      return off;
    },
    /** 广播事件 */
    emit(event, payload) {
      listeners.get(event)?.forEach((h) => {
        try {
          h(payload);
        } catch (e) {
          console.error(`[EventBus] handler error for "${event}":`, e);
        }
      });
    },
  };
})();
