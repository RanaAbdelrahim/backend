// src/index.js
import "dotenv/config";
import { createServer } from "./server.js";
import { initMarketingCron } from "./utils/marketingCron.js";
import serverless from "serverless-http";

let appInstance;
let handler; // Will hold the wrapped serverless handler

async function initApp() {
  if (!appInstance) {
    appInstance = await createServer();

    // Cron jobs won't persist on Vercel
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
      console.log(`✅ EventX API running on http://localhost:${PORT}`);
    });
  });
}

// ✅ Vercel serverless handler
export default async function handlerVercel(req, res) {
  if (!handler) {
    const app = await initApp();
    handler = serverless(app); // wrap the Express app only once
  }
  return handler(req, res);
}
