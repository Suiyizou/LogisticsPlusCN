import { createApp } from "vue";
import { i18n, t } from "./i18n";
import { isPublicPath } from "./public/routes.js";

async function mountApplication() {
  const legacyPath = window.location.hash?.startsWith("#/") ? window.location.hash.slice(1) : "";
  const isPublicLanding =
    window.location.hash !== "#admin" && isPublicPath(legacyPath || window.location.pathname);
  let RootComponent;
  let appRouter = null;
  let installSurface = () => {};
  let captureInitialRouteFailure = null;

  if (isPublicLanding) {
    if (legacyPath) window.history.replaceState(null, "", legacyPath);
    const [{ default: PublicEntry }, { publicRouter, publicNavigation }] = await Promise.all([
      import("./PublicEntry.vue"),
      import("./public/router.js")
    ]);
    RootComponent = PublicEntry;
    appRouter = publicRouter;
    captureInitialRouteFailure = (error) =>
      publicNavigation.captureInitialFailure(
        error,
        window.location.pathname + window.location.search + window.location.hash
      );
  } else {
    const [{ default: ApplicationEntry }, { installLegacyDomI18n }, { router }] = await Promise.all(
      [
        import("./ApplicationEntry.vue"),
        import("./i18n/legacyDom"),
        import("./router"),
        import("./styles.css")
      ]
    );
    RootComponent = ApplicationEntry;
    appRouter = router;
    installSurface = () => installLegacyDomI18n();
  }
  await import("./design-system.css");
  await import("./login.css");
  await import("./workspace-hifi.css");

  const app = createApp(RootComponent);
  if (appRouter) {
    app.use(appRouter);
    // Resolve nested module routes before rendering. Router errors render the retry page.
    await appRouter.isReady().catch((error) => {
      captureInitialRouteFailure?.(error);
    });
  }
  app.use(i18n);
  installSurface(app);
  app.mount("#app");
}

mountApplication().catch(() => {
  const card = document.querySelector(".boot-card");
  if (!card) return;
  const message = card.querySelector("p");
  if (message) message.textContent = t("app.pageLoadFailedHint");
  card.setAttribute("role", "alert");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = t("app.retry");
  retry.addEventListener("click", () => window.location.reload());
  card.append(retry);
});
