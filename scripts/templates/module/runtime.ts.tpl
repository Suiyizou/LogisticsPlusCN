import { ref, reactive, onScopeDispose } from "vue";
import { create__NAME__Api } from "../../generated/__ID__-api";
import type {
  __NAME__Write,
  __NAME__Response
} from "../../generated/__ID__-api";
import { defaults, fields } from "../../generated/__ID__-model";
import { markApiErrorHandled } from "../../services/apiClient.js";

type RuntimeDependencies = {
  api?: ReturnType<typeof create__NAME__Api>;
  handled?: typeof markApiErrorHandled;
};
// Workflow file: regeneration preserves local business rules.
export function use__NAME__(
  t: (key: string) => string,
  dependencies: RuntimeDependencies = {}
) {
  const api = dependencies.api || create__NAME__Api(),
    handled = dependencies.handled || markApiErrorHandled;
  const rows = ref<__NAME__Response[]>([]);
  const loading = ref(false),
    saving = ref(false),
    visible = ref(false);
  const query = ref(""),
    page = ref(0),
    pageSize = ref(20),
    total = ref(0),
    error = ref("");
  const editing = ref<__NAME__Response | null>(null);
  const draft = reactive<__NAME__Write>({ ...defaults });
  let currentRead: AbortController | undefined,
    currentWrite: AbortController | undefined,
    disposed = false;
  function describe(failure: unknown) {
    handled(failure);
    if (
      failure &&
      typeof failure === "object" &&
      "name" in failure &&
      failure.name === "AbortError"
    )
      return;
    error.value =
      failure && typeof failure === "object" && "status" in failure && failure.status === 409
        ? t("__CAMEL__.stale")
        : failure instanceof Error
          ? failure.message
          : t("__CAMEL__.error");
  }
  async function refresh(): Promise<boolean> {
    if (disposed) return false;
    currentRead?.abort();
    const operation = new AbortController();
    currentRead = operation;
    const requestedPage = page.value;
    loading.value = true;
    error.value = "";
    try {
      const result = await api.list(
        requestedPage,
        pageSize.value,
        query.value.trim(),
        operation.signal
      );
      if (disposed || currentRead !== operation) return false;
      if (
        !Number.isInteger(result.total) ||
        result.total < 0 ||
        !Number.isInteger(result.totalPages) ||
        result.totalPages < 0 ||
        (result.total > 0 && result.totalPages < 1) ||
        !Array.isArray(result.items)
      )
        throw Error(t("__CAMEL__.error"));
      if (result.total > 0 && requestedPage >= result.totalPages) {
        page.value = Math.max(0, result.totalPages - 1);
        return refresh();
      }
      rows.value = result.items;
      total.value = result.total;
      if (!result.total) page.value = 0;
      return true;
    } catch (failure) {
      if (!disposed && currentRead === operation) describe(failure);
      return false;
    } finally {
      if (!disposed && currentRead === operation) loading.value = false;
    }
  }
  function open(row: __NAME__Response | null = null) {
    if (disposed || saving.value) return false;
    editing.value = row ? { ...row } : null;
    error.value = "";
    Object.assign(draft, defaults);
    if (row) for (const field of fields) Reflect.set(draft, field.name, row[field.name]);
    visible.value = true;
    return true;
  }
  function openById(id: string) {
    const row = rows.value.find((item) => item.id === id);
    return row ? open(row) : false;
  }
  function setDraft(
    name: (typeof fields)[number]["name"],
    value: string | number | boolean | null
  ) {
    if (!disposed && !saving.value && visible.value) Reflect.set(draft, name, value);
  }
  function close() {
    if (disposed || saving.value) return false;
    visible.value = false;
    return true;
  }
  function setDialogOpen(next: boolean) {
    if (!next) close();
  }
  async function save(): Promise<boolean> {
    if (disposed || saving.value || !visible.value) return false;
    const operation = new AbortController();
    currentWrite = operation;
    const target = editing.value ? { id: editing.value.id, version: editing.value.version } : null;
    saving.value = true;
    error.value = "";
    const values = { ...draft };
    for (const field of fields) {
      const value = values[field.name];
      if (typeof value === "string")
        Reflect.set(values, field.name, !field.required && !value.trim() ? null : value.trim());
    }
    try {
      if (target)
        await api.update(target.id, { version: target.version, values }, operation.signal);
      else await api.create(values, operation.signal);
      if (disposed || currentWrite !== operation) return false;
      visible.value = false;
      await refresh();
      return true;
    } catch (failure) {
      if (!disposed && currentWrite === operation) describe(failure);
      return false;
    } finally {
      if (!disposed && currentWrite === operation) saving.value = false;
    }
  }
  async function changePage(next: number) {
    if (disposed || saving.value || !Number.isInteger(next) || next < 0 || next === page.value)
      return false;
    page.value = next;
    return refresh();
  }
  async function search() {
    if (disposed) return false;
    page.value = 0;
    return refresh();
  }
  onScopeDispose(() => {
    disposed = true;
    currentRead?.abort();
    currentWrite?.abort();
  });
  return {
    rows,
    loading,
    saving,
    visible,
    query,
    page,
    pageSize,
    total,
    error,
    editing,
    draft,
    refresh,
    open,
    openById,
    setDraft,
    save,
    search,
    changePage,
    close,
    setDialogOpen
  };
}
