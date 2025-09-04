// src/index.js
import "dotenv/config";
import { createServer } from "./server.js";
import { initMarketingCron } from "./utils/marketingCron.js";
import serverless from "serverless-http";

let appInstance;
let handler; // wrap once for Vercel

async function initApp() {
  if (!appInstance) {
    appInstance = await createServer();

    // Cron jobs won't persist on serverless
    try {
      initMarketingCron();
    } catch (e) {
      console.warn("⚠️ Cron skipped:", e?.message);
    }
  }
  return appInstance;
}

// Local development mode
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

// Vercel serverless handler
export default async function handlerVercel(req, res) {
  if (!handler) {
    const app = await initApp();
    handler = serverless(app); // wrap the Express app only once
  }
  return handler(req, res);
}
