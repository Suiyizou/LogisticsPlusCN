import { createApp } from "vue";
import { i18n } from "./i18n";

async function mountApplication() {
  const hasLegacyRouteHash = window.location.hash?.startsWith("#/") || window.location.hash === "#admin";
  const isPublicLanding = window.location.pathname === "/" && !hasLegacyRouteHash;
  let RootComponent;
  let appRouter = null;
  let installSurface = () => {};

  if (isPublicLanding) {
    const [{ default: LandingEntry }] = await Promise.all([
      import("./LandingEntry.vue"),
      import("./landing.css")
    ]);
    RootComponent = LandingEntry;
  } else {
    const [{ default: ApplicationEntry }, { installLegacyDomI18n }, { router }] = await Promise.all([
      import("./ApplicationEntry.vue"),
      import("./i18n/legacyDom"),
      import("./router"),
      import("./styles.css")
    ]);
    RootComponent = ApplicationEntry;
    appRouter = router;
    installSurface = () => installLegacyDomI18n();
  }
  await import("./design-system.css");

  const app = createApp(RootComponent);
  if (appRouter) app.use(appRouter);
  app.use(i18n);
  installSurface(app);
  app.mount("#app");
}

mountApplication();
