import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import {
  sendWhatsappMessage,
  sendBulkWhatsappMessages,
  interpolateTemplate,
} from "./whatsapp";
import { TRPCError } from "@trpc/server";
import { clientPortalRouter } from "./clientRouter";
import { plans, clientUsers, subscriptions } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";

// Helper para extrair barbershopId do contexto do usuário autenticado
async function getBarbershopId(userId: number): Promise<number> {
  const user = await db.getUserById(userId);
  if (!user?.barbershopId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuário não associado a uma barbearia",
    });
  }
  return user.barbershopId;
}

async function getLinkedBarberId(userId: number): Promise<number | null> {
  const user = await db.getUserById(userId);
  if (!user || user.role !== "barber") return null;
  const dbConn = await import("./db").then(m => m.getDb());
  if (!dbConn) return null;
  const { barbers } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await dbConn
    .select({ id: barbers.id })
    .from(barbers)
    .where(eq(barbers.userId, userId))
    .limit(1);
  return result[0]?.id ?? null;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(async opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      let barbershop = null;
      if (user.barbershopId) {
        barbershop = await db.getBarbershopById(user.barbershopId);
      }
      return { ...user, barbershop };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Barbershop ─────────────────────────────────────────────────────────────

  barbershop: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getBarbershopById(barbershopId);
    }),

    update: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
          address: z.string().optional(),
          logoUrl: z.string().optional(),
          whatsappApiUrl: z.string().optional(),
          whatsappApiKey: z.string().optional(),
          whatsappInstanceName: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.updateBarbershop(barbershopId, input);
      }),

    getWhatsappStatus: protectedProcedure.query(async ({ ctx }) => {
      const { EvolutionApiClient } = await import("./whatsapp");
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      const barbershop = await db.getBarbershopById(barbershopId);
      if (
        !barbershop?.whatsappApiUrl ||
        !barbershop?.whatsappApiKey ||
        !barbershop?.whatsappInstanceName
      ) {
        return { configured: false, status: null };
      }
      try {
        const client = new EvolutionApiClient(
          barbershop.whatsappApiUrl,
          barbershop.whatsappApiKey,
          barbershop.whatsappInstanceName
        );
        const status = await client.getInstanceStatus();
        return { configured: true, status };
      } catch {
        return { configured: true, status: "error" };
      }
    }),
  }),

  // ─── Clients ────────────────────────────────────────────────────────────────

  clients: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getClients(barbershopId);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.getClientById(input.id, barbershopId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          phone: z.string(),
          email: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.createClient({ ...input, barbershopId });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
          notes: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const { id, ...data } = input;
        return db.updateClient(id, barbershopId, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.deleteClient(input.id, barbershopId);
      }),

    getInactive: protectedProcedure
      .input(z.object({ daysSinceLastVisit: z.number().default(30) }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.getInactiveClients(barbershopId, input.daysSinceLastVisit);
      }),
  }),

  // ─── Barbers ────────────────────────────────────────────────────────────────

  barbers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getBarbers(barbershopId);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          phone: z.string().optional(),
          email: z.string().optional(),
          specialties: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // ─── Verifica limite do plano SaaS ───────────────────────────────────
        const subResult = await dbInstance.execute(
          ("SELECT ss.status, ss.trial_ends_at, sp.max_barbers " +
            "FROM saas_subscriptions ss " +
            "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
            "WHERE ss.barbershop_id = " +
            barbershopId +
            " LIMIT 1") as any
        );
        const subRows = Array.isArray(subResult)
          ? subResult
          : ((subResult as any).rows ?? []);
        const sub = subRows[0];

        if (sub) {
          // Verifica se assinatura está ativa
          const isTrialing =
            sub.status === "trialing" &&
            new Date(sub.trial_ends_at) >= new Date();
          const isActive = sub.status === "active";
          if (!isTrialing && !isActive) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Sua assinatura está inativa. Acesse 'Minha Assinatura' para reativar.",
            });
          }

          // Verifica limite de barbeiros (-1 = ilimitado)
          if (sub.max_barbers !== -1) {
            const countResult = await dbInstance.execute(
              ("SELECT COUNT(*) as total FROM barbers " +
                "WHERE barbershop_id = " +
                barbershopId +
                " AND is_active = true") as any
            );
            const countRows = Array.isArray(countResult)
              ? countResult
              : ((countResult as any).rows ?? []);
            const total = parseInt(
              countRows[0]?.total ?? countRows[0]?.count ?? "0"
            );

            if (total >= sub.max_barbers) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `Seu plano permite até ${sub.max_barbers} barbeiro${sub.max_barbers !== 1 ? "s" : ""}. Faça upgrade para adicionar mais.`,
              });
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        return db.createBarber({ ...input, barbershopId });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
          specialties: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const { id, ...data } = input;
        return db.updateBarber(id, barbershopId, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.deleteBarber(input.id, barbershopId);
      }),
  }),

  // ─── Services ────────────────────────────────────────────────────────────────

  services: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getServices(barbershopId);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          durationMinutes: z.number(),
          priceInCents: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.createService({ ...input, barbershopId });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          durationMinutes: z.number().optional(),
          priceInCents: z.number().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const { id, ...data } = input;
        return db.updateService(id, barbershopId, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.deleteService(input.id, barbershopId);
      }),
  }),

  // ─── Appointments ─────────────────────────────────────────────────────────────

  appointments: router({
    list: protectedProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const userId = (ctx.user as any).id;
        const barbershopId = await getBarbershopId(userId);

        // Se for barbeiro, filtra apenas os agendamentos dele
        const linkedBarber = await db.getBarberByUserId(userId);

        return db.getAppointments(barbershopId, {
          startDate: input?.startDate ? new Date(input.startDate) : undefined,
          endDate: input?.endDate ? new Date(input.endDate) : undefined,
          barberId: linkedBarber?.id ?? undefined, // undefined = sem filtro (owner vê todos)
        });
      }),
    create: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          barberId: z.number(),
          serviceId: z.number(),
          appointmentDate: z
            .union([z.string(), z.date()])
            .transform(v => new Date(v)),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const appointmentDate = input.appointmentDate;

        const hasConflict = await db.checkAppointmentConflict(
          input.barberId,
          barbershopId,
          appointmentDate
        );
        if (hasConflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este barbeiro já tem um agendamento neste horário",
          });
        }

        return db.createAppointment({
          ...input,
          barbershopId,
          appointmentDate,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["pending", "confirmed", "completed", "cancelled"])
            .optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = (ctx.user as any).id;
        const barbershopId = await getBarbershopId(userId);

        // Se for barbeiro, verifica se o agendamento pertence a ele
        const linkedBarber = await db.getBarberByUserId(userId);
        if (linkedBarber) {
          const existing = await db.getAppointments(barbershopId, {
            barberId: linkedBarber.id,
          });
          const owns = existing.some(a => a.id === input.id);
          if (!owns) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Você não tem permissão para alterar este agendamento",
            });
          }
        }

        const { id, ...data } = input;
        return db.updateAppointment(id, barbershopId, data);
      }),
  }),

  // ─── Payments ────────────────────────────────────────────────────────────────

  payments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const userId = (ctx.user as any).id;
      const barbershopId = await getBarbershopId(userId);

      // Se for barbeiro, filtra apenas pagamentos dos agendamentos dele
      const linkedBarber = await db.getBarberByUserId(userId);
      return db.getPayments(barbershopId, linkedBarber?.id ?? undefined);
    }),
  }),

  // ─── Analytics ───────────────────────────────────────────────────────────────

  analytics: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getDashboardStats(barbershopId);
    }),
  }),

  // ─── Campaigns ────────────────────────────────────────────────────────────────

  campaigns: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getCampaigns(barbershopId);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          type: z.enum(["discount", "reactivation", "referral", "custom"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.createCampaign({ ...input, barbershopId });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const { id, ...data } = input;
        return db.updateCampaign(id, barbershopId, data);
      }),
  }),

  // ─── WhatsApp ─────────────────────────────────────────────────────────────────

  whatsapp: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getWhatsappMessages(barbershopId);
    }),

    send: protectedProcedure
      .input(
        z.object({
          clientId: z.number(),
          message: z.string(),
          campaignId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return sendWhatsappMessage(
          barbershopId,
          input.clientId,
          input.message,
          input.campaignId
        );
      }),

    sendBulk: protectedProcedure
      .input(
        z.object({
          clientIds: z.array(z.number()),
          message: z.string(),
          campaignId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return sendBulkWhatsappMessages(
          barbershopId,
          input.clientIds,
          input.message,
          input.campaignId
        );
      }),

    interpolateTemplate: protectedProcedure
      .input(
        z.object({
          template: z.string(),
          variables: z.record(z.string()),
        })
      )
      .query(({ input }) => {
        return { result: interpolateTemplate(input.template, input.variables) };
      }),
  }),

  // ─── Message Templates ────────────────────────────────────────────────────────

  messageTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      return db.getMessageTemplates(barbershopId);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          type: z.enum([
            "appointment_reminder",
            "reactivation",
            "promotional",
            "custom",
          ]),
          content: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.createMessageTemplate({ ...input, barbershopId });
      }),
  }),

  // ─── Settings ─────────────────────────────────────────────────────────────────

  settings: router({
    get: protectedProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.getSetting(barbershopId, input.key);
      }),

    upsert: protectedProcedure
      .input(
        z.object({
          key: z.string(),
          value: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.upsertSetting({ ...input, barbershopId });
      }),
  }),

  // ─── Plans (gerenciado pelo dono) ────────────────────────────────────────────

  plans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const barbershopId = await getBarbershopId((ctx.user as any).id);
      const db = await import("./db").then(m => m.getDb());
      if (!db) return [];
      return db
        .select()
        .from(plans)
        .where(eq(plans.barbershopId, barbershopId));
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          priceInCents: z.number(),
          creditsPerMonth: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Cria produto e preço no Stripe automaticamente
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: "2025-10-29.clover",
        });
        const product = await stripe.products.create({
          name: input.name,
          description: input.description,
        });
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: input.priceInCents,
          currency: "brl",
          recurring: { interval: "month" },
        });

        const [plan] = await db
          .insert(plans)
          .values({
            ...input,
            barbershopId,
            stripePriceId: price.id,
            stripeProductId: product.id,
          })
          .returning();
        return plan;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...data } = input;
        const [plan] = await db
          .update(plans)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(plans.id, id), eq(plans.barbershopId, barbershopId)))
          .returning();
        return plan;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .delete(plans)
          .where(
            and(eq(plans.id, input.id), eq(plans.barbershopId, barbershopId))
          );
        return { success: true };
      }),
  }),

  // ─── Portal do Cliente (público) ─────────────────────────────────────────────
  client: clientPortalRouter,
});

export type AppRouter = typeof appRouter;
