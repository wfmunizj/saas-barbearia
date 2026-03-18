/**
 * server/_core/handler.ts
 * Entry point para Vercel Serverless — exporta o Express app sem chamar server.listen()
 * Para Railway/desenvolvimento, usar server/_core/index.ts normalmente.
 */
import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleMpWebhook } from "../mp-webhook";
import { authRouter } from "../authRoutes";
import { clientAuthRouter } from "../clientAuth";
import { barberUserRouter } from "../barberUserRoutes";
import { mpSaasRouter } from "../mpSaasRoutes";
import { mpConnectRouter } from "../mpConnectRoutes";
import { pdfExportRouter } from "../pdfExport";
// scheduleAutoComplete NÃO é chamado aqui — Vercel é stateless
// Para produção no Railway, usar index.ts que chama scheduleAutoComplete()

const app = express();

// MP webhook DEVE estar antes do express.json() para preservar raw body
app.post(
  "/api/mp/webhook",
  express.raw({ type: "*/*" }),
  handleMpWebhook
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerOAuthRoutes(app);

app.use("/api/auth", authRouter);
app.use("/api/client", clientAuthRouter);
app.use("/api/barber-users", barberUserRouter);
app.use("/api/saas", mpSaasRouter);
app.use("/api/mp", mpConnectRouter);
app.use("/api/reports", pdfExportRouter);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Static files são servidos pelo CDN da Vercel — sem serveStatic() aqui

export default app;
