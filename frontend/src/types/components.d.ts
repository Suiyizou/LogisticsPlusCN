import "element-plus/global";
import type { HTMLAttributes } from "vue";

/** Element Plus is installed globally in main.js; these attributes are native DOM fallthrough. */
declare module "vue" {
  interface HTMLAttributes {
    [attribute: `data-${string}`]: string | boolean | undefined;
    "element-loading-text"?: string;
  }
  interface AllowedComponentProps extends Pick<
    HTMLAttributes,
    "title" | "role" | "aria-label" | "onSubmit"
  > {
    "element-loading-text"?: string;
    elementLoadingText?: string;
  }
  interface GlobalDirectives {
    vLoading: (typeof import("element-plus"))["vLoading"];
  }
}
