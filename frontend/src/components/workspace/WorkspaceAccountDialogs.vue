<script setup lang="ts">
import { computed, ref, watch } from "vue";
import PersonalProfileDialog from "../../features/account/PersonalProfileDialog.vue";
import { usePersonalProfile } from "../../features/account/usePersonalProfile.js";
import { updateOwnProfile, changeOwnPassword } from "../../services/adminApi";
import { saveStoredUser } from "../../services/authSession";
import { t } from "../../i18n";
import type { WorkspaceUser } from "../../types/workspace";

const props = withDefaults(
  defineProps<{ currentUser?: WorkspaceUser | null; mode?: "" | "profile" | "password" }>(),
  { currentUser: null, mode: "" }
);
const emit = defineEmits<{
  close: [];
  "user-updated": [user: WorkspaceUser];
  logout: [];
}>();
const section = computed(() => (props.mode === "password" ? "password" : "profile"));
const notice = ref("");
const workflow = usePersonalProfile({
  currentUser: () => props.currentUser,
  updateOwnProfile,
  changeOwnPassword,
  saveStoredUser,
  onUserUpdated: (user: WorkspaceUser) => emit("user-updated", user),
  showSuccess: (key: string) => {
    notice.value = t(key);
  },
  t
});

let changingMode = false;
watch(
  () => props.mode,
  (mode) => {
    // A different panel starts a new dialog session, invalidating pending responses.
    changingMode = true;
    workflow.personalProfileOpen.value = false;
    notice.value = "";
    if (mode === "profile" || mode === "password") {
      if (!workflow.openPersonalProfile()) emit("close");
    }
    changingMode = false;
  },
  { immediate: true, flush: "sync" }
);
watch(
  workflow.personalProfileOpen,
  (open) => {
    if (!open && !changingMode && props.mode) emit("close");
  },
  { flush: "sync" }
);
watch(
  () => [props.currentUser?.id, props.currentUser?.username, props.currentUser?.role].join("|"),
  () => {
    notice.value = "";
  },
  { flush: "sync" }
);
</script>

<template>
  <PersonalProfileDialog
    :workflow="workflow"
    :current-user="currentUser"
    :section="section"
    :t="t"
  />
  <p v-if="notice" class="workspace-account-notice" role="status">{{ notice }}</p>
</template>

<style scoped>
.workspace-account-notice {
  position: fixed;
  z-index: 2100;
  right: 28px;
  bottom: 24px;
  max-width: calc(100vw - 48px);
  margin: 0;
  padding: 12px 20px;
  border: 1px solid #cbdfe9;
  border-radius: 9px;
  color: #246b91;
  background: #f0f7fb;
  box-shadow: 0 8px 24px #17374d12;
}
</style>
