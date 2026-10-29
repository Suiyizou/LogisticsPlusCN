<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storedToken } from "../../services/authSession.js";
import { currentLocale, t } from "../../i18n";
import { TRACKING_SOURCE, createTrackingParentBridge } from "./trackingBridge.js";
const props = defineProps({ visible: Boolean });
const route = useRoute();
const router = useRouter();
const frame = ref(null);
const mountedSessionToken = storedToken();
let bridge;
onMounted(() => {
  bridge = createTrackingParentBridge({
    getSessionToken: () => mountedSessionToken,
    getCurrentSessionToken: storedToken,
    hostWindow: window,
    getFrame: () => frame.value,
    getRoute: () => route,
    getLocale: () => currentLocale.value,
    isVisible: () => props.visible,
    navigate: (target, replace = false) => {
      const resolved = router.resolve(target);
      if (resolved.fullPath !== route.fullPath)
        void (replace ? router.replace(target) : router.push(target));
    },
    authExpired: () => window.dispatchEvent(new Event("auth-expired"))
  });
});
watch([() => route.fullPath, () => props.visible, currentLocale], () => bridge?.sync());
onUnmounted(() => bridge?.dispose());
</script>
<template>
  <iframe
    ref="frame"
    class="tracking-workspace-frame"
    :src="TRACKING_SOURCE"
    :title="t('portal.tracking.title')"
    @load="bridge?.sync()"
  />
</template>
<style scoped>
.tracking-workspace-frame {
  display: block;
  border: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: #f4f7fa;
}
</style>
