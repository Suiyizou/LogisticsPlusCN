// A diagnostic image must not discard independently captured, bound DOM rows.
// Browser closure and other errors still fail the query; only a screenshot's
// own bounded timeout can be recorded as a missing diagnostic image.
export async function captureNavigatorDiagnosticScreenshot(page, options, container) {
  try {
    await page.screenshot(options);
    return {kind:'NAVIGATOR_TRACKING_SCREENSHOT',container,path:options.path,status:'captured'};
  } catch(error) {
    if(error?.name!=='TimeoutError'||page.isClosed())throw error;
    return {kind:'NAVIGATOR_TRACKING_SCREENSHOT',container,path:null,status:'unavailable',reason:'SCREENSHOT_TIMEOUT'};
  }
}
