(function () {
  'use strict';

  const NODE_LIMIT = 2000;
  const ROOT_PATH = '[]';
  const STYLE_ID = 'snapshot-tree-styles';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .snapshot-tree{font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;color:#b7c8dd;overflow:auto;overscroll-behavior:contain;scrollbar-color:#31445e transparent;min-height:80px}
      .snapshot-tree .st-list{list-style:none;margin:0;padding:0}
      .snapshot-tree .st-children{list-style:none;margin:0 0 0 9px;padding:0 0 0 14px;border-left:1px solid #243347}
      .snapshot-tree .st-entry{margin:0;padding:0;position:relative}
      .snapshot-tree .st-children>.st-entry:before{content:"";position:absolute;left:-14px;top:14px;width:10px;height:1px;background:#243347}
      .snapshot-tree .st-row{display:flex;align-items:flex-start;gap:7px;min-height:29px;padding:4px 5px;border-radius:4px;min-width:0}
      .snapshot-tree .st-row:hover{background:#152236}
      .snapshot-tree .st-branch{appearance:none;border:0;background:transparent;color:inherit;text-align:left;width:100%;font:inherit;cursor:pointer}
      .snapshot-tree .st-branch:focus-visible{outline:1px solid #55bdb5;outline-offset:-1px;background:#142c3b}
      .snapshot-tree .st-chevron{display:inline-block;flex:0 0 9px;width:9px;height:15px;color:#5b768e;font:14px/17px sans-serif;transition:transform .12s}
      .snapshot-tree .st-branch[aria-expanded=true]>.st-chevron{transform:rotate(90deg)}
      .snapshot-tree .st-spacer{flex:0 0 9px;width:9px}
      .snapshot-tree .st-key{color:#b9cee5;overflow-wrap:anywhere;flex:0 1 auto}
      .snapshot-tree .st-index{color:#8ca3bf}
      .snapshot-tree .st-colon{color:#536c87;flex:0 0 auto}
      .snapshot-tree .st-value{overflow-wrap:anywhere;white-space:pre-wrap;min-width:0}
      .snapshot-tree .st-string{color:#80cba8}
      .snapshot-tree .st-number{color:#82b9f2}
      .snapshot-tree .st-boolean{color:#c5a0ea}
      .snapshot-tree .st-null,.snapshot-tree .st-undefined{color:#b59b73}
      .snapshot-tree .st-container{color:#7290af;white-space:nowrap;flex:0 0 auto;font-size:11px}
      .snapshot-tree .st-empty{color:#657c94}
      .snapshot-tree .st-circular{color:#d3a274;font-style:italic}
      .snapshot-tree .st-message{margin:10px 0;padding:9px 10px;border:1px solid #354052;border-radius:6px;color:#b4a181;background:#151e2c;font:12px/1.7 system-ui,sans-serif}
      @media(prefers-reduced-motion:reduce){.snapshot-tree .st-chevron{transition:none}}
    `;
    document.head.append(style);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isContainer(value) {
    return value !== null && typeof value === 'object';
  }

  class SnapshotTree {
    constructor(container) {
      if (!(container instanceof Element)) throw new TypeError('SnapshotTree 需要一个容器元素');
      addStyles();
      this.container = container;
      this.container.classList.add('snapshot-tree');
      this.expanded = new Set([ROOT_PATH]);
      this.value = null;
      this.hasValue = false;
      this.clickHandler = (event) => {
        const button = event.target.closest('button[data-tree-path]');
        if (!button || !this.container.contains(button)) return;
        const path = button.dataset.treePath;
        if (this.expanded.has(path)) this.expanded.delete(path);
        else this.expanded.add(path);
        this.render(path);
      };
      this.container.addEventListener('click', this.clickHandler);
    }

    update(value) {
      this.value = value;
      this.hasValue = true;
      this.render();
    }

    expandAll() {
      this.expanded.clear();
      const visited = new WeakSet();
      let count = 0;
      const visit = (value, path) => {
        count += 1;
        if (count > NODE_LIMIT || !isContainer(value) || visited.has(value)) return;
        visited.add(value);
        this.expanded.add(JSON.stringify(path));
        for (const key of Object.keys(value)) {
          if (count >= NODE_LIMIT) break;
          visit(value[key], path.concat(key));
        }
      };
      visit(this.value, []);
      this.render();
    }

    collapseAll() {
      this.expanded.clear();
      this.render();
    }

    render(focusPath) {
      if (!this.hasValue) return;
      const scrollTop = this.container.scrollTop;
      const scrollLeft = this.container.scrollLeft;
      const focused = this.container.contains(document.activeElement)
        ? document.activeElement.dataset.treePath : null;
      const preferredFocus = focusPath ?? focused;
      const fragment = document.createDocumentFragment();
      const root = element('ul', 'st-list');
      root.setAttribute('aria-label', '结构化 JSON 数据');
      const buttons = new Map();
      let rendered = 0;
      let truncated = false;

      const appendNode = (parent, value, key, path, ancestors, arrayMember = false) => {
        if (rendered >= NODE_LIMIT) { truncated = true; return; }
        rendered += 1;
        const entry = element('li', 'st-entry');
        parent.append(entry);
        const pathKey = JSON.stringify(path);
        const circular = isContainer(value) && ancestors.has(value);
        const keys = isContainer(value) && !circular ? Object.keys(value) : [];
        const expandable = keys.length > 0;
        const row = element(expandable ? 'button' : 'div', 'st-row' + (expandable ? ' st-branch' : ''));
        if (expandable) {
          row.type = 'button';
          row.dataset.treePath = pathKey;
          row.setAttribute('aria-expanded', String(this.expanded.has(pathKey)));
          const chevron = element('span', 'st-chevron', '›');
          chevron.setAttribute('aria-hidden', 'true');
          row.append(chevron);
          buttons.set(pathKey, row);
        } else {
          row.append(element('span', 'st-spacer'));
        }
        row.append(element('span', 'st-key' + (arrayMember ? ' st-index' : ''), key));
        row.append(element('span', 'st-colon', ':'));
        entry.append(row);

        if (circular) {
          row.append(element('span', 'st-value st-circular', '[循环引用]'));
          return;
        }
        if (isContainer(value)) {
          const delimiters = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
          const description = keys.length ? `${delimiters[0]} ${keys.length} 项 ${delimiters[1]}` : delimiters.join('');
          row.append(element('span', 'st-container' + (!keys.length ? ' st-empty' : ''), description));
          if (!this.expanded.has(pathKey) || !keys.length) return;
          const children = element('ul', 'st-children');
          entry.append(children);
          const nextAncestors = new Set(ancestors).add(value);
          for (const childKey of keys) {
            if (rendered >= NODE_LIMIT) { truncated = true; break; }
            appendNode(children, value[childKey], childKey, path.concat(childKey), nextAncestors, Array.isArray(value));
          }
          return;
        }
        const type = value === null ? 'null' : typeof value;
        const text = type === 'string' ? JSON.stringify(value) : String(value);
        row.append(element('span', `st-value st-${type}`, text));
      };

      appendNode(root, this.value, 'snapshot', [], new Set());
      fragment.append(root);
      if (truncated) {
        const message = element('p', 'st-message', `当前最多展示 ${NODE_LIMIT} 个节点。折叠前面的分支后，可继续展开其他字段。完整内容可从统一 JSON 下载。`);
        message.setAttribute('role', 'status');
        fragment.append(message);
      }
      this.container.replaceChildren(fragment);
      if (preferredFocus && buttons.has(preferredFocus)) buttons.get(preferredFocus).focus({preventScroll: true});
      this.container.scrollTop = scrollTop;
      this.container.scrollLeft = scrollLeft;
    }

    destroy() {
      this.container.removeEventListener('click', this.clickHandler);
      this.container.replaceChildren();
      this.container.classList.remove('snapshot-tree');
    }
  }

  window.SnapshotTree = SnapshotTree;
}());
