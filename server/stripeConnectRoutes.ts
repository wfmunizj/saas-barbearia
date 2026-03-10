/**
 * server/stripeConnectRoutes.ts
 * Stripe Connect Express — onboarding + status + dashboard para barbearias
 *
 * Registrado em _core/index.ts:
 *   app.use("/api/connect", connectRouter);
 *
 * Fluxo: Destination Charges (sem taxa de plataforma)
 *   - Checkout Session criado na conta da plataforma
 *   - payment_intent_data.transfer_data.destination = conta Express da barbearia
 *   - 100% do valor vai para a conta conectada
 */
import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { barbershops, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover" as any,
});

export const connectRouter = Router();

// ─── Helper: autentica owner (mesmo padrão do saasSubscriptionRoutes) ─────────
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

// ─── Helper: busca barbearia do owner ─────────────────────────────────────────
async function getBarbershop(db: any, barbershopId: number) {
  const [bs] = await db
    .select()
    .from(barbershops)
    .where(eq(barbershops.id, barbershopId))
    .limit(1);
  return bs ?? null;
}

// ─── GET /api/connect/status ──────────────────────────────────────────────────
// Retorna status da conta Connect da barbearia
connectRouter.get("/status", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.status(401).json({ error: "Não autorizado" });
  const { user, db } = auth;

  const bs = await getBarbershop(db, user.barbershopId!);
  if (!bs) return res.status(404).json({ error: "Barbearia não encontrada" });

  if (!bs.stripeConnectAccountId) {
    return res.json({ connected: false });
  }

  try {
    const account = await stripe.accounts.retrieve(bs.stripeConnectAccountId);
    return res.json({
      connected: true,
      accountId: bs.stripeConnectAccountId,
      status: bs.stripeConnectStatus,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch (err: any) {
    console.error("[Connect] Erro ao buscar conta:", err.message);
    // Conta pode ter sido deletada — limpa no banco
    if (err.code === "account_invalid" || err.statusCode === 404) {
      await db
        .update(barbershops)
        .set({ stripeConnectAccountId: null, stripeConnectStatus: null })
        .where(eq(barbershops.id, user.barbershopId!));
      return res.json({ connected: false });
    }
    return res.status(500).json({ error: "Erro ao consultar conta Stripe" });
  }
});

// ─── POST /api/connect/onboard ────────────────────────────────────────────────
// Cria conta Express (se não existir) e retorna URL de onboarding
connectRouter.post("/onboard", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.status(401).json({ error: "Não autorizado" });
  const { user, db } = auth;

  const bs = await getBarbershop(db, user.barbershopId!);
  if (!bs) return res.status(404).json({ error: "Barbearia não encontrada" });

  const origin = req.headers.origin ?? `${req.protocol}://${req.headers.host}`;

  let accountId = bs.stripeConnectAccountId;

  // Cria conta Express se não existe
  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        country: "BR",
        email: user.email ?? undefined,
        business_profile: {
          name: bs.name ?? undefined,
          mcc: "7299", // Personal Services — inclui barbearias
        },
        metadata: {
          barbershopId: String(user.barbershopId),
        },
      });
      accountId = account.id;

      await db
        .update(barbershops)
        .set({
          stripeConnectAccountId: accountId,
          stripeConnectStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(barbershops.id, user.barbershopId!));

      console.log("[Connect] Conta Express criada:", accountId, "para barbearia:", user.barbershopId);
    } catch (err: any) {
      console.error("[Connect] Erro ao criar conta:", err.message);
      return res.status(500).json({ error: "Erro ao criar conta Stripe" });
    }
  }

  // Gera Account Link para onboarding
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/api/connect/refresh`,
      return_url: `${origin}/api/connect/return`,
      type: "account_onboarding",
    });

    return res.json({ url: accountLink.url });
  } catch (err: any) {
    console.error("[Connect] Erro ao criar account link:", err.message);
    return res.status(500).json({ error: "Erro ao gerar link de onboarding" });
  }
});

// ─── GET /api/connect/return ──────────────────────────────────────────────────
// Stripe redireciona aqui após o onboarding — sincroniza status e redireciona
connectRouter.get("/return", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.redirect("/login?connect=error");
  const { user, db } = auth;

  const bs = await getBarbershop(db, user.barbershopId!);
  if (!bs?.stripeConnectAccountId) return res.redirect("/subscription?connect=error");

  try {
    const account = await stripe.accounts.retrieve(bs.stripeConnectAccountId);
    const status = account.charges_enabled ? "active" : "restricted";

    await db
      .update(barbershops)
      .set({ stripeConnectStatus: status, updatedAt: new Date() })
      .where(eq(barbershops.id, user.barbershopId!));

    console.log("[Connect] Onboarding concluído:", bs.stripeConnectAccountId, "→", status);
    return res.redirect("/subscription?connect=success");
  } catch (err: any) {
    console.error("[Connect] Erro ao verificar conta após onboarding:", err.message);
    return res.redirect("/subscription?connect=error");
  }
});

// ─── GET /api/connect/refresh ─────────────────────────────────────────────────
// Stripe redireciona aqui quando o Account Link expira — regera e redireciona
connectRouter.get("/refresh", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.redirect("/login?connect=error");
  const { user, db } = auth;

  const bs = await getBarbershop(db, user.barbershopId!);
  if (!bs?.stripeConnectAccountId) return res.redirect("/subscription?connect=error");

  const origin = req.headers.origin ?? `${req.protocol}://${req.headers.host}`;

  try {
    const accountLink = await stripe.accountLinks.create({
      account: bs.stripeConnectAccountId,
      refresh_url: `${origin}/api/connect/refresh`,
      return_url: `${origin}/api/connect/return`,
      type: "account_onboarding",
    });

    return res.redirect(accountLink.url);
  } catch (err: any) {
    console.error("[Connect] Erro ao regenerar account link:", err.message);
    return res.redirect("/subscription?connect=error");
  }
});

// ─── POST /api/connect/dashboard ─────────────────────────────────────────────
// Cria login link para o Express Dashboard da barbearia
connectRouter.post("/dashboard", async (req: Request, res: Response) => {
  const auth = await getOwner(req);
  if (!auth) return res.status(401).json({ error: "Não autorizado" });
  const { user, db } = auth;

  const bs = await getBarbershop(db, user.barbershopId!);
  if (!bs?.stripeConnectAccountId) {
    return res.status(400).json({ error: "Nenhuma conta Stripe conectada" });
  }

  try {
    const loginLink = await stripe.accounts.createLoginLink(bs.stripeConnectAccountId);
    return res.json({ url: loginLink.url });
  } catch (err: any) {
    console.error("[Connect] Erro ao criar login link:", err.message);
    // Conta pode não ter completado o onboarding
    if (err.code === "account_invalid") {
      return res.status(400).json({ error: "Complete o cadastro no Stripe antes de acessar o dashboard" });
    }
    return res.status(500).json({ error: "Erro ao abrir dashboard Stripe" });
  }
});
