<template>
  <slot />
</template>

<script setup lang="ts">
// Transitional slot host for sections whose templates still live in BusinessCustomerPage.
// New modules supply their own route page instead of extending this host.
defineOptions({ inheritAttrs: false });
</script>
