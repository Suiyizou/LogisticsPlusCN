<template>
  <main class="async-page-error" role="alert">
    <section>
      <strong>{{ t("app.pageLoadFailed") }}</strong>
      <p>{{ t("app.pageLoadFailedHint") }}</p>
      <button type="button" @click="reload">{{ t("app.retry") }}</button>
    </section>
  </main>
</template>

<script setup>
import { useI18n } from "vue-i18n";

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
  color: #173854;
  background: #f4f9fd;
}

.async-page-error section {
  width: min(420px, 100%);
  padding: 30px;
  border: 1px solid #d7e5f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(35, 81, 119, 0.12);
  text-align: center;
}

.async-page-error strong {
  font-size: 20px;
}

.async-page-error p {
  margin: 10px 0 22px;
  color: #6c8295;
  font-size: 13px;
  line-height: 1.7;
}

.async-page-error button {
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  background: #1679d3;
  cursor: pointer;
  font: inherit;
}
</style>
