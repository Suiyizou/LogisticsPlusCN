<template>
  <footer class="maritime-footer">
    <div class="maritime-wrap">
      <div class="public-footer-top">
        <div>
          <PublicBrand inverse compact />
          <p>{{ t("publicSite.footerCompany") }}</p>
          <span>{{ t("publicSite.editorial.companyEnglish") }}</span>
        </div>
        <nav :aria-label="t('publicSite.footerPlatform')">
          <h2>{{ t("publicSite.footerPlatform") }}</h2>
          <a href="/services">{{ t("publicSite.footerAll") }}</a
          ><a href="/services/transport">{{ t("publicSite.services.transport.title") }}</a
          ><a href="/services/planning">{{ t("publicSite.services.planning.title") }}</a
          ><a href="/services/customerportal">{{
            t("publicSite.services.customerportal.title")
          }}</a>
        </nav>
        <nav :aria-label="t('publicSite.footerTools')">
          <h2>{{ t("publicSite.footerTools") }}</h2>
          <a :href="trackingPath">{{ t("publicSite.navTracking") }}</a
          ><a href="/workbenches">{{ t("publicSite.footerLogin") }}</a
          ><a href="/services/booking">{{ t("publicSite.footerBooking") }}</a
          ><LanguageSwitcher />
        </nav>
        <div class="public-footer-signoff">
          <ServiceIcon name="globe" />
          <p>{{ t("publicSite.footerTagline") }}</p>
        </div>
      </div>
      <div class="public-footer-bottom">
        <span>© {{ new Date().getFullYear() }} {{ t("publicSite.footerCopyright") }}</span
        ><span>logisticspluscn</span>
      </div>
    </div>
  </footer>
</template>
<script setup lang="ts">
import PublicBrand from "./PublicBrand.vue";
import ServiceIcon from "./ServiceIcon.vue";
import LanguageSwitcher from "../LanguageSwitcher.vue";
import { t } from "../../i18n";
withDefaults(defineProps<{ trackingPath?: string }>(), { trackingPath: "/tracking/" });
</script>
