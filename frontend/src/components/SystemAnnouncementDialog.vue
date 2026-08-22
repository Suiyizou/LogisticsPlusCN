<template>
  <el-dialog
    :model-value="modelValue"
    class="system-announcement-dialog"
    width="min(1080px, calc(100vw - 48px))"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    :before-close="handleBeforeClose"
    @open-auto-focus="handleOpenAutoFocus"
    @closed="emit('closed')"
  >
    <template #header="{ titleId, titleClass }">
      <div class="system-announcement-head">
        <span class="system-announcement-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 11v2m3-5v8l10 3V5L7 8Zm0 6-1 5h4l1-4" />
          </svg>
        </span>
        <div class="system-announcement-heading">
          <small>{{ copy.eyebrow }}</small>
          <h2 :id="titleId" :class="titleClass">{{ copy.title }}</h2>
        </div>
        <button
          ref="closeButtonRef"
          type="button"
          class="system-announcement-close"
          :aria-label="copy.close"
          @click="dismiss"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </template>

    <div v-if="items.length" class="system-announcement-layout">
      <aside v-if="items.length > 1" class="system-announcement-list" :aria-label="copy.list">
        <button
          v-for="(item, index) in items"
          :key="item.id ?? index"
          type="button"
          :class="{ active: index === activeIndex }"
          :aria-current="index === activeIndex ? 'true' : undefined"
          @click="activeIndex = index"
        >
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <b>{{ item.title || copy.untitled }}</b>
          <i v-if="!item.read" aria-hidden="true"></i>
        </button>
      </aside>

      <article v-if="activeItem" class="system-announcement-content">
        <div class="system-announcement-reading">
          <div class="system-announcement-meta">
            <span>{{ audienceText(activeItem.audience) }}</span>
            <time>{{ dateText(activeItem.displayDate || activeItem.publishedAt || activeItem.createdAt) }}</time>
            <em v-if="!activeItem.read">{{ copy.unread }}</em>
          </div>
          <h3>{{ activeItem.title || copy.untitled }}</h3>
          <img
            v-if="safeImageUrl(activeItem.imageUrl)"
            class="system-announcement-cover"
            :src="safeImageUrl(activeItem.imageUrl)"
            :alt="activeItem.title || copy.title"
            loading="lazy"
            decoding="async"
          />
          <div
            class="system-announcement-markdown"
            v-html="renderMarkdown(activeItem.contentMarkdown)"
          ></div>
        </div>
      </article>
    </div>

    <div v-else class="system-announcement-empty">
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="m7 12 3 3 7-7" />
        </svg>
      </span>
      <h3>{{ copy.emptyTitle }}</h3>
      <p>{{ copy.emptyHint }}</p>
    </div>

    <template #footer>
      <div class="system-announcement-footer">
        <span v-if="items.length">{{ copy.todayOnly }}</span>
        <el-button type="primary" @click="dismiss">{{ copy.acknowledge }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  announcements: { type: Array, default: () => [] }
});
const emit = defineEmits(["update:modelValue", "dismiss", "closed"]);
const activeIndex = ref(0);
const closeButtonRef = ref(null);
const { locale, t } = useI18n();

const copy = computed(() => ({
  eyebrow: t("portal.announcementEyebrow"),
  title: t("portal.announcementTitle"),
  close: t("portal.announcementClose"),
  list: t("portal.announcementList"),
  untitled: t("portal.announcementUntitled"),
  unread: t("portal.announcementUnread"),
  emptyTitle: t("portal.announcementEmptyTitle"),
  emptyHint: t("portal.announcementEmptyHint"),
  todayOnly: t("portal.announcementTodayOnly"),
  acknowledge: t("portal.announcementAcknowledge"),
  customer: t("portal.announcementCustomer"),
  employee: t("portal.announcementEmployee"),
  all: t("portal.announcementAll")
}));

const items = computed(() => Array.isArray(props.announcements) ? props.announcements : []);
const activeItem = computed(() => items.value[activeIndex.value] || null);

watch(
  () => [props.modelValue, items.value.length],
  ([visible, length]) => {
    if (visible) {
      const firstUnread = items.value.findIndex((item) => !item?.read);
      activeIndex.value = firstUnread >= 0 ? firstUnread : Math.min(activeIndex.value, Math.max(0, length - 1));
    }
  },
  { immediate: true }
);

function dismiss() {
  emit("dismiss", items.value);
  emit("update:modelValue", false);
}

function handleBeforeClose(done) {
  dismiss();
  done();
}

function handleOpenAutoFocus() {
  window.requestAnimationFrame(() => {
    if (props.modelValue) closeButtonRef.value?.focus({ preventScroll: true });
  });
}

function audienceText(audience) {
  if (audience === "CUSTOMER") return copy.value.customer;
  if (audience === "EMPLOYEE") return copy.value.employee;
  return copy.value.all;
}

