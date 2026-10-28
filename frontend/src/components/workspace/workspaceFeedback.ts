import type { InjectionKey, Ref } from "vue";
export const workspaceFeedbackKey: InjectionKey<{
  message: Readonly<Ref<string>>;
  isError: Readonly<Ref<boolean>>;
}> = Symbol("workspace-dialog-feedback");
