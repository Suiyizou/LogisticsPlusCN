<template>
  <div class="landing-page public-site" :lang="currentLocale">
    <PublicSiteHeader
      :tracking-path="trackingPath"
      :current-user="currentUser"
    /><slot /><PublicSiteFooter :tracking-path="trackingPath" />
  </div>
</template>
<script setup lang="ts">
import "../../maritime-public.css";
import { currentLocale } from "../../i18n";
import PublicSiteHeader from "./PublicSiteHeader.vue";
import PublicSiteFooter from "./PublicSiteFooter.vue";
defineProps<{ currentUser?: { role?: string } | null }>();
const trackingPath = import.meta.env.VITE_TRACKING_WORKBENCH_URL || "/tracking/";
</script>
