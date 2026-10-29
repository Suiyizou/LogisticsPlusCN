<script setup lang="ts">
import { computed } from "vue";
import { wt } from "./workspaceCopy";

type Cargo = {
  id: string;
  name: string;
  model?: string;
  color?: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  quantity: number;
  weightKg: number;
};
const props = defineProps<{ cargos: Cargo[] }>();
const emit = defineEmits<{ edit: [cargo: Cargo] }>();
const colors = ["#1684a3", "#e88c39", "#43a49a", "#6581bc", "#bb7e9b", "#859c4a"];
const rows = computed(() => {
  const total = props.cargos.reduce((sum, item) => sum + volume(item), 0);
  return props.cargos.map((cargo, index) => ({
    cargo,
    color: cargo.color || colors[index % colors.length],
    volume: volume(cargo),
    share: total > 0 ? (volume(cargo) / total) * 100 : 0,
    size: Math.max(cargo.lengthCm, cargo.widthCm, cargo.heightCm, 1)
  }));
});
function volume(cargo: Cargo) {
  return (cargo.lengthCm * cargo.widthCm * cargo.heightCm * cargo.quantity) / 1000000;
}
const number = (value: number, digits = 1) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
</script>

<template>
  <div class="cargo-visual-overview" data-i18n-ignore>
    <div class="cargo-volume-heading">
      <strong>{{ wt("volumeDistribution") }}</strong>
      <span>{{ wt("volumeDistributionHint") }}</span>
    </div>
    <div class="cargo-volume-strip" role="img" :aria-label="wt('volumeDistribution')">
      <span
        v-for="row in rows"
        :key="row.cargo.id"
        :style="{ flexGrow: row.volume, background: row.color }"
        :title="`${row.cargo.name} · ${number(row.share)}%`"
      ></span>
    </div>
    <div class="cargo-overview-grid">
      <button
        v-for="row in rows"
        :key="row.cargo.id"
        class="cargo-overview-item"
        type="button"
        :aria-label="`${wt('editCargo')} ${row.cargo.name}`"
        @click="emit('edit', row.cargo)"
      >
        <div class="cargo-overview-item-head">
          <i :style="{ background: row.color }"></i>
          <strong>{{ row.cargo.name }}</strong>
          <span>{{ number(row.share) }}%</span>
        </div>
        <small v-if="row.cargo.model">{{ row.cargo.model }}</small>
        <div class="cargo-dimension-diagram" :style="{ '--cargo-color': row.color }">
          <div
            class="cargo-size-outline"
            :style="{
              width: `${Math.max(22, (row.cargo.lengthCm / row.size) * 112)}px`,
              height: `${Math.max(16, (row.cargo.heightCm / row.size) * 64)}px`
            }"
          ></div>
          <span
            >{{ row.cargo.lengthCm }} × {{ row.cargo.widthCm }} × {{ row.cargo.heightCm }} cm</span
          >
        </div>
        <div class="cargo-overview-values">
          <span
            ><b>{{ number(row.cargo.quantity, 0) }}</b> {{ wt("pieces") }}</span
          >
          <span
            ><b>{{ number(row.cargo.weightKg * row.cargo.quantity) }}</b> kg</span
          >
          <span
            ><b>{{ number(row.volume, 3) }}</b> m³</span
          >
        </div>
        <span class="cargo-overview-edit">{{ wt("editCargo") }} →</span>
      </button>
    </div>
    <p class="cargo-overview-note">{{ wt("dimensionDiagramHint") }}</p>
  </div>
</template>

<style scoped>
.cargo-volume-heading,
.cargo-overview-item-head,
.cargo-overview-values {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cargo-volume-heading {
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.cargo-volume-heading span,
.cargo-overview-note,
.cargo-overview-item small {
  color: var(--color-text-secondary, #637787);
  font-size: 12px;
}
.cargo-volume-strip {
  display: flex;
  height: 16px;
  overflow: hidden;
  border-radius: 5px;
  background: #edf3f7;
  gap: 2px;
}
.cargo-volume-strip span {
  min-width: 3px;
}
.cargo-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 248px), 1fr));
  gap: 12px;
  margin-top: 18px;
}
.cargo-overview-item {
  min-width: 0;
  padding: 16px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #dce6ee);
  border-radius: var(--radius-card, 12px);
  cursor: pointer;
}
.cargo-overview-item:hover,
.cargo-overview-item:focus-visible {
  border-color: #1684a3;
  outline: 2px solid #1684a31a;
}
.cargo-overview-item-head i {
  flex: 0 0 10px;
  height: 10px;
  border-radius: 3px;
}
.cargo-overview-item-head strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}
.cargo-overview-item-head span {
  margin-left: auto;
  color: #637787;
  font-size: 12px;
}
.cargo-dimension-diagram {
  min-height: 108px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 12px 0;
  background: #f5f8fa;
  border-radius: 8px;
}
.cargo-size-outline {
  border: 2px solid var(--cargo-color);
  background: color-mix(in srgb, var(--cargo-color) 12%, transparent);
  box-shadow:
    7px -5px 0 -2px #f5f8fa,
    7px -5px 0 0 var(--cargo-color);
}
.cargo-dimension-diagram span {
  font-size: 11px;
  color: #637787;
}
.cargo-overview-values {
  justify-content: space-between;
  flex-wrap: wrap;
  font-size: 12px;
}
.cargo-overview-values b {
  font-weight: 600;
}
.cargo-overview-edit {
  display: block;
  margin-top: 14px;
  font-size: 12px;
  color: #1684a3;
}
.cargo-overview-note {
  margin: 16px 0 0;
}
</style>
