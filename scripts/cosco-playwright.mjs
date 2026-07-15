import {
  closeCoscoPlaywrightBrowser,
  fetchCoscoTrackingViaPlaywright
} from "../channels/cosco-playwright.mjs";

const argumentsList = process.argv.slice(2);
const number = String(
  argumentsList.find((argument) => !argument.startsWith("--")) ?? "6502077380"
)
  .trim()
  .replace(/\s+/g, "")
  .toUpperCase();

if (!/^[A-Z0-9-]{4,35}$/.test(number)) {
  throw new Error(`提单号格式不正确：${number}`);
}

if (argumentsList.includes("--headed")) {
  process.env.PLAYWRIGHT_HEADLESS = "false";
}

try {
  const result = await fetchCoscoTrackingViaPlaywright({
    type: "BILLOFLADING",
    number,
    businessNumberType: "blNumber"
  });

  console.log(
    JSON.stringify(
      {
        httpStatus: result.browser.responseStatus,
        requestUrl: result.browser.responseUrl,
        pageRenderedTrackingResult: result.browser.pageRenderedTrackingResult,
        summary: result.detail.cargoTrackingSummary,
        fullChain: result.detail.cargoTrackingFullChain,
        transportStatus: result.detail.cargoTrackingTransportStatus,
        sailingSchedule: result.detail.cargoTrackingSailingSchedule
      },
      null,
      2
    )
  );
} finally {
  await closeCoscoPlaywrightBrowser();
}
