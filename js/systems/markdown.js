/**
 * 安全 Markdown 渲染器（零依赖纯函数）
 *
 * 安全性设计：
 * 1. 用户输入先做 HTML 转义，所有 < > & " ' 都会被转义成实体，
 *    因此 <script>、<img onerror> 等都会变成「可见文本」而绝不会被执行。
 * 2. 渲染只输出白名单标签（strong/em/code/h1/h2/a/img/ul/li/blockquote/hr/br/p）。
 * 3. 链接 / 图片 URL 走协议白名单（http/https，图片额外允许 data:image/*），
 *    拒绝 javascript:/data:(非图片)/vbscript: 等危险协议。
 *
 * 支持的语法（保持「空间有限」的轻量目标）：
 *   # 标题1  ## 标题2  ### 标题3  #### 标题4  ##### 标题5   （h3~h5 视觉仅加粗）
 *   **加粗**  *斜体*  `行内代码`
 *   [文字](https://...)           （安全链接，新窗口打开，rel=noopener）
 *   ![说明](https://...png)       （图片）
 *   - 列表项  /  * 列表项        （无序列表）
 *   > 引用行
 *   ``` 或 ```js                  （围栏代码块，无语法高亮，仅独特背景）
 *   ---  /  ------              （分隔线，同一行 >=3 个连续的 -）
 *   空行分段
 */
(function (global) {
  "use strict";

  /** HTML 转义：把用户输入的敏感字符变成实体 */
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 校验 URL 协议是否在白名单内 */
  function safeUrl(url, allowDataImage) {
    const raw = (url || "").trim();
    if (!raw) return "";
    // 去掉可能被利用的空白/控制字符
    const clean = raw.replace(/[\u0000-\u0020\u007f]/g, "");
    if (/^(https?:)/i.test(clean)) return clean;
    if (allowDataImage && /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(clean)) {
      return clean;
    }
    return ""; // 拒绝 javascript:/vbscript:/data:(非图片) 等
  }

  /** 行内语法：加粗 / 斜体 / 行内代码 / 链接 / 图片 */
  function renderInline(text) {
    let out = escapeHtml(text);

    // 行内代码：`code` —— 先处理，避免其中内容被其它规则误伤
    out = out.replace(/`([^`\n]+)`/g, function (_, code) {
      return "<code>" + code + "</code>";
    });

    // 图片：![alt](url)
    out = out.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, function (_, alt, url) {
      const safe = safeUrl(url, true);
      if (!safe) return "![图片链接不合法]";
      return '<img class="md-img" src="' + safe + '" alt="' + alt + '">';
    });

    // 链接：[text](url)
    out = out.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, function (_, label, url) {
      const safe = safeUrl(url, false);
      if (!safe) return escapeHtml(label); // 不安全则退化为纯文本
      return (
        '<a class="md-link" href="' +
        safe +
        '" target="_blank" rel="noopener noreferrer">' +
        label +
        "</a>"
      );
    });

    // 加粗：**text**
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    // 斜体：*text*（在加粗之后，避免吞掉 **）
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

    return out;
  }

  /** 渲染多行 markdown 文本为 HTML 字符串 */
  function render(src) {
    if (src == null) return "";
    const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let i = 0;
    let listOpen = false;

    function closeList() {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
    }

    while (i < lines.length) {
      let line = lines[i];

      // 分隔线：同一行内 >=3 个连续的 - （允许前后空白）
      if (/^\s*-{3,}\s*$/.test(line)) {
        closeList();
        html.push("<hr class='md-hr'>");
        i++;
        continue;
      }

      // 标题（最多五级：# ~ #####；h3/h4/h5 视觉上仅加粗，但保持正确标签）
      let m = line.match(/^(#{1,5})\s+(.*)$/);
      if (m) {
        closeList();
        const level = m[1].length; // 1~5
        const tag = "h" + level;
        html.push(
          "<" + tag + " class='md-h md-h" + level + "'>" +
            renderInline(m[2].trim()) +
            "</" + tag + ">"
        );
        i++;
        continue;
      }

      // 围栏代码块：以 ```（可带语言名，如 ```js）开头，遇到单独一行的 ``` 结束
      m = line.match(/^`{3,}\s*([^\s`]*)\s*$/);
      if (m) {
        closeList();
        const lang = m[1] || "";
        const codeLines = [];
        i++; // 跳过起始围栏
        while (i < lines.length && !/^`{3,}\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // 跳过结束围栏（若存在）
        const codeHtml = escapeHtml(codeLines.join("\n"));
        const langTag = lang
          ? "<div class='md-pre__lang'>" + escapeHtml(lang) + "</div>"
          : "";
        html.push(
          "<pre class='md-pre'>" + langTag + "<code>" + codeHtml + "</code></pre>"
        );
        continue;
      }

      // 引用
      m = line.match(/^>\s?(.*)$/);
      if (m) {
        closeList();
        html.push("<blockquote class='md-quote'>" + renderInline(m[1]) + "</blockquote>");
        i++;
        continue;
      }

      // 无序列表
      m = line.match(/^\s*[-*]\s+(.*)$/);
      if (m) {
        if (!listOpen) {
          html.push("<ul class='md-ul'>");
          listOpen = true;
        }
        html.push("<li>" + renderInline(m[1]) + "</li>");
        i++;
        continue;
      }

      // 空行：作为段落分隔
      if (/^\s*$/.test(line)) {
        closeList();
        i++;
        continue;
      }

      // 普通段落（可能连续多行合并为一个 <p>，用 <br> 连接）
      closeList();
      const para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,5})\s+/.test(lines[i]) &&
             !/^`{3,}\s*$/.test(lines[i]) &&
             !/^>\s?/.test(lines[i]) &&
             !/^\s*[-*]\s+/.test(lines[i]) &&
             !/^\s*-{3,}\s*$/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      html.push("<p class='md-p'>" + renderInline(para.join("\n")).replace(/\n/g, "<br>") + "</p>");
    }
    closeList();
    return html.join("");
  }

  const Markdown = { render: render, escapeHtml: escapeHtml };
  global.Markdown = Markdown;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Markdown;
  }
})(typeof window !== "undefined" ? window : globalThis);
