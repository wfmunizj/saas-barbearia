import { Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "./db";
import { payments } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    console.error("[Webhook] Missing stripe-signature header");
    return res.status(400).send("Missing signature");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // CRITICAL: Handle test events
  if (event.id.startsWith("evt_test_")) {
    console.log("[Webhook] Test event detected, returning verification response");
    return res.json({
      verified: true,
    });
  }

  console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentFailed(paymentIntent);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Error processing event:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log("[Webhook] Processing checkout.session.completed:", session.id);

  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database not available");
    return;
  }

  const metadata = session.metadata || {};
  const appointmentId = metadata.appointment_id ? parseInt(metadata.appointment_id) : null;
  const clientId = metadata.client_id ? parseInt(metadata.client_id) : null;

  if (!clientId) {
    console.error("[Webhook] Missing client_id in session metadata");
    return;
  }

  // Atualizar ou criar registro de pagamento
  await db.insert(payments).values({
    appointmentId,
    clientId,
    amountInCents: session.amount_total || 0,
    status: "completed",
    paymentMethod: session.payment_method_types?.[0] || "unknown",
    stripePaymentIntentId: session.payment_intent as string,
    stripeSessionId: session.id,
    paidAt: new Date(),
  });

  console.log("[Webhook] Payment recorded for client:", clientId);
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log("[Webhook] Processing payment_intent.succeeded:", paymentIntent.id);

  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database not available");
    return;
  }

  // Atualizar status do pagamento
  const result = await db
    .update(payments)
    .set({
      status: "completed",
      paidAt: new Date(),
    })
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id));

  console.log("[Webhook] Payment updated:", paymentIntent.id);
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log("[Webhook] Processing payment_intent.payment_failed:", paymentIntent.id);

  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database not available");
    return;
  }

  // Atualizar status do pagamento
  await db
    .update(payments)
    .set({
      status: "failed",
    })
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id));

  console.log("[Webhook] Payment marked as failed:", paymentIntent.id);
}
