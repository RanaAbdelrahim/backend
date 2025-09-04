// src/index.js
import "dotenv/config";
import "./utils/dateHelpers.js";
import { createServer } from "./server.js";
import { initMarketingCron } from "./utils/marketingCron.js";

const DEFAULT_PORT = Number(process.env.PORT) || 5003;
const isVercel = !!process.env.VERCEL;

let appInstance;

/**
 * Initialize the Express app once
 */
async function initApp() {
  if (!appInstance) {
    // 1) Build app (connects DB inside createServer)
    appInstance = await createServer();

    // 2) Initialize cron (⚠️ won't persist on Vercel)
    try {
      initMarketingCron();
    } catch (e) {
      console.warn("⚠️ Cron skipped:", e?.message);
    }

    // 3) Optional seeding (set SEED=false in .env to skip)
    try {
      if (process.env.SEED !== "false") {
        const mod = await import("./seed/performSeeding.js").catch(() => null);
        if (mod?.performSeeding) {
          await mod.performSeeding();
          console.log("🌱 Seeding complete");
        }
      }
    } catch (e) {
      console.error("Seeding failed:", e?.message || e);
    }

    // 4) Verify admin user exists
    try {
      const { default: User } = await import("./models/User.js");
      const admin = await User.findOne({ email: "admin@eventx.dev" });
      if (admin) {
        console.log("👤 Admin user verified in database");
      } else {
        console.warn("⚠️ Admin user not found in database!");
      }
    } catch (e) {
      console.error("Admin verification failed:", e?.message || e);
    }
  }

  return appInstance;
}

/**
 * Local development mode
 */
if (!isVercel) {
  initApp().then((app) => {
    app.listen(DEFAULT_PORT, () => {
      const clientOrigins =
        (process.env.CLIENT_URL || "http://localhost:5173")
          .split(",")
          .map((s) => s.trim())
          .join(", ");
      console.log(`✅ EventX API running on http://localhost:${DEFAULT_PORT}`);
      console.log(`🔓 CORS enabled for: ${clientOrigins}`);
    });
  });
}

/**
 * Vercel serverless handler
 */
export default async function handler(req, res) {
  const app = await initApp();
  return app(req, res);
}
