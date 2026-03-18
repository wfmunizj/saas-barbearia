/**
 * server/mpConnectRoutes.ts
 * Mercado Pago Marketplace OAuth — conectar barbearia para receber pagamentos
 *
 * Registrado em _core/index.ts:
 *   app.use("/api/mp", mpConnectRouter);
 *
 * Fluxo OAuth:
 *   1. Dono clica "Conectar MP" → POST /api/mp/connect/auth-url
 *   2. Redireciona para página de autorização do MP
 *   3. Dono autoriza → MP redireciona para GET /api/mp/connect/callback?code=...
 *   4. Trocamos code por access_token e salvamos no banco
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { barbershops, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

export const mpConnectRouter = Router();

const MP_CLIENT_ID = process.env.MP_CLIENT_ID!;
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET!;

/** Deriva a base URL do próprio request (funciona em prod/preview/local sem env var) */
function getBaseUrl(req: Request): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ?? req.protocol ?? "http";
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost:3000";
  return `${proto}://${host}`;
}

// ─── Helper: autentica owner ──────────────────────────────────────────────────
async function getOwner(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const map = Object.fromEntries(
    cookies.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [decodeURIComponent(k.trim()), decodeURIComponent(v.join("="))];
    })
  );
  const token = map[COOKIE_NAME];
  if (!token) return null;
  const session = await sdk.verifySession(token);
  if (!session) return null;
  const userId = parseInt(session.openId);
  if (isNaN(userId)) return null;
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !["owner", "admin"].includes(user.role)) return null;
  return { user, db };
}

// ─── GET /api/mp/connect/status ───────────────────────────────────────────────
mpConnectRouter.get("/connect/status", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.status(401).json({ error: "Não autorizado" });
  const { user, db } = auth;

  const [bs] = await db
    .select()
    .from(barbershops)
    .where(eq(barbershops.id, user.barbershopId!))
    .limit(1);

  if (!bs) return res.status(404).json({ error: "Barbearia não encontrada" });

  return res.json({
    connected: bs.mpConnectStatus === "active",
    status: bs.mpConnectStatus ?? "not_connected",
    mpUserId: bs.mpUserId ?? null,
  });
});

// ─── POST /api/mp/connect/auth-url ────────────────────────────────────────────
// Retorna URL de autorização OAuth do Mercado Pago
mpConnectRouter.post("/connect/auth-url", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.status(401).json({ error: "Não autorizado" });

  const redirectUri = `${getBaseUrl(req)}/api/mp/connect/callback`;
  const state = String(auth.user.barbershopId); // usado para identificar a barbearia no callback

  const authUrl = new URL("https://auth.mercadopago.com/authorization");
  authUrl.searchParams.set("client_id", MP_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("platform_id", "mp");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return res.json({ url: authUrl.toString() });
});

// ─── GET /api/mp/connect/callback ────────────────────────────────────────────
// MP redireciona aqui após autorização com ?code=...&state=barbershopId
mpConnectRouter.get("/connect/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    console.error("[MPConnect] Callback sem code ou state");
    return res.redirect("/configuracoes?mp_connect=error");
  }

  const barbershopId = parseInt(state);
  if (isNaN(barbershopId)) {
    return res.redirect("/configuracoes?mp_connect=error");
  }

  const db = await getDb();
  if (!db) return res.redirect("/configuracoes?mp_connect=error");

  const redirectUri = `${getBaseUrl(req)}/api/mp/connect/callback`;

  try {
    // Troca code por access_token
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[MPConnect] Erro ao trocar code:", err);
      return res.redirect("/configuracoes?mp_connect=error");
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      user_id: number;
    };

    await db
      .update(barbershops)
      .set({
        mpAccessToken: tokenData.access_token,
        mpRefreshToken: tokenData.refresh_token,
        mpUserId: String(tokenData.user_id),
        mpConnectStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(barbershops.id, barbershopId));

    console.log("[MPConnect] Conta conectada — barbershop:", barbershopId, "MP user:", tokenData.user_id);
    return res.redirect("/configuracoes?mp_connect=success");
  } catch (err: any) {
    console.error("[MPConnect] Erro no callback:", err.message);
    return res.redirect("/configuracoes?mp_connect=error");
  }
});

// ─── POST /api/mp/connect/disconnect ─────────────────────────────────────────
// Desconecta a conta MP da barbearia
mpConnectRouter.post("/connect/disconnect", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.status(401).json({ error: "Não autorizado" });
  const { user, db } = auth;

  await db
    .update(barbershops)
    .set({
      mpAccessToken: null,
      mpRefreshToken: null,
      mpUserId: null,
      mpConnectStatus: "not_connected",
      updatedAt: new Date(),
    })
    .where(eq(barbershops.id, user.barbershopId!));

  return res.json({ success: true });
});
