import { computed, onScopeDispose, reactive, ref, toValue, watch } from "vue";

/** Own-account editing. Dependencies stay injectable; credentials never enter shared state. */
export function usePersonalProfile({
  currentUser,
  updateOwnProfile,
  changeOwnPassword,
  saveStoredUser,
  onUserUpdated,
  showSuccess,
  t
}) {
  const personalProfileOpen = ref(false);
  const personalProfileSaving = ref(false);
  const personalProfileError = ref("");
  const personalProfileForm = reactive({ displayName: "" });
  const personalPasswordSaving = ref(false);
  const personalPasswordError = ref("");
  const personalPasswordSuccess = ref("");
  const personalPasswordForm = reactive({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const busy = computed(() => personalProfileSaving.value || personalPasswordSaving.value);
  const identity = computed(() => {
    const user = toValue(currentUser);
    return user ? JSON.stringify([user.id, user.username, user.role]) : "";
  });
  let disposed = false;
  let sessionVersion = 0;

  function clearPassword() {
    Object.assign(personalPasswordForm, {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    });
  }
  function resetForm() {
    personalProfileForm.displayName = "";
    personalProfileError.value = "";
    clearPassword();
    personalPasswordError.value = "";
    personalPasswordSuccess.value = "";
  }
  function invalidate() {
    sessionVersion++;
    resetForm();
    personalProfileSaving.value = false;
    personalPasswordSaving.value = false;
  }
  watch(
    identity,
    () => {
      personalProfileOpen.value = false;
      invalidate();
    },
    { flush: "sync" }
  );
  watch(
    personalProfileOpen,
    (open) => {
      if (!open) invalidate();
    },
    { flush: "sync" }
  );

  function openPersonalProfile() {
    if (disposed || busy.value || !identity.value) return false;
    // Repeated menu clicks must preserve unsaved edits in the existing dialog.
    if (personalProfileOpen.value) return true;
    sessionVersion++;
    resetForm();
    personalProfileForm.displayName = toValue(currentUser)?.displayName || "";
    personalProfileOpen.value = true;
    return true;
  }
  function closePersonalProfile() {
    if (busy.value) return false;
    personalProfileOpen.value = false;
    resetForm();
    return true;
  }
  function beforeClose(done) {
    if (closePersonalProfile()) done();
  }
  const canSubmit = () =>
    !disposed && personalProfileOpen.value && Boolean(identity.value) && !busy.value;
  const validResponse = (version, userIdentity) =>
    !disposed &&
    personalProfileOpen.value &&
    version === sessionVersion &&
    identity.value === userIdentity;

  async function savePersonalProfile() {
    if (!canSubmit()) return false;
    const nextName = personalProfileForm.displayName.trim();
    personalProfileError.value = "";
    if (nextName.length < 2 || nextName.length > 80) {
      personalProfileError.value = t("portal.displayNameRule");
      return false;
    }
    const version = sessionVersion;
    const userIdentity = identity.value;
    personalProfileSaving.value = true;
    try {
      const user = await updateOwnProfile(nextName);
      if (!validResponse(version, userIdentity)) return false;
      saveStoredUser(user);
      onUserUpdated(user);
      if (!validResponse(version, userIdentity)) return false;
      personalProfileOpen.value = false;
      showSuccess("portal.profileSaved");
      return true;
    } catch (error) {
      if (validResponse(version, userIdentity)) {
        personalProfileError.value = error?.message || t("portal.profileSaveFailed");
      }
      return false;
    } finally {
      if (version === sessionVersion && !disposed) personalProfileSaving.value = false;
    }
  }

  async function savePersonalPassword() {
    if (!canSubmit()) return false;
    const { currentPassword, newPassword, confirmPassword } = personalPasswordForm;
    personalPasswordError.value = "";
    personalPasswordSuccess.value = "";
    if (!currentPassword || !newPassword || !confirmPassword) {
      personalPasswordError.value = t("portal.passwordFieldsRequired");
      return false;
    }
    if (newPassword !== confirmPassword) {
      personalPasswordError.value = t("portal.passwordMismatch");
      return false;
    }
    if (
      newPassword.length < 8 ||
      newPassword.length > 128 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      personalPasswordError.value = t("portal.passwordRule");
      return false;
    }
    const version = sessionVersion;
    const userIdentity = identity.value;
    personalPasswordSaving.value = true;
    try {
      await changeOwnPassword(currentPassword, newPassword);
      if (!validResponse(version, userIdentity)) return false;
      clearPassword();
      personalPasswordSuccess.value = t("portal.passwordChanged");
      return true;
    } catch (error) {
      if (validResponse(version, userIdentity)) {
        personalPasswordError.value = error?.message || t("portal.passwordChangeFailed");
      }
      return false;
    } finally {
      if (version === sessionVersion && !disposed) personalPasswordSaving.value = false;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    personalProfileOpen.value = false;
    invalidate();
  });
  return {
    personalProfileOpen,
    personalProfileSaving,
    personalProfileError,
    personalProfileForm,
    personalPasswordSaving,
    personalPasswordError,
    personalPasswordSuccess,
    personalPasswordForm,
    busy,
    openPersonalProfile,
    closePersonalProfile,
    beforeClose,
    savePersonalProfile,
    savePersonalPassword
  };
}
