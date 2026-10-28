/** Retry with a fresh document, including when only the fragment differs. */
export function retryFailedPage(failedPath, browser = window) {
  if (failedPath) {
    const target = new URL(failedPath, browser.location.href);
    if (target.origin === browser.location.origin) {
      browser.history.replaceState(
        browser.history.state,
        "",
        target.pathname + target.search + target.hash
      );
    }
  }
  browser.location.reload();
}
