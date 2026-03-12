import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleMpWebhook } from "../mp-webhook";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";
import { authRouter } from "../authRoutes";
import { clientAuthRouter } from "../clientAuth";
import { getDb } from "../db";
import { users, barbershops } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { barberUserRouter } from "../barberUserRoutes";
import { mpSaasRouter } from "../mpSaasRoutes";
import { mpConnectRouter } from "../mpConnectRoutes";
import { scheduleAutoComplete } from "../autoComplete";


function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // MP webhook MUST be registered BEFORE express.json() to preserve raw body
  app.post(
    "/api/mp/webhook",
    express.raw({ type: "*/*" }),
    handleMpWebhook
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
  app.use("/api/saas", mpSaasRouter);
  app.use("/api/mp", mpConnectRouter);
  // Development helper: cria sessão mock automaticamente para o primeiro owner
  // if (process.env.NODE_ENV === "development") {
  //   app.use(async (req, res, next) => {
  //     try {
  //       const cookieHeader = req.headers.cookie ?? "";
  //       if (!cookieHeader.includes(COOKIE_NAME)) {
  //         const db = await getDb();
  //         if (db) {
  //           // Busca o primeiro usuário owner no banco para usar como mock
  //           const [ownerUser] = await db
  //             .select()
  //             .from(users)
  //             .where(eq(users.role, "owner"))
  //             .limit(1);

  //           if (ownerUser) {
  //             const token = await sdk.createSessionToken(
  //               ownerUser.id.toString(),
  //               {
  //                 name: ownerUser.name || "Owner",
  //               }
  //             );
  //             res.cookie(COOKIE_NAME, token, {
  //               httpOnly: true,
  //               maxAge: ONE_YEAR_MS,
  //               path: "/",
  //               sameSite: "lax",
  //               secure: false,
  //             });
  //             console.log(
  //               `[Dev] Mock session para user id=${ownerUser.id} (${ownerUser.email})`
  //             );
  //           } else {
  //             console.log(
  //               "[Dev] Nenhum owner encontrado no banco — faça cadastro em /register"
  //             );
  //           }
  //         }
  //       }
  //     } catch (err) {
  //       console.warn("[Dev] Failed to set mock session cookie:", err);
  //     }
  //     next();
  //   });
  // }

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Agenda conclusão automática de agendamentos passados às 23:30 diariamente
    scheduleAutoComplete();
  });
}

startServer().catch(console.error);
