<template>
  <article class="mega-preview" :aria-label="t('publicSite.previewLabel')">
    <div class="mega-preview__image">
      <img :src="image" alt="" width="720" height="320" /><span>{{
        service.id.toUpperCase()
      }}</span>
    </div>
    <div class="mega-preview__body">
      <Transition name="service-preview" mode="out-in">
        <div :key="service.id" class="mega-preview__content">
          <p class="public-access">{{ accessLabel }}</p>
          <h3>{{ copy.title }}</h3>
          <p>{{ copy.summary }}</p>
          <ul>
            <li v-for="feature in copy.features" :key="feature">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg
              >{{ feature }}
            </li>
          </ul>
        </div>
      </Transition>
      <RouterLink :to="service.detailPath" @click="emit('navigate')"
        >{{ t("publicSite.details") }} <span aria-hidden="true">→</span></RouterLink
      >
    </div>
  </article>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { currentLocale, t } from "../../i18n";
import { getPublicServiceCopy } from "../../i18n/publicSiteMessages.js";
import { serviceImages } from "../../public/serviceCatalog.js";
const props = defineProps<{ service: any }>();
const emit = defineEmits<{ navigate: [] }>();
const copy = computed(() => getPublicServiceCopy(props.service.id, currentLocale.value));
const image = computed(() => serviceImages[props.service.image as keyof typeof serviceImages]);
const accessLabel = computed(() =>
  t(
    "publicSite." +
      ({
        public: "accessPublic",
        authenticated: "accessAuthenticated",
        external: "accessExternal",
        context: "accessContext"
      }[props.service.access as string] || "accessRegistered")
  )
);
</script>
