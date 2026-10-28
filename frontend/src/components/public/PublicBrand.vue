<template>
  <BrandLockup
    class="public-brand"
    :class="{ 'without-company': !company }"
    :href="href"
    :inverse="inverse"
    :compact="compact"
    :company="company"
  />
</template>
<script setup lang="ts">
import BrandLockup from "../brand/BrandLockup.vue";
withDefaults(
  defineProps<{ href?: string; inverse?: boolean; compact?: boolean; company?: boolean }>(),
  { href: "/", inverse: false, compact: false, company: false }
);
</script>
<style scoped>
.public-brand {
  gap: 14px;
  min-width: 0;
}
.public-brand :deep(.maritime-brand__wordmark) {
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.7px;
}
.public-brand :deep(.maritime-brand__wordmark small) {
  font-size: 11px;
  letter-spacing: 0;
  margin-top: 5px;
  max-width: 310px;
}
.public-brand.without-company :deep(small) {
  display: none;
}
.public-brand.is-compact :deep(.maritime-brand__wordmark) {
  font-size: 21px;
}
@media (max-width: 767px) {
  .public-brand {
    gap: 10px;
  }
  .public-brand :deep(.maritime-brand__wordmark) {
    font-size: 21px;
  }
  .public-brand :deep(.maritime-brand__wordmark small) {
    font-size: 10px;
    max-width: 235px;
  }
}
</style>