function dateText(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat(locale.value === "en-US" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function safeUrl(value, { image = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const resolved = new URL(raw, window.location.origin);
    const storedImage = resolved.pathname.match(
      /\/(?:tracking\/)?api\/public\/announcement-images\/([a-f0-9]{32}\.(?:jpe?g|png|gif))$/i
    );
    if (image && storedImage) {
      return new URL(`/api/public/announcement-images/${storedImage[1]}`, window.location.origin).href;
    }
    if (resolved.protocol === "https:" || resolved.protocol === "http:") return resolved.href;
    if (image && resolved.protocol === "data:" && /^data:image\/(?:png|jpe?g|gif|webp);/i.test(raw)) {
      return raw;
    }
  } catch {
    return "";
  }
  return "";
}

function safeImageUrl(value) {
  return safeUrl(value, { image: true });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(value) {
  let output = escapeHtml(value);
  output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const safe = safeImageUrl(url);
    return safe ? `<img src="${escapeHtml(safe)}" alt="${alt}" loading="lazy">` : "";
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safe = safeUrl(url);
    return safe
      ? `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  });
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let list = [];
  let listType = "";

  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<${listType}>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${listType}>`);
    list = [];
    listType = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      list.push((unordered || ordered)[1]);
      continue;
    }
    flushList();
    if (!line) continue;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(5, heading[1].length + 2);
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
    } else if (/^>\s?/.test(line)) {
      blocks.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ""))}</blockquote>`);
    } else {
      blocks.push(`<p>${renderInline(line)}</p>`);
    }
  }
  flushList();
  return blocks.join("") || `<p>${copy.value.emptyHint}</p>`;
}
</script>

<style scoped>
:global(.system-announcement-dialog) {
  --announcement-ink: #142f44;
  --announcement-muted: #60798c;
  --announcement-line: #dfe8ee;
  display: flex;
  max-height: min(88vh, 860px);
  max-height: min(88dvh, 860px);
  margin: 6vh auto 0;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(20, 63, 91, 0.12);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(8, 32, 49, 0.28);
}

:global(.system-announcement-dialog .el-dialog__header) {
  flex: none;
  margin: 0;
  padding: 0;
}

:global(.system-announcement-dialog .el-dialog__body) {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0;
  background: #fff;
  scrollbar-gutter: stable;
}

:global(.system-announcement-dialog .el-dialog__footer) {
  flex: none;
  padding: 0;
}

.system-announcement-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 32px;
  color: #fff;
  background: linear-gradient(118deg, #102f48 0%, #0f557b 64%, #176f91 100%);
}

.system-announcement-mark {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.13);
}

.system-announcement-mark svg,
.system-announcement-close svg {
  width: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.system-announcement-heading {
  min-width: 0;
}

.system-announcement-head small {
  display: block;
  margin-bottom: 5px;
  color: #b7deee;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.08em;
}

.system-announcement-head h2 {
  margin: 0;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.015em;
}

.system-announcement-close {
  display: grid;
  width: 44px;
  height: 44px;
  margin-left: auto;
  flex: 0 0 44px;
  color: #e7f4f9;
  border: 0;
  border-radius: 11px;
  background: transparent;
  cursor: pointer;
  place-items: center;
  transition: color 160ms ease, background-color 160ms ease;
}

.system-announcement-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

.system-announcement-close:focus-visible {
  outline: 3px solid rgba(255, 255, 255, 0.92);
  outline-offset: 2px;
  background: rgba(255, 255, 255, 0.14);
}

.system-announcement-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 360px;
}

.system-announcement-layout:has(.system-announcement-list) {
  grid-template-columns: 232px minmax(0, 1fr);
}

.system-announcement-list {
  padding: 20px 12px;
  border-right: 1px solid var(--announcement-line);
  background: #f6f9fb;
}

.system-announcement-list button {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 50px;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  color: #526d80;
  text-align: left;
  border: 0;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}

.system-announcement-list button::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: transparent;
  content: "";
}

.system-announcement-list button:hover {
  color: #1f5576;
  background: #edf4f7;
}

.system-announcement-list button.active {
  color: #114f76;
  background: #e7f1f6;
}

.system-announcement-list button.active::before {
  background: #1b79aa;
}

.system-announcement-list button:focus-visible {
  outline: 3px solid rgba(27, 121, 170, 0.3);
  outline-offset: -2px;
}

.system-announcement-list span {
  color: #7795a8;
  font: 700 11px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.system-announcement-list b {
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-announcement-list i {
  position: absolute;
  top: 8px;
  right: 7px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #e96548;
}

.system-announcement-content {
  min-width: 0;
  padding: 36px 48px 44px;
  background: #fff;
}

.system-announcement-reading {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

.system-announcement-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  color: var(--announcement-muted);
  font-size: 12px;
  line-height: 1.4;
}

.system-announcement-meta span,
.system-announcement-meta em {
  padding: 5px 10px;
  border-radius: 999px;
  font-style: normal;
  font-weight: 700;
}

.system-announcement-meta span {
  color: #155f89;
  background: #eaf4f8;
}

.system-announcement-meta em {
  color: #a94432;
  background: #fceeea;
}

.system-announcement-meta time {
  margin-left: auto;
}

.system-announcement-content h3 {
  margin: 22px 0 20px;
  color: var(--announcement-ink);
  font-size: clamp(25px, 2.2vw, 32px);
  font-weight: 720;
  line-height: 1.3;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}

.system-announcement-cover {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(380px, 42vh);
  margin-bottom: 24px;
  object-fit: contain;
  border-radius: 12px;
  background: #f2f6f8;
}

.system-announcement-markdown {
  color: #385368;
  font-size: 15px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.system-announcement-markdown :deep(p),
.system-announcement-markdown :deep(ul),
.system-announcement-markdown :deep(ol),
.system-announcement-markdown :deep(blockquote) {
  margin: 0 0 16px;
}

.system-announcement-markdown :deep(ul),
.system-announcement-markdown :deep(ol) {
  padding-left: 1.5em;
}

.system-announcement-markdown :deep(h4),
.system-announcement-markdown :deep(h5) {
  margin: 24px 0 12px;
  color: #183d57;
  line-height: 1.4;
}

.system-announcement-markdown :deep(img) {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(520px, 56vh);
  margin: 20px 0;
  object-fit: contain;
  border-radius: 10px;
}

.system-announcement-markdown :deep(a) {
  color: #116fa7;
  font-weight: 600;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.system-announcement-markdown :deep(a:focus-visible) {
  border-radius: 3px;
  outline: 3px solid rgba(17, 111, 167, 0.24);
  outline-offset: 2px;
}

.system-announcement-markdown :deep(blockquote) {
  padding: 12px 16px;
  color: #4d6b7f;
  border-left: 3px solid #3e95bd;
  background: #f3f8fa;
}

.system-announcement-markdown :deep(code) {
  padding: 2px 6px;
  color: #74436c;
  border-radius: 4px;
  background: #f4eff4;
}

.system-announcement-empty {
  display: grid;
  min-height: 360px;
  padding: 48px 24px;
  place-content: center;
  justify-items: center;
  color: var(--announcement-muted);
  text-align: center;
}

.system-announcement-empty span {
  display: grid;
  width: 56px;
  height: 56px;
  margin-bottom: 18px;
  place-items: center;
  color: #167b60;
  border-radius: 50%;
  background: #e8f5f0;
}

.system-announcement-empty svg {
  width: 28px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.system-announcement-empty h3 {
  margin: 0 0 10px;
  color: var(--announcement-ink);
  font-size: 20px;
}

.system-announcement-empty p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.system-announcement-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  padding: 16px 32px;
  border-top: 1px solid var(--announcement-line);
  background: #fff;
}

.system-announcement-footer span {
  margin-right: auto;
  color: #6a8294;
  font-size: 12px;
  line-height: 1.5;
}

.system-announcement-footer :deep(.el-button) {
  min-width: 112px;
  min-height: 40px;
  border-radius: 8px;
  font-weight: 650;
}

@media (max-width: 760px) {
  :global(.system-announcement-dialog) {
    width: calc(100vw - 24px) !important;
    max-height: calc(100vh - 24px);
    max-height: calc(100dvh - 24px);
    margin: 12px auto 0;
    border-radius: 16px;
  }

  .system-announcement-head {
    gap: 12px;
    padding: 18px 20px;
  }

  .system-announcement-mark {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-radius: 11px;
  }

  .system-announcement-head h2 {
    font-size: 19px;
  }

  .system-announcement-close {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }

  .system-announcement-layout:has(.system-announcement-list) {
    grid-template-columns: 1fr;
  }

  .system-announcement-list {
    display: flex;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--announcement-line);
    padding: 10px;
    scrollbar-width: thin;
  }

  .system-announcement-list button {
    min-width: 176px;
  }

  .system-announcement-content {
    padding: 26px 22px 34px;
  }

  .system-announcement-content h3 {
    margin: 18px 0;
    font-size: clamp(22px, 7vw, 27px);
  }

  .system-announcement-cover {
    max-height: 36vh;
    margin-bottom: 20px;
  }

  .system-announcement-footer {
    gap: 12px;
    padding: 14px 20px;
  }
}

@media (max-width: 480px) {
  :global(.system-announcement-dialog) {
    width: calc(100vw - 16px) !important;
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
    margin-top: 8px;
  }

  .system-announcement-head {
    padding: 16px;
  }

  .system-announcement-head small {
    font-size: 10px;
  }

  .system-announcement-content {
    padding: 24px 16px 30px;
  }

  .system-announcement-meta time {
    width: 100%;
    margin-left: 0;
    order: 3;
  }

  .system-announcement-markdown {
    font-size: 14px;
  }

  .system-announcement-footer {
    padding: 12px 16px;
  }

  .system-announcement-footer span {
    font-size: 11px;
  }

  .system-announcement-footer :deep(.el-button) {
    min-width: 96px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .system-announcement-close,
  .system-announcement-list button {
    transition: none;
  }
}
</style>
