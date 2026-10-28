import { onMounted, onUnmounted } from "vue";
export function usePublicReveal(root) {
  let observer;
  onMounted(() => {
    const target = root.value;
    if (
      !target ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const elements = target.querySelectorAll("[data-public-reveal]");
    observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -24px 0px" }
    );
    elements.forEach((element) => {
      element.classList.add("will-reveal");
      observer.observe(element);
    });
  });
  onUnmounted(() => observer?.disconnect());
}
