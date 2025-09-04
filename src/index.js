// src/index.js
import "dotenv/config";
import "./utils/dateHelpers.js";
import { createServer } from "./server.js";
import { initMarketingCron } from "./utils/marketingCron.js";

let appInstance;

/**
 * Initialize the Express app once
 */
async function initApp() {
  if (!appInstance) {
    appInstance = await createServer();

    // Cron jobs won’t persist on serverless
    try {
      initMarketingCron();
    } catch (e) {
      console.warn("⚠️ Cron skipped:", e?.message);
    }
  }

  return appInstance;
}

/**
 * Local development mode
 */
if (!process.env.VERCEL) {
  initApp().then((app) => {
    const PORT = process.env.PORT || 5003;
    app.listen(PORT, () => {
      const clientOrigins =
        (process.env.CLIENT_URL || "http://localhost:5173")
          .split(",")
          .map((s) => s.trim())
          .join(", ");
      console.log(`✅ EventX API running on http://localhost:${PORT}`);
      console.log(`🔓 CORS enabled for: ${clientOrigins}`);
    });
  });
}

/**
 * Vercel serverless handler
 */
export default async function handler(req, res) {
  const app = await initApp();
  return app(req, res); // This is what Vercel calls
}
