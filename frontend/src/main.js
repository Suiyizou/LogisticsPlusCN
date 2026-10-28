import { createApp } from "vue";
import { i18n, t } from "./i18n";

async function mountApplication() {
  const hasLegacyRouteHash =
    window.location.hash?.startsWith("#/") || window.location.hash === "#admin";
  const isPublicLanding = window.location.pathname === "/" && !hasLegacyRouteHash;
  let RootComponent;
  let appRouter = null;
  let installSurface = () => {};

  if (isPublicLanding) {
    const { default: LandingEntry } = await import("./LandingEntry.vue");
    RootComponent = LandingEntry;
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

  const app = createApp(RootComponent);
  if (appRouter) {
    app.use(appRouter);
    // Resolve nested module routes before rendering. Router errors render the retry page.
    await appRouter.isReady().catch(() => {});
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
