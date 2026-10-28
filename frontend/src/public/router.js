import { createRouter, createWebHistory } from "vue-router";
import { createPublicServiceRoutes } from "./routes.js";
import { installPublicNavigationState } from "./navigationState.js";

export const publicRouter = createRouter({
  history: createWebHistory("/"),
  routes: [
    {
      path: "/",
      name: "public-home",
      component: () => import("../components/PublicLandingPage.vue")
    },
    ...createPublicServiceRoutes()
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, top: 110 };
    return { top: 0 };
  }
});

export const publicNavigation = installPublicNavigationState(publicRouter);
