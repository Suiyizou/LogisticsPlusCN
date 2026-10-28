<script setup lang="ts">
import WorkspacePageHeader from "../../components/workspace/WorkspacePageHeader.vue";
import BrandLockup from "../../components/brand/BrandLockup.vue";
import { RouterLink } from "vue-router";
import type { AdminConsoleCopy, AdminLoginForm } from "../../types/adminShell";
const props = defineProps<{
  form: AdminLoginForm;
  busy: boolean;
  message: string;
  copy: AdminConsoleCopy;
}>();
const emit = defineEmits<{
  "update-username": [username: string];
  "update-password": [password: string];
  submit: [];
}>();
function updateUsername(event: Event) {
  if (!props.busy && event.target instanceof HTMLInputElement)
    emit("update-username", event.target.value.trim());
}
function updatePassword(event: Event) {
  if (!props.busy && event.target instanceof HTMLInputElement)
    emit("update-password", event.target.value);
}
function submit() {
  if (!props.busy) emit("submit");
}
</script>
<template>
  <section :aria-busy="busy" class="admin-login-shell">
    <div class="admin-login-brand">
      <RouterLink class="admin-back-link" to="/workbenches">{{ copy.switchWorkbench }}</RouterLink>
      <BrandLockup href="/" inverse company />
      <p>Admin Console</p>
      <h1>{{ copy.loginHeading }}</h1>
      <strong>{{ copy.loginDescription }}</strong>
      <div class="admin-login-points">
        <span v-for="point in copy.loginPoints" :key="point">{{ point }}</span>
      </div>
    </div>

    <form class="admin-login-card" @submit.prevent="submit">
      <WorkspacePageHeader :title="copy.loginEntry" :eyebrow="copy.loginTitle" />
      <label>
        <span>{{ copy.username }}</span>
        <input
          :value="form.username"
          :disabled="busy"
          @input="updateUsername"
          autocomplete="username"
        />
      </label>
      <label>
        <span>{{ copy.password }}</span>
        <input
          :value="form.password"
          :disabled="busy"
          @input="updatePassword"
          autocomplete="current-password"
          type="password"
        />
      </label>
      <button class="primary wide" type="submit" :disabled="busy">
        {{ busy ? copy.loggingIn : copy.login }}
      </button>
      <p v-if="message" class="admin-message error" role="alert">{{ message }}</p>
    </form>
  </section>
</template>
<style scoped src="./adminConsoleShellStyles.css"></style>
