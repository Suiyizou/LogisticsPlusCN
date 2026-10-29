<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: "grid" });
const paths: Record<string, string> = {
  grid: "M3.5 3.5h6v6h-6zM14.5 3.5h6v6h-6zM3.5 14.5h6v6h-6zM14.5 14.5h6v6h-6z",
  tracking:
    "M3 5.5h11v12H3zM14 10h4l3 4v3.5h-7M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 9h5M6 12h3",
  box: "m12 3 9 4.8v9.4L12 22l-9-4.8V7.8L12 3Zm0 9.4L3 7.8m9 4.6 9-4.6m-9 4.6V22M7.5 5.4l9 4.8",
  business: "M8 7V4h8v3M3 7h18v14H3zM3 12.5c5.8 3.3 12.2 3.3 18 0M10 13.5h4v4h-4z",
  settings:
    "m9.5 3-.7 2.6-2 .9-2.5-.7-2.5 4.4 1.9 1.9v2.2l-1.9 1.9 2.5 4.4 2.5-.7 2 .9.7 2.2h5l.7-2.2 2-.9 2.5.7 2.5-4.4-1.9-1.9v-2.2l1.9-1.9-2.5-4.4-2.5.7-2-.9L14.5 3h-5ZM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  chevron: "m9 5 7 7-7 7",
  menu: "M4 6h16M4 12h16M4 18h16",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2.5 6.5 2.5 8H3.5C3.5 15.5 6 15 6 9Zm4 12h4",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c4 4.7 4 13.3 0 18-4-4.7-4-13.3 0-18Z",
  arrow: "M4 12h16m-6-6 6 6-6 6"
};
</script>
<template>
  <svg
    class="workspace-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name] || paths.grid" />
  </svg>
</template>
<style scoped>
.workspace-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
