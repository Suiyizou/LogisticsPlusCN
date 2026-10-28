<template>
  <a
    class="maritime-brand"
    :class="{ 'is-compact': compact, 'is-inverse': inverse }"
    :href="href"
    :aria-label="t('maritime.homeAria')"
  >
    <span class="maritime-brand__mark" aria-hidden="true">LP</span>
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
