/**
 * server/mpSaasRoutes.ts
 * Billing SaaS com Mercado Pago Checkout Pro
 * Substitui saasSubscriptionRoutes.ts
 *
 * Registrado em _core/index.ts:
 *   app.use("/api/saas", mpSaasRouter);
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { users, barbershops } from "../drizzle/schema";
import { eq, sql, SQL } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

const TRIAL_DAYS = 7;
export const mpSaasRouter = Router();

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

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
  if (!user || !["owner", "admin", "barber"].includes(user.role)) return null;
  return user;
}

async function rawSql(db: any, query: SQL): Promise<any[]> {
  const r = await db.execute(query);
  return Array.isArray(r) ? r : (r.rows ?? []);
}

// ─── GET /api/saas/plans ──────────────────────────────────────────────────────
mpSaasRouter.get("/plans", async (_req: Request, res: Response) => {
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });
  const plans = await rawSql(db, sql`SELECT id, name, description, price_in_cents, max_barbers, sort_order FROM saas_plans WHERE is_active = true ORDER BY sort_order ASC`);
  return res.json({ plans });
});

// ─── GET /api/saas/subscription ───────────────────────────────────────────────
mpSaasRouter.get("/subscription", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const rows = await rawSql(db, sql`
    SELECT ss.*, sp.name as plan_name, sp.max_barbers, sp.max_barbershops, sp.price_in_cents
    FROM saas_subscriptions ss
    JOIN saas_plans sp ON sp.id = ss.saas_plan_id
    WHERE ss.barbershop_id IN (
      SELECT id FROM barbershops WHERE owner_id = ${owner.id}
    )
    ORDER BY CASE WHEN ss.status = 'active' THEN 0 WHEN ss.status = 'trialing' THEN 1 ELSE 2 END ASC,
    ss.created_at DESC LIMIT 1
  `);
  const sub = rows[0] ?? null;
  if (!sub) return res.json({ subscription: null, canUse: false, daysLeftTrial: null });

  // Verifica expiração do trial
  if (sub.status === "trialing" && sub.trial_ends_at) {
    if (new Date(sub.trial_ends_at) < new Date()) {
      await rawSql(db, sql`UPDATE saas_subscriptions SET status='expired', updated_at=NOW() WHERE id=${sub.id}`);
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
mpSaasRouter.post("/start-trial", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const existing = await rawSql(db, sql`SELECT id FROM saas_subscriptions WHERE barbershop_id = ${owner.barbershopId} LIMIT 1`);
  if (existing.length > 0) return res.status(409).json({ error: "Já possui assinatura" });

  const plans = await rawSql(db, sql`SELECT id FROM saas_plans WHERE name = 'Profissional' AND is_active = true LIMIT 1`);
  const plan = plans[0];
  if (!plan) return res.status(500).json({ error: "Plano padrão não encontrado" });

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  await rawSql(db, sql`INSERT INTO saas_subscriptions (barbershop_id, saas_plan_id, status, trial_ends_at) VALUES (${owner.barbershopId}, ${plan.id}, 'trialing', ${trialEndsAt.toISOString()})`);

  return res.json({ success: true, trialEndsAt, trialDays: TRIAL_DAYS });
});

// ─── POST /api/saas/checkout ──────────────────────────────────────────────────
// Cria Preference do MP para assinar um plano SaaS
mpSaasRouter.post("/checkout", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: "planId obrigatório" });
  const planIdInt = parseInt(String(planId));
  if (isNaN(planIdInt)) return res.status(400).json({ error: "planId inválido" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  const plans = await rawSql(db, sql`SELECT * FROM saas_plans WHERE id = ${planIdInt} AND is_active = true LIMIT 1`);
  const plan = plans[0];
  if (!plan) return res.status(404).json({ error: "Plano não encontrado" });

  const [bs] = await db
    .select()
    .from(barbershops)
    .where(eq(barbershops.id, owner.barbershopId!))
    .limit(1);

  const origin = req.headers.origin ?? BASE_URL;

  // Cria Preference no MP (Checkout Pro)
  const preferenceBody = {
    items: [
      {
        id: String(plan.id),
        title: `Plano SaaS — ${plan.name}`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: plan.price_in_cents / 100,
      },
    ],
    payer: {
      email: owner.email ?? undefined,
      name: bs?.name ?? owner.name ?? undefined,
    },
    back_urls: {
      success: `${origin}/subscription?success=true`,
      failure: `${origin}/subscription?cancelled=true`,
      pending: `${origin}/subscription?pending=true`,
    },
    auto_return: "approved",
    notification_url: `${BASE_URL}/api/mp/webhook`,
    external_reference: `saas|barbershopId:${owner.barbershopId}|planId:${planId}`,
    metadata: {
      type: "saas_subscription",
      barbershop_id: String(owner.barbershopId),
      saas_plan_id: String(planId),
    },
  };

  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(preferenceBody),
  });

  if (!mpRes.ok) {
    const err = await mpRes.text();
    console.error("[SaaS] Erro ao criar preference MP:", err);
    return res.status(500).json({ error: "Erro ao criar checkout" });
  }

  const preference = await mpRes.json() as any;
  return res.json({ url: preference.init_point });
});

// ─── POST /api/saas/cancel ────────────────────────────────────────────────────
// Cancela a assinatura SaaS (sem portal externo, feito direto)
mpSaasRouter.post("/cancel", async (req: Request, res: Response) => {
  const owner = await getOwner(req);
  if (!owner) return res.status(401).json({ error: "Não autorizado" });
  const db = await getDb();
  if (!db) return res.status(500).json({ error: "Banco indisponível" });

  await rawSql(db, sql`UPDATE saas_subscriptions SET status='cancelled', cancelled_at=NOW(), updated_at=NOW() WHERE barbershop_id=${owner.barbershopId} AND status IN ('active','trialing')`);

  return res.json({ success: true });
});
