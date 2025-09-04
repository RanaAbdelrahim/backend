// src/server.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./db.js";
import { seedAll } from "./seed/performSeeding.js";

// Routes
import authRoutes from "./routes/auth.js";
import eventsRoutes from "./routes/events.js";
import bookingsRoutes from "./routes/bookings.js";
import notificationsRoutes from "./routes/notifications.js";
import analyticsRoutes from "./routes/analytics.js";
import manageEventsRoutes from "./routes/manageEvents.js";
import debugRoutes from "./routes/debug.js";
import settingsRoutes from "./routes/settings.js";
import adminUsersRoutes from "./routes/adminUsers.js";
import marketingRoutes from "./routes/marketing.js";

export async function createServer() {
  // 1) DB
  await connectDB()
    .then(() => console.log("✅ Database connection established"))
    .catch((err) => {
      console.error("❌ Database connection failed:", err?.message || err);
      throw err;
    });

  // 2) Express app
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // 3) CORS
  const originsEnv =
    process.env.CLIENT_URL || process.env.CORS_ORIGINS || "http://localhost:5173";
  const allowedOrigins = originsEnv.split(",").map((s) => s.trim()).filter(Boolean);

  const corsOptions = {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin/cURL
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  // 4) Middleware
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

  // 5) Basic info routes
  app.get("/", (_req, res) => res.json({ message: "EventX API" }));
  app.get("/api", (_req, res) => res.json({ message: "EventX API is running" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, uptime: process.uptime() })
  );

  // 6) API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/events", eventsRoutes);
  app.use("/api/bookings", bookingsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/manage-events", manageEventsRoutes);
  app.use("/api/debug", debugRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/admin", adminUsersRoutes);
  app.use("/api/marketing", marketingRoutes);

  // 7) 404 for API paths
  app.use("/api/*", (_req, res) => res.status(404).json({ message: "Not Found" }));

  // 8) Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error("Error:", err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  // 9) Optional auto-seed
  if (process.env.SEED_ON_START === "true") {
    try {
      await seedAll();
      console.log("🌱 Auto-seeding completed successfully!");
    } catch (err) {
      console.error("❌ Auto-seeding failed:", err);
    }
  }

  return app;
}
