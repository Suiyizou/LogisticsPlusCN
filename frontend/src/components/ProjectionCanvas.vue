<template>
  <div class="projection-card">
    <div class="projection-title">
      <strong>{{ title }}</strong>
      <span>{{ note }}</span>
    </div>
    <canvas ref="canvas" width="520" height="280"></canvas>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";

const props = defineProps({
  title: { type: String, required: true },
  note: { type: String, default: "" },
  mode: { type: String, required: true },
  container: { type: Object, default: null },
  placements: { type: Array, default: () => [] }
});

const canvas = ref(null);

onMounted(draw);
watch(() => [props.container, props.placements, props.mode], draw, { deep: true });

function draw() {
  if (!canvas.value || !props.container) return;
  const ctx = canvas.value.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.value.clientWidth || 520;
  const cssHeight = canvas.value.clientHeight || 280;
  canvas.value.width = cssWidth * dpr;
  canvas.value.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const c = props.container;
  const dims = getProjection(c);
  const pad = 34;
  const scale = Math.min((cssWidth - pad * 2) / dims.w, (cssHeight - pad * 2) / dims.h);
  const ox = (cssWidth - dims.w * scale) / 2;
  const oy = (cssHeight - dims.h * scale) / 2;

  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = "#c7d5e8";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const x = ox + (dims.w * scale * i) / 10;
    const y = oy + (dims.h * scale * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + dims.h * scale);
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + dims.w * scale, y);
    ctx.stroke();
  }

  props.placements.forEach((item) => {
    const rect = projectItem(item);
    ctx.fillStyle = hexToRgba(item.color || "#4e8fd0", 0.72);
    ctx.strokeStyle = hexToRgba("#163a5f", 0.45);
    ctx.lineWidth = 1;
    ctx.fillRect(ox + rect.x * scale, oy + dims.h * scale - (rect.y + rect.h) * scale, rect.w * scale, rect.h * scale);
    ctx.strokeRect(ox + rect.x * scale, oy + dims.h * scale - (rect.y + rect.h) * scale, rect.w * scale, rect.h * scale);
  });

  ctx.strokeStyle = "#2d6ea8";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, dims.w * scale, dims.h * scale);
  ctx.fillStyle = "#2d5f93";
  ctx.font = "12px Microsoft YaHei, Arial";
  ctx.fillText(dims.xLabel, ox + dims.w * scale / 2 - 32, oy - 10);
  ctx.save();
  ctx.translate(ox - 14, oy + dims.h * scale / 2 + 32);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(dims.yLabel, 0, 0);
  ctx.restore();
}

function getProjection(c) {
  if (props.mode === "front") return { w: c.lengthCm, h: c.heightCm, xLabel: `长 ${c.lengthCm} cm`, yLabel: `高 ${c.heightCm} cm` };
  if (props.mode === "side") return { w: c.widthCm, h: c.heightCm, xLabel: `宽 ${c.widthCm} cm`, yLabel: `高 ${c.heightCm} cm` };
  return { w: c.lengthCm, h: c.widthCm, xLabel: `长 ${c.lengthCm} cm`, yLabel: `宽 ${c.widthCm} cm` };
}

function projectItem(item) {
  if (props.mode === "front") return { x: item.xCm, y: item.zCm, w: item.lengthCm, h: item.heightCm };
  if (props.mode === "side") return { x: item.yCm, y: item.zCm, w: item.widthCm, h: item.heightCm };
  return { x: item.xCm, y: item.yCm, w: item.lengthCm, h: item.widthCm };
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((x) => x + x).join("") : raw;
  const num = parseInt(full, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}
</script>
