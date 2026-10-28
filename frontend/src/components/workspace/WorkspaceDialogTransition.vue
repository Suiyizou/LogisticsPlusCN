<script setup lang="ts">
import { prepareDialogLeave } from "./dialogPresentation.js";
</script>
<template>
  <Transition name="workspace-dialog" appear @before-leave="prepareDialogLeave"
    ><slot
  /></Transition>
</template>
