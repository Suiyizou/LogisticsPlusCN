import { onScopeDispose, reactive, watch } from "vue";

/** Short-lived credentials shared by customer and agent reset dialogs. */
export function usePasswordResetResult({
  canManage,
  t,
  writeClipboard = (text) => globalThis.navigator.clipboard.writeText(text)
}) {
  const passwordResetResult = reactive({
    open: false,
    username: "",
    password: "",
    copied: false,
    copying: false
  });
  let disposed = false;
  let version = 0;
  function closePasswordResetResult() {
    version++;
    Object.assign(passwordResetResult, {
      open: false,
      username: "",
      password: "",
      copied: false,
      copying: false
    });
  }
  function openPasswordResetResult(username, password) {
    if (disposed || !canManage.value) return false;
    closePasswordResetResult();
    Object.assign(passwordResetResult, {
      open: true,
      username: String(username || ""),
      password: String(password || "")
    });
    return true;
  }
  async function copyPasswordResetResult() {
    if (disposed || !canManage.value || !passwordResetResult.open || passwordResetResult.copying)
      return false;
    const captured = version;
    const current = () =>
      !disposed && canManage.value && captured === version && passwordResetResult.open;
    const text = `${t("customers.username")}: ${passwordResetResult.username}\n${t("customers.newPassword")}: ${passwordResetResult.password}`;
    passwordResetResult.copying = true;
    passwordResetResult.copied = false;
    try {
      await writeClipboard(text);
      if (!current()) return false;
      passwordResetResult.copied = true;
      return true;
    } catch {
      return false;
    } finally {
      if (current()) passwordResetResult.copying = false;
    }
  }
  watch(
    canManage,
    (allowed) => {
      if (!allowed) closePasswordResetResult();
    },
    { immediate: true, flush: "sync" }
  );
  onScopeDispose(() => {
    disposed = true;
    closePasswordResetResult();
  });
  return {
    passwordResetResult,
    openPasswordResetResult,
    closePasswordResetResult,
    copyPasswordResetResult
  };
}
