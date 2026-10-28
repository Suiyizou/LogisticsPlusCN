<template>
  <div ref="root" class="public-select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <select
      v-if="!enhanced"
      :id="id"
      :value="modelValue"
      :disabled="disabled"
      :aria-labelledby="labelledby"
      @change="nativeChange"
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <template v-else>
      <button
        :id="id"
        ref="control"
        type="button"
        role="combobox"
        :disabled="disabled"
        :aria-expanded="open"
        :aria-controls="listId"
        aria-haspopup="listbox"
        :aria-labelledby="labelledby + ' ' + id + '-value'"
        :aria-activedescendant="open && options[active] ? optionId(active) : undefined"
        @click="toggle"
        @keydown="keydown"
      >
        <span :id="id + '-value'">{{ selectedLabel }}</span
        ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      <Transition name="public-select"
        ><ul v-if="open" :id="listId" role="listbox" :aria-labelledby="labelledby">
          <li
            v-for="(option, index) in options"
            :id="optionId(index)"
            :key="option.value"
            role="option"
            :aria-selected="option.value === modelValue"
            :aria-disabled="option.disabled || undefined"
            :class="{
              'is-active': index === active,
              'is-selected': option.value === modelValue,
              'is-disabled': option.disabled
            }"
            @pointermove="activate(index)"
            @pointerdown.prevent
            @click="choose(index)"
          >
            <span>{{ option.label }}</span
            ><svg v-if="option.value === modelValue" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3 8 3 3 7-7" />
            </svg>
          </li>
          <li v-if="!options.length" class="public-select-empty">
            {{ t("publicSite.selectNoOptions") }}
          </li>
        </ul></Transition
      >
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from "vue";
import { t } from "../../i18n";
type Option = { value: string; label: string; disabled?: boolean };
const props = withDefaults(
  defineProps<{
    id: string;
    labelledby: string;
    modelValue: string;
    options: Option[];
    disabled?: boolean;
  }>(),
  { disabled: false }
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const root = ref<HTMLElement | null>(null),
  control = ref<HTMLButtonElement | null>(null),
  open = ref(false),
  enhanced = ref(false),
  active = ref(0);
const listId = useId();
const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label || ""
);
let query: MediaQueryList | undefined,
  typeTimer: ReturnType<typeof setTimeout> | undefined,
  typed = "";
const optionId = (index: number) => listId + "-" + index;
const enabled = () =>
  props.options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
function activate(index: number) {
  if (!props.options[index]?.disabled) active.value = index;
}
function reveal() {
  void nextTick(() =>
    document.getElementById(optionId(active.value))?.scrollIntoView({ block: "nearest" })
  );
}
function show() {
  if (props.disabled) return;
  const selected = props.options.findIndex(
    (option) => option.value === props.modelValue && !option.disabled
  );
  active.value = selected >= 0 ? selected : (enabled()[0] ?? 0);
  open.value = true;
  reveal();
}
function toggle() {
  if (open.value) open.value = false;
  else show();
}
function choose(index: number) {
  const option = props.options[index];
  if (!option || option.disabled) return;
  emit("update:modelValue", option.value);
  open.value = false;
  control.value?.focus();
}
function move(delta: number) {
  const choices = enabled();
  if (!choices.length) return;
  const current = choices.indexOf(active.value);
  active.value = choices[(current + delta + choices.length) % choices.length];
  reveal();
}
function keydown(event: KeyboardEvent) {
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const wasOpen = open.value;
    if (!wasOpen) show();
    if (event.key === "Home") active.value = enabled()[0] ?? 0;
    else if (event.key === "End") active.value = enabled().at(-1) ?? 0;
    else if (wasOpen) move(event.key === "ArrowDown" ? 1 : -1);
    reveal();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (open.value) choose(active.value);
    else show();
    return;
  }
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    control.value?.focus();
    return;
  }
  if (event.key === "Tab") {
    open.value = false;
    return;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    clearTimeout(typeTimer);
    typed += event.key.toLocaleLowerCase();
    typeTimer = setTimeout(() => {
      typed = "";
    }, 600);
    const index = props.options.findIndex(
      (option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(typed)
    );
    if (index >= 0) {
      if (!open.value) show();
      active.value = index;
      reveal();
    }
  }
}
function nativeChange(event: Event) {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
}
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}
function update() {
  enhanced.value = Boolean(query?.matches);
  open.value = false;
}
watch(
  () => props.disabled,
  (value) => {
    if (value) open.value = false;
  }
);
watch(
  () => props.options,
  () => {
    if (active.value >= props.options.length) active.value = 0;
  }
);
onMounted(() => {
  query = window.matchMedia("(min-width:768px) and (hover:hover) and (pointer:fine)");
  update();
  query.addEventListener("change", update);
  document.addEventListener("pointerdown", outside);
});
onUnmounted(() => {
  clearTimeout(typeTimer);
  query?.removeEventListener("change", update);
  document.removeEventListener("pointerdown", outside);
});
</script>
