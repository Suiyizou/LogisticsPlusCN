<template>
  <div class="maritime-utility">
    <div class="maritime-wrap">
      <span>{{ t("maritime.company") }}</span
      ><span>{{ t("maritime.location") }}</span>
    </div>
  </div>
  <header class="maritime-header">
    <BrandLockup href="#landing-top" />
    <nav :aria-label="t('landing.nav.aria')">
      <a href="#landing-top" aria-current="page">{{ t("landing.nav.home") }}</a>
      <a :href="trackingPath">{{ t("maritime.tracking") }}</a>
      <a href="/planner">{{ t("maritime.planning") }}</a>
      <a href="#landing-tools">{{ t("maritime.tools") }}</a>
    </nav>
    <div class="maritime-header__actions">
      <LanguageSwitcher /><a class="maritime-button maritime-button--navy" href="/workbenches"
        >{{ entryLabel }} <span aria-hidden="true">↗</span></a
      >
    </div>
  </header>
</template>
<script setup lang="ts">
import BrandLockup from "../brand/BrandLockup.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import { t } from "../../i18n";
defineProps<{ trackingPath: string; entryLabel: string }>();
</script>
