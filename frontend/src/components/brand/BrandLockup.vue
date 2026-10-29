<template>
  <a
    class="maritime-brand"
    :class="{ 'is-compact': compact, 'is-inverse': inverse }"
    :href="href"
    :aria-label="t('maritime.homeAria')"
  >
    <svg
      class="maritime-brand__mark"
      viewBox="0 0 58 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9 4h8L10 31h15l-2 7H3L9 4Z" fill="currentColor" />
      <path
        d="M30 4h15c10 0 13 5 11 12-2 8-8 12-18 12h-5l-3 10h-8l6-23h8l-2 6h5c5 0 8-2 9-5 1-4-1-5-6-5H28l2-7Z"
        fill="currentColor"
      />
    </svg>
    <span class="maritime-brand__wordmark"
      >logisticspluscn<small>{{
        t(company ? "maritime.company" : "maritime.brandTagline")
      }}</small></span
    >
  </a>
</template>
<script setup lang="ts">
import { t } from "../../i18n";
withDefaults(
  defineProps<{ href?: string; compact?: boolean; inverse?: boolean; company?: boolean }>(),
  { href: "/", compact: false, inverse: false, company: false }
);
</script>
