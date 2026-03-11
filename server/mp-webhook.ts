/**
 * server/mp-webhook.ts
 * Handler de webhooks/IPN do Mercado Pago
 *
 * Registrado em _core/index.ts ANTES do express.json():
 *   app.post("/api/mp/webhook", express.raw({ type: "*\/*" }), handleMpWebhook);
 *
 * Eventos tratados:
 *   - payment (approved/refunded/cancelled) → pagamento avulso ou de assinatura
 *   - subscription_preapproval (authorized/cancelled/paused) → assinatura do cliente
 *   - subscription_preapproval_plan → sincronização de plano SaaS
 */
import { Request, Response } from "express";
import { getDb } from "./db";
import { payments, subscriptions, clientUsers, plans, appointments } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!;

// ─── Helper: busca dados de um pagamento no MP ────────────────────────────────
async function getMpPayment(paymentId: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<any>;
}

// ─── Helper: busca dados de uma assinatura no MP ──────────────────────────────
async function getMpSubscription(subscriptionId: string) {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<any>;
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function handleMpWebhook(req: Request, res: Response) {
  // MP pode enviar tanto IPN (query params) quanto webhook (body JSON)
  const topic = (req.query.topic ?? req.query.type) as string | undefined;
  const id = (req.query.id ?? req.query["data.id"]) as string | undefined;

  // Para webhooks via body JSON
  let bodyData: any = {};
  try {
    const raw = req.body;
    if (Buffer.isBuffer(raw)) bodyData = JSON.parse(raw.toString());
    else if (typeof raw === "object") bodyData = raw;
  } catch (_) {}

  const eventTopic = topic ?? bodyData?.type;
  const eventId = id ?? bodyData?.data?.id;

  console.log(`[MPWebhook] topic=${eventTopic} id=${eventId}`);

  if (!eventTopic || !eventId) {
    // MP às vezes envia pings de teste sem dados — responder 200
    return res.status(200).json({ received: true });
  }

  try {
    switch (eventTopic) {
      case "payment":
        await handlePaymentEvent(eventId);
        break;

      case "subscription_preapproval":
        await handleSubscriptionEvent(eventId);
        break;

      default:
        console.log(`[MPWebhook] Evento não tratado: ${eventTopic}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[MPWebhook] Erro ao processar evento:", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

// ─── payment ─────────────────────────────────────────────────────────────────
async function handlePaymentEvent(paymentId: string) {
  const payment = await getMpPayment(paymentId);
  if (!payment) {
    console.warn("[MPWebhook] Pagamento não encontrado:", paymentId);
    return;
  }

  console.log(`[MPWebhook] payment ${paymentId} status=${payment.status}`);

  const db = await getDb();
  if (!db) return;

  const metadata = payment.metadata ?? {};
  const appointmentId = metadata.appointment_id ? parseInt(metadata.appointment_id) : null;
  const clientId = metadata.client_id ? parseInt(metadata.client_id) : null;
  const barbershopId = metadata.barbershop_id ? parseInt(metadata.barbershop_id) : null;
  const planId = metadata.plan_id ? parseInt(metadata.plan_id) : null;

  if (payment.status === "approved") {
    // Se é pagamento de assinatura, não registra aqui (vem via subscription_preapproval)
    if (planId) {
      console.log("[MPWebhook] Pagamento de assinatura — tratado via subscription_preapproval");
      return;
    }

    if (!clientId || !barbershopId) {
      console.error("[MPWebhook] Metadata incompleto — client_id/barbershop_id ausentes");
      return;
    }

    // Verifica idempotência
    const [existing] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.mpPaymentId, String(paymentId)))
      .limit(1);

    if (existing) {
      console.log("[MPWebhook] Pagamento já registrado:", paymentId);
      return;
    }

    // Detecta método de pagamento
    const pmMethod = payment.payment_type_id === "bank_transfer" ? "pix"
      : payment.payment_type_id === "ticket" ? "boleto"
      : "card";

    await db.insert(payments).values({
      appointmentId,
      clientId,
      barbershopId,
      amountInCents: Math.round((payment.transaction_amount ?? 0) * 100),
      status: "completed",
      paymentMethod: pmMethod,
      mpPaymentId: String(paymentId),
      mpPreferenceId: payment.preference_id ?? null,
    });

    console.log("[MPWebhook] Pagamento avulso registrado — cliente:", clientId);

    // Confirma agendamento se havia appointment_id
    if (appointmentId) {
      await db
        .update(appointments)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(appointments.id, appointmentId));
      console.log("[MPWebhook] Agendamento confirmado:", appointmentId);
    }
  } else if (payment.status === "refunded" || payment.status === "cancelled") {
    await db
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(payments.mpPaymentId, String(paymentId)));

    console.log("[MPWebhook] Pagamento reembolsado/cancelado:", paymentId);
  }
}

// ─── subscription_preapproval ─────────────────────────────────────────────────
async function handleSubscriptionEvent(subscriptionId: string) {
  const mpSub = await getMpSubscription(subscriptionId);
  if (!mpSub) {
    console.warn("[MPWebhook] Assinatura não encontrada:", subscriptionId);
    return;
  }

  console.log(`[MPWebhook] subscription ${subscriptionId} status=${mpSub.status}`);

  const db = await getDb();
  if (!db) return;

  const externalRef = mpSub.external_reference ?? "";
  // external_reference = "clientUserId:{id}|planId:{id}"
  const clientUserIdMatch = externalRef.match(/clientUserId:(\d+)/);
  const planIdMatch = externalRef.match(/planId:(\d+)/);

  if (!clientUserIdMatch || !planIdMatch) {
    console.warn("[MPWebhook] external_reference inválido:", externalRef);
    return;
  }

  const clientUserId = parseInt(clientUserIdMatch[1]);
  const planId = parseInt(planIdMatch[1]);

  const [clientUser] = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.id, clientUserId))
    .limit(1);

  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (!clientUser || !plan) {
    console.error("[MPWebhook] ClientUser ou Plano não encontrado:", { clientUserId, planId });
    return;
  }

  const statusMap: Record<string, "active" | "cancelled" | "past_due" | "trialing"> = {
    authorized: "active",
    paused: "past_due",
    cancelled: "cancelled",
    pending: "trialing",
  };
  const mappedStatus = statusMap[mpSub.status] ?? "cancelled";

  const now = new Date();
  const periodStart = mpSub.date_created ? new Date(mpSub.date_created) : now;
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clientUserId, clientUserId))
    .limit(1);

  if (existing) {
    const isNewPeriod =
      existing.currentPeriodStart !== null &&
      periodStart.getTime() > new Date(existing.currentPeriodStart).getTime();

    await db
      .update(subscriptions)
      .set({
        planId: plan.id,
        barbershopId: plan.barbershopId,
        status: mappedStatus,
        mpSubscriptionId: subscriptionId,
        mpPayerId: String(mpSub.payer_id ?? ""),
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        creditsRemaining: isNewPeriod ? plan.creditsPerMonth : existing.creditsRemaining,
        cancelledAt: mappedStatus === "cancelled" ? now : existing.cancelledAt,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id));

    console.log(`[MPWebhook] Assinatura atualizada (renewal=${isNewPeriod}) — clientUser:`, clientUserId);
  } else {
    await db.insert(subscriptions).values({
      clientUserId,
      planId: plan.id,
      barbershopId: plan.barbershopId,
      status: mappedStatus,
      mpSubscriptionId: subscriptionId,
      mpPayerId: String(mpSub.payer_id ?? ""),
      creditsRemaining: plan.creditsPerMonth,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    console.log("[MPWebhook] Assinatura criada — clientUser:", clientUserId);
  }
}
