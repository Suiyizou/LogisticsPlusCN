// @ts-check
/** URL/Markdown and DOM serialization share one origin policy without browser globals.
 * @param {{ getOrigin: () => string }} ports */
export function createAnnouncementPresentation({ getOrigin }) {
  /** @param {Node} editor @returns {string} */
  function announcementEditorToMarkdown(editor) {
    const blocks = Array.from(editor.childNodes)
      .map((node) => announcementBlockToMarkdown(node))
      .filter((value) => value.trim());
    return blocks
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /** @param {Node} node @returns {string} */
  function announcementBlockToMarkdown(node) {
    if (node.nodeType === 3) return announcementTextValue(node.textContent);
    if (node.nodeType !== 1) return "";
    const element = /** @type {Element} */ (node);
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = Math.max(1, Math.min(4, Number(tag.slice(1))));
      return `${"#".repeat(level)} ${announcementInlineChildren(node).trim()}`;
    }
    if (tag === "ul" || tag === "ol") {
      return Array.from(element.children)
        .filter((item) => item.tagName?.toLowerCase() === "li")
        .map(
          (item, index) =>
            `${tag === "ol" ? `${index + 1}.` : "-"} ${announcementInlineChildren(item).trim()}`
        )
        .join("\n");
    }
    if (tag === "blockquote") {
      return announcementInlineChildren(node)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    if (tag === "pre") return `\`\`\`\n${node.textContent || ""}\n\`\`\``;
    if (tag === "br") return "";
    return announcementInlineChildren(node).trim();
  }

  /** @param {Node} node @returns {string} */
  function announcementInlineChildren(node) {
    return Array.from(node.childNodes).map(announcementInlineNodeToMarkdown).join("");
  }

  /** @param {Node} node @returns {string} */
  function announcementInlineNodeToMarkdown(node) {
    if (node.nodeType === 3) return announcementTextValue(node.textContent);
    if (node.nodeType !== 1) return "";
    const element = /** @type {Element} */ (node);
    const tag = element.tagName.toLowerCase();
    const content = announcementInlineChildren(node);
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return content ? `**${content}**` : "";
    if (tag === "em" || tag === "i") return content ? `*${content}*` : "";
    if (tag === "code") return content ? `\`${content}\`` : "";
    if (tag === "a") {
      const raw = element.getAttribute("href") || "";
      const safe = safeAnnouncementUrl(raw);
      return safe ? `[${content || safe}](${announcementPortableUrl(raw, safe)})` : content;
    }
    if (tag === "img") {
      const raw = element.getAttribute("src") || "";
      const safe = safeAnnouncementUrl(raw);
      const alt = String(element.getAttribute("alt") || "illustration")
        .replaceAll("[", "")
        .replaceAll("]", "");
      return safe ? `![${alt}](${announcementPortableUrl(raw, safe)})` : "";
    }
    return content;
  }

  /** @param {unknown} value */
  function announcementTextValue(value) {
    return String(value || "").replace(/\u00a0/g, " ");
  }

  /** @param {string} raw @param {string} safe */
  function announcementPortableUrl(raw, safe) {
    try {
      const parsed = new URL(safe, getOrigin());
      if (
        parsed.origin === getOrigin() &&
        parsed.pathname.startsWith("/api/public/announcement-images/")
      ) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return safe;
    }
    return String(raw || "").trim() || safe;
  }

  /** @param {unknown} value */
  function safeAnnouncementUrl(value) {
    const source = String(value || "")
      .trim()
      .replace(/&amp;/g, "&");
    if (!source) return "";
    try {
      const url = new URL(source, getOrigin());
      if (!["http:", "https:"].includes(url.protocol)) return "";
      const storedImage = url.pathname.match(
        /\/(?:tracking\/)?api\/public\/announcement-images\/([a-f0-9]{32}\.(?:jpe?g|png|gif))$/i
      );
      if (storedImage) {
        return new URL(`/api/public/announcement-images/${storedImage[1]}`, getOrigin()).href;
      }
      return url.href;
    } catch {
      return "";
    }
  }

  /** @param {{ imageUrl?: string | null } | null} record */
  function announcementImageUrl(record) {
    return safeAnnouncementUrl(record?.imageUrl);
  }

  /** @param {unknown} value */
  function announcementExcerpt(value) {
    const text = String(value || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#>*_`~-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 72 ? `${text.slice(0, 72)}…` : text || "-";
  }

  /** @param {unknown} value */
  function escapeAnnouncementHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** @param {unknown} value */
  function renderAnnouncementInline(value) {
    /** @type {string[]} */
    const tokens = [];
    /** @param {string} html */
    const stash = (html) => {
      const index = tokens.push(html) - 1;
      return `\u0000${index}\u0000`;
    };
    let output = escapeAnnouncementHtml(value);
    output = output.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${code}</code>`));
    output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, source) => {
      const url = safeAnnouncementUrl(source);
      if (!url) return match;
      return stash(
        `<img src="${escapeAnnouncementHtml(url)}" alt="${escapeAnnouncementHtml(alt)}" loading="lazy">`
      );
    });
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, source) => {
      const url = safeAnnouncementUrl(source);
      if (!url) return match;
      return stash(
        `<a href="${escapeAnnouncementHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      );
    });
    output = output
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Scan paired internal delimiters without treating authored markup as HTML.
    const parts = output.split("\u0000");
    let restored = parts[0];
    for (let index = 1; index < parts.length; index++) {
      if (index + 1 < parts.length && /^\d+$/.test(parts[index])) {
        restored += tokens[Number(parts[index])] || "";
        index++;
      } else {
        restored += "\u0000";
      }
      restored += parts[index];
    }
    return restored;
  }

  /** @param {unknown} value */
  function renderAnnouncementMarkdown(value) {
    const lines = String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    /** @type {string[]} */
    const html = [];
    let listType = "";
    /** @type {string[] | null} */
    let codeLines = null;
    const closeList = () => {
      if (!listType) return;
      html.push(`</${listType}>`);
      listType = "";
    };
    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        if (codeLines) {
          html.push(`<pre><code>${escapeAnnouncementHtml(codeLines.join("\n"))}</code></pre>`);
          codeLines = null;
        } else {
          closeList();
          codeLines = [];
        }
        continue;
      }
      if (codeLines) {
        codeLines.push(line);
        continue;
      }
      if (!line.trim()) {
        closeList();
        continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length + 1;
        html.push(`<h${level}>${renderAnnouncementInline(heading[2])}</h${level}>`);
        continue;
      }
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      const item = unordered || ordered;
      if (item) {
        const nextType = unordered ? "ul" : "ol";
        if (listType !== nextType) {
          closeList();
          listType = nextType;
          html.push(`<${nextType}>`);
        }
        html.push(`<li>${renderAnnouncementInline(item[1])}</li>`);
        continue;
      }
      closeList();
      const quote = line.match(/^\s*>\s?(.+)$/);
      html.push(
        quote
          ? `<blockquote>${renderAnnouncementInline(quote[1])}</blockquote>`
          : `<p>${renderAnnouncementInline(line)}</p>`
      );
    }
    if (codeLines)
      html.push(`<pre><code>${escapeAnnouncementHtml(codeLines.join("\n"))}</code></pre>`);
    closeList();
    return html.join("");
  }

  return {
    announcementEditorToMarkdown,
    announcementPortableUrl,
    safeAnnouncementUrl,
    announcementImageUrl,
    announcementExcerpt,
    escapeAnnouncementHtml,
    renderAnnouncementMarkdown
  };
}
