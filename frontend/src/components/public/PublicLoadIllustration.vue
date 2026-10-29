<template>
  <figure class="public-load-illustration">
    <figcaption>
      <span>{{ t("publicSite.previewLabel") }}</span
      ><strong>{{ t("publicSite.planningResult") }}</strong>
    </figcaption>
    <svg viewBox="0 0 600 320" role="img" :aria-label="t('publicSite.planningResult')">
      <defs>
        <linearGradient id="load-wall" x2="1" y2="1">
          <stop stop-color="#e8f0f4" />
          <stop offset="1" stop-color="#c8dce6" />
        </linearGradient>
      </defs>
      <path d="m65 175 120-105 350 35-120 120Z" fill="#edf4f7" stroke="#adc5d1" />
      <path
        d="m185 70 350 35v110l-120 80V225L65 175v-5l120-100Z"
        fill="url(#load-wall)"
        stroke="#92b1c2"
      />
      <path d="m65 175 350 50 120-110v110L415 305 65 255Z" fill="#dce9ef" stroke="#92b1c2" />
      <g
        v-for="(box, index) in boxes"
        :key="index"
        :transform="`translate(${box[0]},${box[1]})`"
        stroke="#fff"
        stroke-width="1.5"
      >
        <path d="m0 0 36-25 65 9-36 27Z" :fill="index % 3 === 0 ? '#dba96d' : '#72a7c4'" />
        <path d="m0 0 65 11v55L0 55Z" :fill="index % 3 === 0 ? '#bd8852' : '#367b9f'" />
        <path d="m65 11 36-27v55L65 66Z" :fill="index % 3 === 0 ? '#a77749' : '#24607f'" />
      </g>
      <path
        d="m65 175 350 50 120-110M415 225v80M65 175v80l350 50 120-80V115"
        fill="none"
        stroke="#779bab"
        stroke-width="2"
      />
    </svg>
    <p>{{ t("publicSite.previewNote") }}</p>
  </figure>
</template>
<script setup lang="ts">
import { t } from "../../i18n";
const boxes = [
  [160, 149],
  [233, 159],
  [306, 170],
  [205, 119],
  [278, 129],
  [351, 140],
  [160, 91],
  [233, 101],
  [306, 112]
];
</script>
