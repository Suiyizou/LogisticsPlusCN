<template>
  <div class="service-workflow-art" :class="'is-stage-' + stage" aria-hidden="true">
    <svg v-if="planning" viewBox="0 0 360 208" fill="none">
      <ellipse cx="181" cy="174" rx="150" ry="15" fill="#15384a" opacity=".055" />
      <template v-if="stage === 1">
        <g
          v-for="(crate, index) in crates"
          :key="index"
          :transform="`translate(${crate.x} ${crate.y})`"
          class="workflow-crate"
        >
          <path d="m0 24 46-14 43 19-46 14Z" fill="#e9cfac" stroke="#b79771" />
          <path d="m0 24 43 19v57L0 80Z" fill="#cba77b" stroke="#a98359" />
          <path d="m43 43 46-14v58l-46 13Z" fill="#dbb98a" stroke="#a98359" />
          <path
            d="m7 28 0 50m28-38v54m15-48v48m31-59v52M3 66l37 15m8 0 37-11"
            stroke="#ad875d"
            stroke-width="2"
          />
          <path d="m21 33 8 4v20l-8-4Z" fill="#ede1cd" />
          <path d="m62 47 12-4v10l-12 4Z" fill="#eee4d5" />
        </g>
        <path
          d="M32 65v101m-4-101h8m-8 101h8M49 181l62 17m-62-21v8m62 9v8M131 193l125-36m-125 32v8m125-44v8"
          stroke="#537082"
          stroke-width="1.4"
        />
      </template>
      <template v-else>
        <path d="m29 66 218-33 86 36-218 40Z" fill="#bdcdd5" stroke="#4d7084" stroke-width="2" />
        <path d="m115 109 218-40v84l-218 40Z" fill="#879eaa" stroke="#4d7084" stroke-width="2" />
        <path d="m29 66 86 43v84l-86-44Z" fill="#294d63" stroke="#294d63" stroke-width="2" />
        <path d="m40 76 65 34v65l-65-34Z" fill="#e3eaed" />
        <path d="m40 141 65 34 216-40-65-32Z" fill="#c6cbd0" />
        <path
          v-for="index in 17"
          :key="index"
          :d="`m${119 + index * 11.5} ${109 - index * 2.1}v75`"
          stroke="#658392"
          stroke-width="1.4"
        />
        <path
          d="m115 114 207-38v65l-207 38Z"
          fill="#d9e1e5"
          :opacity="stage === 3 ? '.35' : '.1'"
        />
        <g v-if="stage === 3" class="workflow-load">
          <g
            v-for="(crate, index) in loaded"
            :key="index"
            :transform="`translate(${crate.x} ${crate.y})`"
          >
            <path
              d="m0 12 31-6 27 13-31 7Z"
              :fill="index % 2 ? '#e2e8eb' : '#d7bc98'"
              stroke="#8b8b7d"
            />
            <path
              d="m0 12 27 14v43L0 55Z"
              :fill="index % 2 ? '#b7c7cf' : '#bc966b'"
              stroke="#8b8b7d"
            />
            <path
              d="m27 26 31-7v43l-31 7Z"
              :fill="index % 2 ? '#ccd7dc' : '#d0ad7d'"
              stroke="#8b8b7d"
            />
            <path d="m7 18 0 37m13-29v35m14-32v34m16-38v34" stroke="#8c8b7c" opacity=".7" />
          </g>
        </g>
        <path d="M29 66v83l86 44 218-40V69M115 109v84" stroke="#355a70" stroke-width="3" />
        <path d="M27 161v22m0-7 84 28 220-39m0-8v15" stroke="#537082" stroke-width="1.2" />
      </template>
    </svg>
    <div v-else class="service-workflow-symbol">
      <span class="workflow-orbit"></span><ServiceIcon :name="icon" /><svg
        viewBox="0 0 260 80"
        fill="none"
      >
        <path d="M15 40h68m94 0h68" stroke="#b9cbd5" stroke-dasharray="4 5" />
        <circle cx="15" cy="40" r="5" fill="#ba4b25" />
        <circle cx="245" cy="40" r="5" fill="#15384a" />
      </svg>
    </div>
  </div>
</template>
<script setup lang="ts">
import ServiceIcon from "./ServiceIcon.vue";
defineProps<{ stage: number; planning?: boolean; icon: string }>();
const crates = [
  { x: 55, y: 58 },
  { x: 143, y: 37 },
  { x: 213, y: 78 }
];
const loaded = [
  { x: 61, y: 91 },
  { x: 116, y: 81 },
  { x: 173, y: 71 },
  { x: 230, y: 61 }
];
</script>
