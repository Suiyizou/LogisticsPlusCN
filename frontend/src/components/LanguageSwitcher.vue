<template>
  <div class="language-switcher" data-i18n-ignore>
    <svg
      class="language-switcher__globe"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.65"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c4 4.7 4 13.3 0 18-4-4.7-4-13.3 0-18Z" />
    </svg>
    <button
      v-for="option in localeOptions"
      :key="option.value"
      type="button"
      :class="{ active: option.value === currentLocale }"
      :aria-pressed="option.value === currentLocale"
      @click="setLocale(option.value)"
    >
      {{ option.shortLabel }}
    </button>
  </div>
</template>

<script setup>
import { currentLocale, localeOptions, setLocale } from "../i18n";
</script>
