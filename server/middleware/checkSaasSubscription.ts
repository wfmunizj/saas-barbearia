/**
 * server/middleware/checkSaasSubscription.ts
 *
 * Exemplo de uso em qualquer rota protegida:
 *   import { checkSaasSubscription } from "../middleware/checkSaasSubscription";
 *   router.get("/barbers", checkSaasSubscription, listBarbers);
 *
 * Ou globalmente no index.ts para proteger todas as rotas /api/trpc:
 *   app.use("/api/trpc", checkSaasSubscription, createExpressMiddleware(...));
 */
import { Request, Response, NextFunction } from "express";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { users } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";

async function getBarbershopIdFromRequest(req: Request): Promise<number | null> {
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
  return user?.barbershopId ?? null;
}

export async function checkSaasSubscription(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const barbershopId = await getBarbershopIdFromRequest(req);

  if (!barbershopId) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  const db = await getDb();
  if (!db) {
    return res.status(503).json({
      error: "service_unavailable",
      message: "Serviço temporariamente indisponível. Tente novamente em instantes.",
    });
  }

  const result = await db.execute(sql`
    SELECT ss.id, ss.status, ss.trial_ends_at FROM saas_subscriptions ss
    WHERE ss.barbershop_id IN (
      SELECT id FROM barbershops WHERE owner_id = (
        SELECT owner_id FROM barbershops WHERE id = ${barbershopId}
      )
    )
    AND ss.status IN ('active','trialing','past_due','cancelled','expired')
    ORDER BY CASE WHEN ss.status = 'active' THEN 0 WHEN ss.status = 'trialing' THEN 1 ELSE 2 END ASC
    LIMIT 1
  `);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  const sub = rows[0];

  if (!sub) {
    return res.status(402).json({
      error: "subscription_required",
      message: "Inicie seu período de teste gratuito para usar o sistema.",
    });
  }

  if (sub.status === "trialing") {
    const trialEnd = new Date(sub.trial_ends_at);
    if (trialEnd < new Date()) {
      // Atualiza status no banco e bloqueia
      await db.execute(sql`UPDATE saas_subscriptions SET status='expired', updated_at=NOW() WHERE id=${sub.id}`);
      return res.status(402).json({
        error: "trial_expired",
        message: "Seu período de teste encerrou. Assine um plano para continuar.",
      });
    }
  }

  if (sub.status === "past_due") {
    return res.status(402).json({
      error: "payment_past_due",
      message: "Pagamento em atraso. Atualize seu método de pagamento para continuar.",
    });
  }

  if (sub.status === "cancelled" || sub.status === "expired") {
    return res.status(402).json({
      error: "subscription_inactive",
      message: "Sua assinatura está inativa. Escolha um plano para reativar o acesso.",
    });
  }

  next();
}