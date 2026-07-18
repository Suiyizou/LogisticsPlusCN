import { createApp, h } from "vue";
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
    installSurface = (app) => app.component("ElIcon", {
      name: "ElIcon",
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h("i", { ...attrs, class: ["el-icon", attrs.class] }, slots.default?.());
      }
    });
  } else {
    const [{ default: App }, { default: ElementPlus }, { installLegacyDomI18n }, { router }] = await Promise.all([
      import("./App.vue"),
      import("element-plus"),
      import("./i18n/legacyDom"),
      import("./router"),
      import("element-plus/dist/index.css"),
      import("./styles.css")
    ]);
    RootComponent = App;
    appRouter = router;
    installSurface = (app) => {
      app.use(ElementPlus);
      installLegacyDomI18n();
    };
  }

  const app = createApp(RootComponent);
  if (appRouter) app.use(appRouter);
  app.use(i18n);
  installSurface(app);
  app.mount("#app");
}

mountApplication();
