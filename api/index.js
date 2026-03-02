import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth.js";
import { appRouter } from "../server/routers.js";
import { createContext } from "../server/_core/context.js";
import { handleStripeWebhook } from "../server/stripe-webhook.js";
import { serveStatic, setupVite } from "../server/_core/vite.js";
import { sdk } from "../server/_core/sdk.js";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { ENV } from "../server/_core/env.js";
import { authRouter } from "../server/authRoutes.js";
import { clientAuthRouter } from "../server/clientAuth.js";
import { getDb } from "../server/db.js";
import { users, barbershops } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { barberUserRouter } from "../server/barberUserRoutes.js";

const app = express();

// Stripe webhook MUST be registered BEFORE express.json() to preserve raw body
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// OAuth callback (mantido para compatibilidade)
registerOAuthRoutes(app);

// Auth própria (register, login, logout, me)
app.use("/api/auth", authRouter);
app.use("/api/client", clientAuthRouter);
app.use("/api/barber-users", barberUserRouter);

// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Serve static files from dist/public
serveStatic(app);

export default app;
