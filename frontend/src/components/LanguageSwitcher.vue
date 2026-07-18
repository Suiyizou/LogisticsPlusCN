<template>
  <div class="language-switcher" data-i18n-ignore>
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
