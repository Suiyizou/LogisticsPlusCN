<template>
  <PublicLandingPage :current-user="currentUser" />
</template>

<script setup>
import { ref } from "vue";
import PublicLandingPage from "./components/PublicLandingPage.vue";
import {
  clearSession,
  isSessionExpired,
  storedToken,
  storedUser
} from "./services/authSession";

const hasUsableSession = Boolean(storedToken()) && !isSessionExpired();
if (!hasUsableSession) clearSession();

// The public page only needs the cached role to choose the correct entry link.
// Every protected destination still performs its normal server-side auth check.
const currentUser = ref(hasUsableSession ? storedUser() : null);
</script>
