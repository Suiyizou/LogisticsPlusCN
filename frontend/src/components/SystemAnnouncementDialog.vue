<template>
  <el-dialog
    :model-value="modelValue"
    class="system-announcement-dialog"
    width="min(780px, calc(100vw - 32px))"
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="emit('closed')"
  >
    <template #header>
      <div class="system-announcement-head">
        <span class="system-announcement-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 11v2m3-5v8l10 3V5L7 8Zm0 6-1 5h4l1-4" />
          </svg>
        </span>
        <div>
          <small>{{ copy.eyebrow }}</small>
          <h2>{{ copy.title }}</h2>
        </div>
        <button type="button" class="system-announcement-close" :aria-label="copy.close" @click="dismiss">
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
          @click="activeIndex = index"
        >
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <b>{{ item.title || copy.untitled }}</b>
          <i v-if="!item.read"></i>
        </button>
      </aside>

      <article v-if="activeItem" class="system-announcement-content">
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
        />
        <div
          class="system-announcement-markdown"
          v-html="renderMarkdown(activeItem.contentMarkdown)"
        ></div>
      </article>
    </div>

    <div v-else class="system-announcement-empty">
      <span aria-hidden="true">✓</span>
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
  overflow: hidden;
  border: 1px solid rgba(29, 113, 184, 0.18);
  border-radius: 22px;
  background: #f8fbff;
  box-shadow: 0 28px 90px rgba(8, 37, 64, 0.26);
}

:global(.system-announcement-dialog .el-dialog__header) {
  margin: 0;
  padding: 0;
}

:global(.system-announcement-dialog .el-dialog__body) {
  padding: 0;
}

:global(.system-announcement-dialog .el-dialog__footer) {
  padding: 0;
}

.system-announcement-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 24px;
  color: #fff;
  background:
    radial-gradient(circle at 86% 0, rgba(101, 225, 235, 0.28), transparent 36%),
    linear-gradient(125deg, #0b2b46, #155f8e);
}

.system-announcement-mark {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
}

.system-announcement-mark svg,
.system-announcement-close svg {
  width: 22px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.system-announcement-head small {
  display: block;
  margin-bottom: 4px;
  color: #9bdef5;
  font: 800 10px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
  letter-spacing: 0.16em;
}

.system-announcement-head h2 {
  margin: 0;
  font-size: 21px;
}

.system-announcement-close {
  display: grid;
  width: 40px;
  height: 40px;
  margin-left: auto;
  color: #d8effa;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  place-items: center;
}

.system-announcement-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 330px;
}

.system-announcement-layout:has(.system-announcement-list) {
  grid-template-columns: 210px minmax(0, 1fr);
}

.system-announcement-list {
  padding: 18px 12px;
  border-right: 1px solid #dfeaf2;
  background: #f0f6fa;
}

.system-announcement-list button {
  position: relative;
  display: grid;
  width: 100%;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 11px 10px;
  color: #47677e;
  text-align: left;
  border: 0;
  border-radius: 11px;
  background: transparent;
  cursor: pointer;
}

.system-announcement-list button.active {
  color: #124e75;
  background: #fff;
  box-shadow: 0 8px 24px rgba(25, 78, 111, 0.1);
}

.system-announcement-list span {
  color: #7ba4bd;
  font: 800 10px ui-monospace, SFMono-Regular, Consolas, monospace;
}

.system-announcement-list b {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-announcement-list i {
  position: absolute;
  top: 9px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #ff7b5a;
}

.system-announcement-content {
  min-width: 0;
  padding: 26px 30px 30px;
  background: #fff;
}

.system-announcement-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #6f8799;
  font-size: 11px;
}

.system-announcement-meta span,
.system-announcement-meta em {
  padding: 5px 9px;
  border-radius: 999px;
  font-style: normal;
  font-weight: 750;
}

.system-announcement-meta span {
  color: #176795;
  background: #e8f5fb;
}

.system-announcement-meta em {
  color: #bd4e34;
  background: #fff0eb;
}

.system-announcement-meta time {
  margin-left: auto;
}

.system-announcement-content h3 {
  margin: 20px 0 16px;
  color: #102c43;
  font-size: clamp(22px, 3vw, 30px);
  letter-spacing: -0.035em;
}

.system-announcement-cover {
  display: block;
  width: 100%;
  max-height: 280px;
  margin-bottom: 18px;
  object-fit: cover;
  border-radius: 15px;
}

.system-announcement-markdown {
  color: #425e72;
  font-size: 14px;
  line-height: 1.78;
}

.system-announcement-markdown :deep(p),
.system-announcement-markdown :deep(ul),
.system-announcement-markdown :deep(ol),
.system-announcement-markdown :deep(blockquote) {
  margin: 0 0 13px;
}

.system-announcement-markdown :deep(h4),
.system-announcement-markdown :deep(h5) {
  margin: 18px 0 10px;
  color: #173c57;
}

.system-announcement-markdown :deep(img) {
  max-width: 100%;
  margin: 12px 0;
  border-radius: 12px;
}

.system-announcement-markdown :deep(a) {
  color: #1675b2;
}

.system-announcement-markdown :deep(blockquote) {
  padding: 10px 14px;
  color: #527388;
  border-left: 3px solid #44a6ce;
  background: #f1f8fb;
}

.system-announcement-markdown :deep(code) {
  padding: 2px 5px;
  color: #7d3f75;
  border-radius: 5px;
  background: #f4eef5;
}

.system-announcement-empty {
  display: grid;
  min-height: 300px;
  place-content: center;
  justify-items: center;
  color: #607b8f;
  text-align: center;
}

.system-announcement-empty span {
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 15px;
  place-items: center;
  color: #168363;
  border-radius: 18px;
  background: #e8f8f2;
  font-size: 24px;
}

.system-announcement-empty h3 {
  margin: 0 0 8px;
  color: #18384f;
}

.system-announcement-empty p {
  margin: 0;
}

.system-announcement-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  padding: 16px 22px;
  border-top: 1px solid #e0eaf1;
  background: #f7fafc;
}

.system-announcement-footer span {
  margin-right: auto;
  color: #7890a2;
  font-size: 11px;
}

@media (max-width: 660px) {
  .system-announcement-layout:has(.system-announcement-list) {
    grid-template-columns: 1fr;
  }

  .system-announcement-list {
    display: flex;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid #dfeaf2;
  }

  .system-announcement-list button {
    min-width: 150px;
  }

  .system-announcement-content {
    padding: 22px 20px 26px;
  }
}
</style>
