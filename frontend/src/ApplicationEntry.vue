<template>
  <AsyncPageError v-if="routeLoadError" />
  <RouterView v-else />
  <SystemWaitOverlay :visible="routeLoading" :message="t('app.loadingPage')" />
  <GlobalApiErrorNotice />
</template>

<script setup>
import { RouterView } from "vue-router";
import AsyncPageError from "./components/AsyncPageError.vue";
import GlobalApiErrorNotice from "./components/GlobalApiErrorNotice.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import { routeLoading, routeLoadError } from "./router";
import { t } from "./i18n";
</script>
