export function isPublicPath(path) {
  return (
    path === "/" || path === "/services" || path === "/services/" || path.startsWith("/services/")
  );
}

export function createPublicServiceRoutes() {
  return [
    {
      path: "/services",
      name: "public-services",
      component: () => import("../components/public/ServiceIndexPage.vue"),
      meta: { surface: "public" }
    },
    {
      path: "/services/:slug",
      name: "public-service-detail",
      component: () => import("../components/public/ServiceDetailPage.vue"),
      meta: { surface: "public" }
    },
    {
      path: "/services/:pathMatch(.*)*",
      name: "public-service-not-found",
      component: () => import("../components/public/ServiceDetailPage.vue"),
      meta: { surface: "public" }
    }
  ];
}
