<script setup lang="ts">
import { computed, ref } from "vue";
import { carrierIdentity } from "./carrierIdentity.js";
const props = withDefaults(defineProps<{ carrier?: string; compact?: boolean }>(), {
  carrier: "",
  compact: false
});
const identity = computed(() => carrierIdentity(props.carrier));
const failedLogo = ref("");
</script>
<template>
  <span class="carrier-badge" :class="{ 'is-compact': compact }" :title="identity.name">
    <span v-if="identity.code" class="carrier-badge__mark" aria-hidden="true">
      <img
        v-if="identity.logo && failedLogo !== identity.logo"
        :src="identity.logo"
        alt=""
        @error="failedLogo = identity.logo"
      />
      <span v-else class="carrier-badge__code">{{ identity.code.replaceAll("_", " ") }}</span>
    </span>
    <span class="carrier-badge__name">{{ identity.name }}</span>
  </span>
</template>
<style scoped>
.carrier-badge {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: 100%;
  min-width: 0;
  vertical-align: middle;
  color: var(--color-foreground);
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.5;
}
.carrier-badge__mark {
  display: grid;
  place-items: center;
  flex: 0 0 74px;
  width: 74px;
  min-height: 30px;
  padding: 3px 5px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: #fff;
  box-sizing: border-box;
}
.carrier-badge__mark img {
  display: block;
  width: 100%;
  height: 23px;
  object-fit: contain;
}
.carrier-badge__code {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--color-secondary);
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  letter-spacing: 0.025em;
}
.carrier-badge__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.is-compact {
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
}
.is-compact .carrier-badge__mark {
  flex-basis: auto;
  width: 72px;
  min-height: 26px;
}
.is-compact .carrier-badge__mark img {
  height: 20px;
}
</style>
