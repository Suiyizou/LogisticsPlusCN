<template>
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path v-for="(path, index) in paths" :key="index" :d="path" />
  </svg>
</template>
<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: string }>();
const shapes: Record<string, string[]> = {
  location: [
    "M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z",
    "M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
  ],
  box: ["m3 7 9-5 9 5v10l-9 5-9-5V7Z", "m3 7 9 5 9-5M12 12v10M7 4.8l10 5.4"],
  equipment: ["M3 6h18v13H3zM7 6v13m5-13v13m5-13v13M2 21h20"],
  ship: [
    "M3 16 2 11l10-4 10 4-2 5M12 7V3h5v6M4 16c2 3 5 3 8 0 3 3 6 3 8 0M2 21c3 2 6 2 10 0 4 2 7 2 10 0"
  ],
  chart: ["M3 3v18h18M7 16v-5m5 5V6m5 10v-8"],
  document: ["M6 3h8l4 4v14H6V3Z", "M14 3v5h5M9 12h6m-6 4h6"],
  users: [
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a7 7 0 0 1 14 0v2M16 4a4 4 0 0 1 0 8m3 3a6 6 0 0 1 3 6"
  ],
  globe: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"],
  transfer: ["M3 7h16l-4-4M21 17H5l4 4M19 7l-4 4M5 17l4-4"],
  folder: ["M3 7V4h6l2 3h10v13H3V7ZM3 10h18"],
  user: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2"],
  settings: ["M12 3 20 7v6c0 4-8 9-8 9s-8-5-8-9V7l8-4Z", "m8 12 3 3 5-6"]
};
const paths = computed(() => shapes[props.name] || shapes.document);
</script>
