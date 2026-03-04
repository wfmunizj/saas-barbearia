/**
 * server/saasSubscriptionRoutes.ts
 * Registrar no index.ts:
 *   import { saasRouter } from "../saasSubscriptionRoutes";
 *   app.use("/api/saas", saasRouter);
 */
import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { users, barbershops } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover" as any,
});

const TRIAL_DAYS = 7;
export const saasRouter = Router();

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
  if (!user || (user.role !== "owner" && user.role !== "admin")) return null;
  return user;
}

async function rawSql(db: any, query: string): Promise<any[]> {
  const r = await db.execute(query as any);
  // postgres-js retorna array direto
  return Array.isArray(r) ? r : (r.rows ?? []);
}

// ─── GET /api/saas/plans ──────────────────────────────────────────────────────
saasRouter.get("/plans", async (_req: Request, res: Response) => {
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });
  const plans = await rawSql(db,
    "SELECT id, name, description, price_in_cents, max_barbers, sort_order " +
    "FROM saas_plans WHERE is_active = true ORDER BY sort_order ASC"
  );
  return res.json({ plans });
});

// ─── GET /api/saas/subscription ───────────────────────────────────────────────
saasRouter.get("/subscription", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const rows = await rawSql(db,
    "SELECT ss.*, sp.name as plan_name, sp.max_barbers, sp.price_in_cents " +
    "FROM saas_subscriptions ss " +
    "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
    "WHERE ss.barbershop_id = " + owner.barbershopId + " " +
    "ORDER BY ss.created_at DESC LIMIT 1"
  );
  const sub = rows[0] ?? null;
  if (!sub) return res.json({ subscription: null, canUse: false, daysLeftTrial: null });

  // Verifica expiração do trial
  if (sub.status === "trialing" && sub.trial_ends_at) {
    if (new Date(sub.trial_ends_at) < new Date()) {
      await rawSql(db,
        "UPDATE saas_subscriptions SET status='expired', updated_at=NOW() WHERE id=" + sub.id
      );
      sub.status = "expired";
    }
  }

  const canUse = sub.status === "trialing" || sub.status === "active";
  const daysLeftTrial =
    sub.status === "trialing" && sub.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000))
      : null;

  return res.json({ subscription: sub, canUse, daysLeftTrial });
});

// ─── POST /api/saas/start-trial ───────────────────────────────────────────────
// Chamado automaticamente no registerBarbershop (auth.ts)
saasRouter.post("/start-trial", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const existing = await rawSql(db,
    "SELECT id FROM saas_subscriptions WHERE barbershop_id = " + owner.barbershopId + " LIMIT 1"
  );
  if (existing.length > 0) return res.status(409).json({ error: "Já possui assinatura" });

  const plans = await rawSql(db,
    "SELECT id FROM saas_plans WHERE name = 'Profissional' AND is_active = true LIMIT 1"
  );
  const plan = plans[0];
  if (!plan) return res.status(500).json({ error: "Plano padrão não encontrado" });

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  await rawSql(db,
    "INSERT INTO saas_subscriptions (barbershop_id, saas_plan_id, status, trial_ends_at) VALUES (" +
    owner.barbershopId + ", " + plan.id + ", 'trialing', '" + trialEndsAt.toISOString() + "')"
  );

  return res.json({ success: true, trialEndsAt, trialDays: TRIAL_DAYS });
});

// ─── POST /api/saas/checkout ──────────────────────────────────────────────────
saasRouter.post("/checkout", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: "planId obrigatório" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const plans = await rawSql(db,
    "SELECT * FROM saas_plans WHERE id = " + planId + " AND is_active = true LIMIT 1"
  );
  const plan = plans[0];
  if (!plan) return res.status(404).json({ error: "Plano não encontrado" });
  if (!plan.stripe_price_id)
    return res.status(400).json({ error: "Stripe ainda não configurado para este plano. Adicione o stripe_price_id no banco." });

  // Busca ou cria customer Stripe
  const subRows = await rawSql(db,
    "SELECT stripe_customer_id FROM saas_subscriptions WHERE barbershop_id = " + owner.barbershopId + " LIMIT 1"
  );
  let stripeCustomerId = subRows[0]?.stripe_customer_id;

  if (!stripeCustomerId) {
    const [bs] = await db.select().from(barbershops)
      .where(eq(barbershops.id, owner.barbershopId!)).limit(1);
    const customer = await stripe.customers.create({
      email: owner.email ?? undefined,
      name: bs?.name ?? owner.name ?? undefined,
      metadata: { barbershopId: String(owner.barbershopId) },
    });
    stripeCustomerId = customer.id;
    await rawSql(db,
      "UPDATE saas_subscriptions SET stripe_customer_id='" + stripeCustomerId +
      "', updated_at=NOW() WHERE barbershop_id=" + owner.barbershopId
    );
  }

  const origin = req.headers.origin ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
  customer: stripeCustomerId,
  mode: "subscription",
  payment_method_types: ["card"],
  line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
  subscription_data: {
    // trial_period_days: 7,  
    metadata: {
      barbershopId: String(owner.barbershopId),
      saasPlanId: String(planId),
    },
  },
  success_url: origin + "/subscription?success=true",
  cancel_url: origin + "/subscription?cancelled=true",
  metadata: {
    type: "saas_subscription",
    barbershopId: String(owner.barbershopId),
    saasPlanId: String(planId),
  },
});

  return res.json({ url: session.url });
});

// ─── POST /api/saas/portal ────────────────────────────────────────────────────
saasRouter.post("/portal", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const subRows = await rawSql(db,
    "SELECT stripe_customer_id FROM saas_subscriptions WHERE barbershop_id = " + owner.barbershopId + " LIMIT 1"
  );
  const stripeCustomerId = subRows[0]?.stripe_customer_id;
  if (!stripeCustomerId)
    return res.status(400).json({ error: "Sem assinatura Stripe vinculada" });

  const origin = req.headers.origin ?? "http://localhost:3000";
  const portal = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: origin + "/subscription",
  });

  return res.json({ url: portal.url });
});