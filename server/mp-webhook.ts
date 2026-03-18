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
import { createHmac, timingSafeEqual } from "crypto";
import { getDb } from "./db";
import { payments, subscriptions, clientUsers, plans, appointments } from "../drizzle/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

function verifyMpSignature(req: Request, eventId: string): boolean {
  // If no secret configured, skip verification (dev mode)
  if (!MP_WEBHOOK_SECRET) {
    console.warn("[MPWebhook] MP_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  const signatureHeader = req.headers["x-signature"] as string | undefined;
  const requestId = req.headers["x-request-id"] as string | undefined;

  if (!signatureHeader || !requestId) {
    return false;
  }

  // Parse ts and v1 from the header (format: "ts=...,v1=...")
  const parts = Object.fromEntries(
    signatureHeader.split(",").map(part => {
      const [k, ...v] = part.split("=");
      return [k.trim(), v.join("=").trim()];
    })
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // Build the signed message
  const message = `id:${eventId};request-id:${requestId};ts:${ts};`;

  // Compute expected signature
  const expected = createHmac("sha256", MP_WEBHOOK_SECRET)
    .update(message)
    .digest("hex");

  // Timing-safe comparison
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(v1, "hex");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

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

  // Verify MP webhook signature
  if (eventTopic && eventId) {
    if (!verifyMpSignature(req, eventId)) {
      console.warn("[MPWebhook] Assinatura inválida — requisição rejeitada");
      return res.status(401).json({ error: "Invalid signature" });
    }
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

  // O MP Checkout Pro nem sempre propaga o metadata para o objeto payment.
  // Usamos external_reference (sempre preservado) como fallback.
  // Formato: "clientUserId:X|planId:Y"  (definido em createSubscriptionCheckout)
  const externalRef: string = payment.external_reference ?? "";
  const extClientUserIdMatch = externalRef.match(/clientUserId:(\d+)/);
  const extPlanIdMatch = externalRef.match(/planId:(\d+)/);
  console.log(`[MPWebhook] external_reference="${externalRef}" metadata=${JSON.stringify(metadata)}`);

  const appointmentId = metadata.appointment_id ? parseInt(metadata.appointment_id) : null;
  const clientId = metadata.client_id ? parseInt(metadata.client_id) : null;
  const barbershopId = metadata.barbershop_id ? parseInt(metadata.barbershop_id) : null;

  // planId: tenta metadata primeiro, depois external_reference
  const planId =
    (metadata.plan_id ? parseInt(metadata.plan_id) : null) ??
    (extPlanIdMatch ? parseInt(extPlanIdMatch[1]) : null);

  // ── Detectar pagamento SaaS (dono da barbearia assinando a plataforma) ─────────
  // O external_reference SaaS começa com "saas|" e o metadata tem type="saas_subscription".
  // Sem este guard, o regex /planId:(\d+)/ captura o planId do external_reference SaaS
  // e o código tenta ativar uma assinatura de cliente — o que causa "Metadata incompleto".
  const isSaasPayment =
    metadata.type === "saas_subscription" || externalRef.startsWith("saas|");

  if (isSaasPayment) {
    if (payment.status !== "approved") return; // aguardar aprovação

    const saasBarShopIdStr = metadata.barbershop_id as string | undefined;
    const saasPlanIdStr = metadata.saas_plan_id as string | undefined;

    // Fallback: parse do external_reference ("saas|barbershopId:X|planId:Y")
    const extBsMatch = externalRef.match(/barbershopId:(\d+)/);
    const extSpMatch = externalRef.match(/planId:(\d+)/);
    const saasBarbershopId = saasBarShopIdStr
      ? parseInt(saasBarShopIdStr)
      : extBsMatch ? parseInt(extBsMatch[1]) : null;
    const saasPlanId = saasPlanIdStr
      ? parseInt(saasPlanIdStr)
      : extSpMatch ? parseInt(extSpMatch[1]) : null;

    if (!saasBarbershopId || !saasPlanId) {
      console.error("[MPWebhook] SaaS: metadata incompleto:", metadata);
      return;
    }

    // Idempotência: se já está ativo, ignorar
    const existingRows = await db.execute(sql`SELECT id, status FROM saas_subscriptions WHERE barbershop_id = ${saasBarbershopId} LIMIT 1`);
    const rows = Array.isArray(existingRows) ? existingRows : ((existingRows as any).rows ?? []);
    const existingSaasSub = rows[0];

    if (existingSaasSub?.status === "active") {
      console.log("[MPWebhook] SaaS: assinatura já ativa — ignorando:", paymentId);
      return;
    }

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (existingSaasSub) {
      await db.execute(sql`
        UPDATE saas_subscriptions SET status='active', saas_plan_id=${saasPlanId},
        current_period_end=${periodEnd.toISOString()}, cancelled_at=NULL, updated_at=NOW()
        WHERE barbershop_id=${saasBarbershopId}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO saas_subscriptions (barbershop_id, saas_plan_id, status, current_period_end)
        VALUES (${saasBarbershopId}, ${saasPlanId}, 'active', ${periodEnd.toISOString()})
      `);
    }

    console.log(`[MPWebhook] Assinatura SaaS ativada — barbershop:${saasBarbershopId} plano:${saasPlanId}`);
    return;
  }

  if (payment.status === "approved") {
    // Pagamento de assinatura via Checkout Pro (fallback para planos sem mpPreapprovalPlanId).
    // Não há evento subscription_preapproval neste caminho — ativamos a assinatura aqui.
    if (planId) {
      // Checkout Pro usado como fallback para planos sem mpPreapprovalPlanId.
      // Não haverá evento subscription_preapproval — ativamos a assinatura aqui.
      // NOTA: não inserimos na tabela payments pois client_id lá referencia clients.id,
      // e aqui temos clientUsers.id — usar payments para assinaturas é fora do escopo.
      // clientUserId: tenta metadata primeiro, depois external_reference
      const clientUserId =
        (metadata.client_user_id ? parseInt(metadata.client_user_id) : null) ??
        (extClientUserIdMatch ? parseInt(extClientUserIdMatch[1]) : null);

      // barbershopId virá do plano (buscado a seguir) quando metadata não tiver
      if (!clientUserId) {
        console.error("[MPWebhook] Metadata incompleto para ativação de assinatura:", metadata);
        return;
      }

      // Buscar plano para obter creditsPerMonth
      const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
      if (!plan) {
        console.error("[MPWebhook] Plano não encontrado:", planId);
        return;
      }

      // Criar/ativar assinatura por 1 mês
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const [existingSub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.clientUserId, clientUserId))
        .limit(1);

      // Idempotência: não reprocessar se já está ativo com o mesmo mpPayerId
      if (existingSub?.status === "active" && existingSub.mpPayerId === String(payment.payer?.id ?? "")) {
        console.log("[MPWebhook] Assinatura Checkout Pro já ativa — ignorando:", paymentId);
        return;
      }

      if (existingSub) {
        await db.update(subscriptions).set({
          planId: plan.id,
          barbershopId: plan.barbershopId,
          status: "active",
          mpPayerId: String(payment.payer?.id ?? ""),
          creditsRemaining: plan.creditsPerMonth,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
          updatedAt: now,
        }).where(eq(subscriptions.id, existingSub.id));
      } else {
        await db.insert(subscriptions).values({
          clientUserId,
          planId: plan.id,
          barbershopId: plan.barbershopId,
          status: "active",
          mpPayerId: String(payment.payer?.id ?? ""),
          creditsRemaining: plan.creditsPerMonth,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        });
      }

      console.log(`[MPWebhook] Assinatura ativada via Checkout Pro — clientUser:${clientUserId} plano:${planId}`);
      return;
    }

    if (!clientId || !barbershopId) {
      console.error("[MPWebhook] Metadata incompleto — client_id/barbershop_id ausentes");
      return;
    }

    // Detecta método de pagamento
    const pmMethod = payment.payment_type_id === "bank_transfer" ? "pix"
      : payment.payment_type_id === "ticket" ? "boleto"
      : "card";

    // INSERT idempotente — ON CONFLICT DO NOTHING evita duplicatas mesmo em race conditions
    // (o unique constraint em mp_payment_id garante que apenas 1 row seja inserida)
    const inserted = await db.insert(payments).values({
      appointmentId,
      clientId,
      barbershopId,
      amountInCents: Math.round((payment.transaction_amount ?? 0) * 100),
      status: "completed",
      paymentMethod: pmMethod,
      mpPaymentId: String(paymentId),
      mpPreferenceId: payment.preference_id ?? null,
    }).onConflictDoNothing().returning({ id: payments.id });

    if (!inserted.length) {
      console.log("[MPWebhook] Pagamento já registrado (idempotência):", paymentId);
      return;
    }

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

  // Tenta identificar o cliente e o plano via external_reference (formato "clientUserId:X|planId:X")
  // Fallback: busca por payer_email + preapproval_plan_id (quando cliente assinou sem external_reference)
  const externalRef = mpSub.external_reference ?? "";
  const clientUserIdMatch = externalRef.match(/clientUserId:(\d+)/);
  const planIdMatch = externalRef.match(/planId:(\d+)/);

  let clientUser: any;
  let plan: any;

  // Fallback 0: busca pelo mpSubscriptionId já gravado no nosso banco.
  // Cobre eventos subsequentes (cancelled, authorized) após o primeiro evento (pending)
  // ter gravado o mpSubscriptionId na assinatura.
  const [existingByMpId] = await db
    .select({ clientUserId: subscriptions.clientUserId, planId: subscriptions.planId })
    .from(subscriptions)
    .where(eq(subscriptions.mpSubscriptionId, subscriptionId))
    .limit(1);

  if (existingByMpId) {
    [clientUser] = await db.select().from(clientUsers)
      .where(eq(clientUsers.id, existingByMpId.clientUserId!)).limit(1);
    [plan] = await db.select().from(plans)
      .where(eq(plans.id, existingByMpId.planId!)).limit(1);
    console.log(`[MPWebhook] Cliente identificado via mpSubscriptionId no banco — clientUser:${clientUser?.id}`);
  } else if (clientUserIdMatch && planIdMatch) {
    // Caminho direto via external_reference
    const clientUserId = parseInt(clientUserIdMatch[1]);
    const planId = parseInt(planIdMatch[1]);

    [clientUser] = await db.select().from(clientUsers).where(eq(clientUsers.id, clientUserId)).limit(1);
    [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  } else {
    // Fallback: busca pelo email do pagador + preapproval_plan_id
    const payerEmail: string = mpSub.payer_email ?? mpSub.payer?.email ?? "";
    const mpPlanId: string = mpSub.preapproval_plan_id ?? "";

    console.log(`[MPWebhook] external_reference ausente — fallback por email="${payerEmail}" planId="${mpPlanId}"`);

    // Retorna só se não houver NENHUM dado para identificar (nem email nem planId)
    if (!payerEmail && !mpPlanId) {
      console.warn("[MPWebhook] Sem dados suficientes para identificar assinatura:", { payerEmail, mpPlanId });
      return;
    }

    if (mpPlanId) {
      [plan] = await db.select().from(plans).where(eq(plans.mpPreapprovalPlanId, mpPlanId)).limit(1);
    }
    if (!plan) {
      console.warn("[MPWebhook] Plano não encontrado por mpPreapprovalPlanId:", mpPlanId);
      return;
    }

    [clientUser] = await db
      .select()
      .from(clientUsers)
      .where(and(eq(clientUsers.email, payerEmail), eq(clientUsers.barbershopId, plan.barbershopId)))
      .limit(1);

    // Fallback 3: busca a assinatura pending mais recente para este planId.
    // Isso cobre o caso onde o e-mail da conta MP é diferente do e-mail cadastrado na plataforma.
    // A assinatura pending é criada em createSubscriptionCheckout antes de redirecionar ao MP.
    if (!clientUser) {
      // Busca assinatura em "trialing" sem mpSubscriptionId — indica pre-checkout criado em createSubscriptionCheckout
      const [pendingSub] = await db
        .select({ clientUserId: subscriptions.clientUserId })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.planId, plan.id),
          eq(subscriptions.status, "trialing"),
          isNull(subscriptions.mpSubscriptionId),
        ))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(1);

      if (pendingSub) {
        [clientUser] = await db
          .select()
          .from(clientUsers)
          .where(eq(clientUsers.id, pendingSub.clientUserId))
          .limit(1);
        console.log(`[MPWebhook] Cliente identificado via pending subscription — clientUser:${clientUser?.id}`);
      }
    }
  }

  if (!clientUser || !plan) {
    console.error("[MPWebhook] ClientUser ou Plano não encontrado:", {
      externalRef,
      payerEmail: mpSub.payer_email,
      preapprovalPlanId: mpSub.preapproval_plan_id,
    });
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
    .where(eq(subscriptions.clientUserId, clientUser.id))
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

    console.log(`[MPWebhook] Assinatura atualizada (renewal=${isNewPeriod}) — clientUser:`, clientUser.id);
  } else {
    await db.insert(subscriptions).values({
      clientUserId: clientUser.id,
      planId: plan.id,
      barbershopId: plan.barbershopId,
      status: mappedStatus,
      mpSubscriptionId: subscriptionId,
      mpPayerId: String(mpSub.payer_id ?? ""),
      creditsRemaining: plan.creditsPerMonth,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });

    console.log("[MPWebhook] Assinatura criada — clientUser:", clientUser.id);
  }
}
