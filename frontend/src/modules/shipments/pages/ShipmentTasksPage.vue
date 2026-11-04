<script setup lang="ts">
import ShipmentTaskPublisher from "../../../features/shipments/ShipmentTaskPublisher.vue";
import { useModulePages } from "../../moduleContext.js";

const { list, listDialogs } = useModulePages("shipments");
</script>

<template>
  <ShipmentTaskPublisher
    :customers="listDialogs.state.assignableCustomers"
    :customer-label="listDialogs.formatters.customerFilterOptionLabel"
    :on-completed="list.actions.loadAvailableShipments"
  />
</template>
