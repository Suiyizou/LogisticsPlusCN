<template>
  <AsyncPageError v-if="routeError" :retry-path="failedPath" />
  <RouterView v-else v-slot="{ Component }"
    ><component :is="Component" :current-user="currentUser"
  /></RouterView>
  <SystemWaitOverlay :visible="routeLoading" :message="t('app.loadingPage')" />
</template>
<script setup>
import { ref } from "vue";
import { RouterView } from "vue-router";
import { t } from "./i18n";
import AsyncPageError from "./components/AsyncPageError.vue";
import SystemWaitOverlay from "./components/SystemWaitOverlay.vue";
import { publicNavigation } from "./public/router.js";
import { storedToken, storedUser, isSessionExpired } from "./services/authSession";
import { storedCustomerToken, isCustomerSessionExpired } from "./services/customerSession";
const { loading: routeLoading, error: routeError, failedPath } = publicNavigation;
const internal = Boolean(storedToken()) && !isSessionExpired() ? storedUser() : null;
const currentUser = ref(
  internal || (storedCustomerToken() && !isCustomerSessionExpired() ? { role: "CUSTOMER" } : null)
);
</script>
