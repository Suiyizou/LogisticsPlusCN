<template>
  <main class="async-page-error" role="alert">
    <section>
      <BrandLockup />
      <h1>{{ t("app.pageLoadFailed") }}</h1>
      <p>{{ t("app.pageLoadFailedHint") }}</p>
      <div>
        <button type="button" @click="reload">{{ t("app.retry") }}</button
        ><a href="/">{{ t("maritime.errorHome") }}</a>
      </div>
    </section>
  </main>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import BrandLockup from "./brand/BrandLockup.vue";
defineOptions({ inheritAttrs: false });
const { t } = useI18n();
const reload = () => window.location.reload();
</script>
<style scoped>
.async-page-error {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--color-foreground);
  background: var(--color-background);
}
.async-page-error section {
  width: min(500px, 100%);
  padding: 38px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-card);
  background: white;
  text-align: center;
}
.async-page-error h1 {
  font-size: 24px;
  margin: 32px 0 0;
  font-weight: 600;
}
.async-page-error p {
  margin: 12px 0 26px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}
.async-page-error section > div {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 24px;
}
.async-page-error button {
  min-height: 44px;
  padding: 0 22px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-control);
  color: white;
  background: var(--color-primary);
  font: inherit;
}
.async-page-error a {
  color: var(--color-secondary);
  font-size: 13px;
}
</style>
