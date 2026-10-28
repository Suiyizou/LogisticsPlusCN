<script setup lang="ts">
defineProps<{ kind: "planner" | "tracking" | "customers" | "booking" }>();
</script>
<template>
  <svg
    class="workbench-illustration"
    :class="`is-${kind}`"
    viewBox="0 0 260 200"
    fill="none"
    aria-hidden="true"
  >
    <g v-if="kind === 'planner'" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
      <path class="illustration-ground" d="M20 169 178 194 251 143 97 122z" />
      <path fill="#e8f0f4" d="M23 71 178 24 241 45 86 96z" />
      <path fill="#f7fafb" d="M23 71v106l63 21V96z" />
      <path fill="#d8e6ed" d="M86 96 241 45v105L86 198z" />
      <path
        d="M31 76v98m8-95v98m8-95v98m8-95v98m8-95v98m8-95v98M94 99v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90m10-94v90"
        opacity=".3"
      />
      <g class="illustration-cargo">
        <path
          fill="#d9e5ee"
          d="m91 130 29-10 27 9-29 11zM91 130v34l27 10v-34zM118 140l29-11v35l-29 10z"
        />
        <path
          fill="#ba4b25"
          fill-opacity=".76"
          d="m143 101 34-11 31 10-35 12zM143 101v51l30 11v-51zM173 112l35-12v50l-35 13z"
        />
        <path
          fill="#cddde8"
          d="m176 62 28-9 22 7-28 10zM176 62v26l22 8V70zM198 70l28-10v26l-28 10z"
        />
        <path
          fill="#f4f7fa"
          d="m123 159 29-10 23 8-29 11zM123 159v25l23 8v-24zM146 168l29-11v25l-29 10z"
        />
      </g>
      <path d="m86 96 155-51M86 198V96L23 71m0 106 63 21 155-48V45l-63-21L23 71" stroke-width="2" />
    </g>
    <g
      v-else-if="kind === 'tracking'"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linejoin="round"
    >
      <path
        fill="#edf3f6"
        stroke="none"
        d="m36 27 22-13 33 7 6 15 20-4 23 19-15 16-18-8-11 23-18-4-8-25-26 4zm109-6 33-10 45 16 17 26-23 12-15-10-16 20-17-17-32 4 8-25zM68 103l28-11 26 17-10 35-23 29-11-24z"
      />
      <path
        d="M17 169c35-11 73 12 109 3s72-13 119-4m-229 9c39-6 75 10 111 5s69-11 116-4"
        opacity=".25"
      />
      <path
        class="illustration-route"
        d="M38 96c30-43 68 41 111 15s46-41 72-21"
        stroke-dasharray="3 4"
      />
      <circle cx="38" cy="96" r="4" fill="#ba4b25" />
      <circle cx="221" cy="90" r="4" fill="#ba4b25" />
      <path fill="#e2edf2" d="m101 139 55 1-10 13h-36z" />
      <path
        d="M116 139v-17h20v17m-13-17v17m-13-8h40M16 155V107l35-10 17 6H26m-3 8v44m28-52v36m-10 16h24M189 144V96l32-17 27 7h-49m0 14v44m22-58v30m-13 28h31"
      />
      <path
        fill="#ba4b25"
        fill-opacity=".7"
        d="M117 133h13v6h-13zm14 0h12v6h-12zM204 133h18v11h-18z"
      />
    </g>
    <g
      v-else-if="kind === 'customers'"
      stroke="currentColor"
      stroke-width="1.2"
      stroke-linejoin="round"
    >
      <rect x="39" y="23" width="166" height="146" rx="4" fill="#f7fafc" />
      <path fill="#e5edf3" d="M39 27a4 4 0 0 1 4-4h158a4 4 0 0 1 4 4v15H39z" />
      <circle cx="48" cy="33" r="2" />
      <circle cx="56" cy="33" r="2" />
      <circle cx="64" cy="33" r="2" />
      <path
        d="M51 54h139M51 75h139M51 95h139M51 115h139M51 135h139M51 155h139"
        stroke="#d5e2e9"
        stroke-width="7"
      />
      <path stroke="#ba4b25" stroke-width="8" d="M51 96h121" />
      <path
        stroke="#b7cfdd"
        stroke-width="5"
        d="M60 74h28m22 0h38M60 115h26m24 0h43M60 135h28m22 0h22"
      />
      <path fill="#ffffff" d="M164 70h46l24 25v83h-70z" />
      <path fill="#e8f0f4" d="M210 70v25h24" />
      <path d="M177 112h42m-42 12h42m-42 12h28" />
      <rect x="147" y="149" width="47" height="43" rx="4" fill="#d7e6ee" />
      <rect x="198" y="132" width="44" height="43" rx="4" fill="#e7eff4" />
      <path d="M156 161h28m-28 9h20m24-27h24m-24 9h18" />
    </g>
    <g v-else stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
      <path fill="#eaf2f6" stroke="none" d="M13 59c29-18 48 0 74-12s57-14 78-3 54-4 77 6v130H13z" />
      <path
        d="M15 170c40-10 65 12 105 2s72-7 124 0m-229 9c42-8 76 8 111 0s74-2 118 3"
        opacity=".4"
      />
      <path
        d="M21 147V64l62-29 30 19H34m-5 15v78m54-103v66m-17 37h34M150 138V57l63-27 28 17h-78m-5 16v76m55-104v65m-14 39h30"
        stroke-width="2"
      />
      <path fill="#15384a" d="M71 139h144l-23 24H92z" />
      <path fill="#dce9ef" d="M184 117h20v22h-20zm5-9h10v9h-10z" />
      <path
        fill="#ba4b25"
        fill-opacity=".75"
        d="M93 118h30v20H93zm32 0h30v20h-30zm-16-22h30v20h-30z"
      />
      <path fill="#a6c4d7" d="M157 118h25v20h-25zm-16-22h24v20h-24z" />
      <path d="M101 119v19m15-19v19m17-19v19m14-19v19m-30-41v19m14-19v19" opacity=".45" />
    </g>
  </svg>
</template>
<style scoped>
.workbench-illustration {
  width: 100%;
  height: 100%;
  color: var(--color-primary);
  overflow: visible;
  opacity: 0.88;
  transition: transform var(--motion-normal) var(--motion-ease);
}
.illustration-ground {
  fill: var(--color-surface-subtle);
  stroke: none;
}
:global(.workbench-entry-card:hover) .workbench-illustration {
  transform: translateY(-3px);
}
:global(.workbench-entry-card:hover) .illustration-route {
  animation: route-flow 1.8s linear infinite;
}
@keyframes route-flow {
  to {
    stroke-dashoffset: -21;
  }
}
@media (prefers-reduced-motion: reduce) {
  .workbench-illustration {
    transition: none;
  }
  :global(.workbench-entry-card:hover) .workbench-illustration {
    transform: none;
  }
  :global(.workbench-entry-card:hover) .illustration-route {
    animation: none;
  }
}
</style>
