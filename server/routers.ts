import { COOKIE_NAME } from "@shared/const";
import { autoCompletePastAppointments } from "./autoComplete";
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
import {
  barbershops, plans, clientUsers, subscriptions, barbers, appointments, services,
  planServices, barberCommissionRecords, commissionPayments, barberFichaRecords,
  appointmentServices, clients,
} from "../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

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
      let barberId: number | null = null;
      if (user.role === "barber") {
        barberId = await getLinkedBarberId(user.id);
      }
      return { ...user, barbershop, barberId };
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
          primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.updateBarbershop(barbershopId, input);
      }),

    // Lista todas as barbearias de um owner
    myList: protectedProcedure.query(async ({ ctx }) => {
      const userId = (ctx.user as any).id;
      return db.getBarbershopsByOwnerId(userId);
    }),

    // Troca a barbearia ativa do owner
    switch: protectedProcedure
      .input(z.object({ barbershopId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const userId = (ctx.user as any).id;
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Valida que a barbearia pertence ao owner
        const [target] = await dbInstance.select({ id: barbershops.id, ownerId: barbershops.ownerId })
          .from(barbershops)
          .where(eq(barbershops.id, input.barbershopId))
          .limit(1);
        if (!target || target.ownerId !== userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para acessar esta barbearia." });
        }

        await db.updateUserBarbershopId(userId, input.barbershopId);
        return { success: true };
      }),

    // Cria uma nova barbearia para o owner e faz switch automático
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(2),
        slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
        phone: z.string().optional(),
        address: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = (ctx.user as any).id;
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Verifica se o slug já está em uso
        const [existingSlug] = await dbInstance.select({ id: barbershops.id })
          .from(barbershops)
          .where(eq(barbershops.slug, input.slug))
          .limit(1);
        if (existingSlug) {
          throw new TRPCError({ code: "CONFLICT", message: "Este slug já está em uso. Escolha outro." });
        }

        const [newShop] = await dbInstance.insert(barbershops).values({
          name: input.name,
          slug: input.slug,
          phone: input.phone ?? null,
          address: input.address ?? null,
          ownerId: userId,
          plan: "free",
          isActive: true,
        }).returning();

        // NÃO fazemos switch automático — owner permanece na barbearia atual.
        // O switcher no sidebar exibirá a nova barbearia via barbershop.myList.

        return newShop;
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
    list: protectedProcedure
      .input(z.object({
        filter: z.enum(["all", "active", "inactive", "monthly", "recurring"]).optional().default("all"),
        inactiveDays: z.number().optional().default(30),
      }).optional())
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const filter = input?.filter ?? "all";
        const inactiveDays = input?.inactiveDays ?? 30;

        if (filter === "all") {
          return db.getClients(barbershopId);
        }

        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) return [];

        const base = eq(clients.barbershopId, barbershopId);

        if (filter === "active") {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 30);
          return dbInstance.select().from(clients)
            .where(and(base, gte(clients.lastVisit, cutoff)))
            .orderBy(desc(clients.lastVisit));
        }

        if (filter === "inactive") {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - inactiveDays);
          return dbInstance.select().from(clients)
            .where(and(base, lte(clients.lastVisit, cutoff)))
            .orderBy(desc(clients.lastVisit));
        }

        if (filter === "recurring") {
          return dbInstance.select().from(clients)
            .where(and(base, gte(clients.totalVisits, 2)))
            .orderBy(desc(clients.totalVisits));
        }

        if (filter === "monthly") {
          return dbInstance.select().from(clients)
            .where(and(
              base,
              sql`EXISTS (
                SELECT 1 FROM client_users cu
                INNER JOIN subscriptions s ON s.client_user_id = cu.id
                WHERE cu.client_id = ${clients.id}
                  AND cu.barbershop_id = ${barbershopId}
                  AND s.status = 'active'
              )`
            ))
            .orderBy(desc(clients.lastVisit));
        }

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
          fichaValueInCents: z.number().int().min(0).default(0),
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
          commissionPercent: z.number().min(0).max(100).optional(),
          bonusAmountInCents: z.number().min(0).optional(),
          fichaValueInCents: z.number().int().min(0).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const { id, commissionPercent, ...rest } = input;
        // decimal column armazena string no Drizzle
        const data: any = { ...rest };
        if (commissionPercent !== undefined) {
          data.commissionPercent = String(commissionPercent);
        }
        return db.updateBarber(id, barbershopId, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        return db.deleteBarber(input.id, barbershopId);
      }),

    // Resumo personalizado por barbeiro (agendamentos, receita, comissão)
    summary: protectedProcedure
      .input(z.object({
        barberId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [barber] = await dbInstance.select().from(barbers)
          .where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, barbershopId)))
          .limit(1);
        if (!barber) throw new TRPCError({ code: "NOT_FOUND", message: "Barbeiro não encontrado." });

        const start = input.startDate ? new Date(input.startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = input.endDate ? new Date(input.endDate) : new Date();

        // Agendamentos do barbeiro no período
        const appts = await dbInstance.select({
          id: appointments.id,
          status: appointments.status,
          appointmentDate: appointments.appointmentDate,
          primaryBarberId: appointments.primaryBarberId,
          clientName: sql<string>`MAX(${clients.name})`,
          serviceName: sql<string>`string_agg(${services.name}, ', ' ORDER BY ${services.name})`,
          servicePrice: sql<number>`COALESCE(SUM(${appointmentServices.priceInCents}), MAX(${services.priceInCents}), 0)`,
        })
          .from(appointments)
          .leftJoin(clients, eq(clients.id, appointments.clientId))
          .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
          .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
          .where(and(
            eq(appointments.barberId, input.barberId),
            eq(appointments.barbershopId, barbershopId),
            gte(appointments.appointmentDate, start),
            lte(appointments.appointmentDate, end),
          ))
          .groupBy(appointments.id, appointments.status, appointments.appointmentDate, appointments.primaryBarberId);

        const totalAppointments = appts.length;
        const completedAppointments = appts.filter(a => a.status === "completed").length;
        const cancelledAppointments = appts.filter(a => a.status === "cancelled").length;
        const totalRevenueInCents = appts
          .filter(a => a.status === "completed")
          .reduce((sum, a) => sum + Number(a.servicePrice ?? 0), 0);

        const commissionPercent = parseFloat(barber.commissionPercent ?? "0");
        const commissionAmountInCents = Math.floor(totalRevenueInCents * commissionPercent / 100);

        // Registros de comissão pagos/pendentes
        const commissionRecords = await dbInstance.select()
          .from(barberCommissionRecords)
          .where(and(
            eq(barberCommissionRecords.barberId, input.barberId),
            eq(barberCommissionRecords.barbershopId, barbershopId),
          ));

        const paidCommission = commissionRecords.filter(r => r.paid).reduce((s, r) => s + r.commissionAmountInCents, 0);
        const pendingCommission = commissionRecords.filter(r => !r.paid).reduce((s, r) => s + r.commissionAmountInCents, 0);

        // Adiciona flag isCrossBarber em cada agendamento
        const apptsWithFlag = appts.map(a => ({
          ...a,
          isCrossBarber: !!(a.primaryBarberId && a.primaryBarberId !== input.barberId),
        }));
        const crossBarberCount = apptsWithFlag.filter(a => a.isCrossBarber && a.status === "completed").length;

        return {
          barber,
          period: { start, end },
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          totalRevenueInCents,
          commissionPercent,
          commissionAmountInCents,
          paidCommission,
          pendingCommission,
          crossBarberCount,
          appointments: apptsWithFlag,
        };
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
          fichasCount: z.number().int().min(0).default(0),
          fichaValueInCents: z.number().int().min(0).default(0),
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
          fichasCount: z.number().int().min(0).optional(),
          fichaValueInCents: z.number().int().min(0).optional(),
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
        const result = await db.updateAppointment(id, barbershopId, data);

        // Auto-criar registro de comissão/fichas quando status muda para "completed"
        if (input.status === "completed") {
          const dbInstance = await import("./db").then(m => m.getDb());
          if (dbInstance) {
            const [appt] = await dbInstance.select({
              id: appointments.id,
              barberId: appointments.barberId,
              clientId: appointments.clientId,
              commissionPercent: barbers.commissionPercent,
              priceInCents: sql<number>`COALESCE(SUM(${appointmentServices.priceInCents}), MAX(${services.priceInCents}), 0)`,
              // Duração total para calcular fichas (1 ficha por 15 min)
              durationMinutes: sql<number>`COALESCE(SUM(${appointmentServices.durationMinutes}), MAX(${services.durationMinutes}), 30)`,
              // Valor por ficha vem do serviço (snapshot em appointmentServices ou fallback para services)
              fichaValueInCents: sql<number>`COALESCE(MAX(${appointmentServices.fichaValueInCents}), MAX(${services.fichaValueInCents}), 0)`,
            })
              .from(appointments)
              .innerJoin(barbers, eq(appointments.barberId, barbers.id))
              .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
              .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
              .where(and(eq(appointments.id, id), eq(appointments.barbershopId, barbershopId)))
              .groupBy(appointments.id, barbers.id)
              .limit(1);

            if (appt) {
              // Verificar se o cliente possui plano ilimitado ativo
              const unlimitedSub = await dbInstance.select({ isUnlimited: plans.isUnlimited })
                .from(subscriptions)
                .innerJoin(clientUsers, eq(subscriptions.clientUserId, clientUsers.id))
                .innerJoin(plans, eq(subscriptions.planId, plans.id))
                .where(and(
                  eq(clientUsers.clientId, appt.clientId),
                  eq(clientUsers.barbershopId, barbershopId),
                  eq(subscriptions.status, "active"),
                  eq(plans.isUnlimited, true),
                ))
                .limit(1);

              const isUnlimitedPlan = unlimitedSub.length > 0;

              if (isUnlimitedPlan) {
                // Plano ilimitado: fichas calculadas por tempo (1 ficha por 15 min)
                const durationMin = Number(appt.durationMinutes ?? 30);
                const fichasCount = Math.ceil(durationMin / 15);
                const fichaValueInCents = Number(appt.fichaValueInCents ?? 0);
                const totalValueInCents = fichasCount * fichaValueInCents;
                await dbInstance.insert(barberFichaRecords).values({
                  barbershopId,
                  barberId: appt.barberId,
                  appointmentId: appt.id,
                  fichasCount,
                  fichaValueInCents,
                  totalValueInCents,
                }).onConflictDoNothing();
              } else {
                // Plano créditos / avulso: criar registro de comissão
                const commissionPct = parseFloat(appt.commissionPercent ?? "0");
                const commissionAmountInCents = Math.floor((appt.priceInCents ?? 0) * commissionPct / 100);
                await dbInstance.insert(barberCommissionRecords).values({
                  barbershopId,
                  barberId: appt.barberId,
                  appointmentId: appt.id,
                  commissionPercent: String(commissionPct),
                  serviceAmountInCents: appt.priceInCents ?? 0,
                  commissionAmountInCents,
                }).onConflictDoNothing();
              }
            }
          }
        }

        return result;
      }),

    // Cancelamento pelo admin com geração de registro de comissão quando concluído
    completeWithCommission: protectedProcedure
      .input(z.object({ appointmentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Busca o agendamento com dados do barbeiro e serviço
        const [appt] = await dbInstance.select({
          id: appointments.id,
          barberId: appointments.barberId,
          commissionPercent: barbers.commissionPercent,
          priceInCents: sql<number>`COALESCE(SUM(${appointmentServices.priceInCents}), MAX(${services.priceInCents}), 0)`,
          status: appointments.status,
        })
          .from(appointments)
          .innerJoin(barbers, eq(appointments.barberId, barbers.id))
          .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
          .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
          .where(and(eq(appointments.id, input.appointmentId), eq(appointments.barbershopId, barbershopId)))
          .groupBy(appointments.id, barbers.id)
          .limit(1);

        if (!appt) throw new TRPCError({ code: "NOT_FOUND" });
        if (appt.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Agendamento já concluído." });

        // Marca como concluído
        await dbInstance.update(appointments).set({ status: "completed", updatedAt: new Date() })
          .where(eq(appointments.id, appt.id));

        // Cria registro de comissão
        const commissionPct = parseFloat(appt.commissionPercent ?? "0");
        const commissionAmountInCents = Math.floor((appt.priceInCents ?? 0) * commissionPct / 100);

        await dbInstance.insert(barberCommissionRecords).values({
          barbershopId,
          barberId: appt.barberId,
          appointmentId: appt.id,
          commissionPercent: String(commissionPct),
          serviceAmountInCents: appt.priceInCents ?? 0,
          commissionAmountInCents,
        }).onConflictDoNothing();

        return { success: true, commissionAmountInCents };
      }),

    // Conclui manualmente todos os agendamentos passados da barbearia (admin only)
    triggerAutoComplete: protectedProcedure
      .mutation(async ({ ctx }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const result = await autoCompletePastAppointments(barbershopId);
        return result;
      }),
  }),

  // ─── Comissões ─────────────────────────────────────────────────────────────────
  commissions: router({
    list: protectedProcedure
      .input(z.object({
        barberId: z.number().optional(),
        paid: z.boolean().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) return [];

        let query = dbInstance.select({
          id: barberCommissionRecords.id,
          barberId: barberCommissionRecords.barberId,
          appointmentId: barberCommissionRecords.appointmentId,
          commissionPercent: barberCommissionRecords.commissionPercent,
          serviceAmountInCents: barberCommissionRecords.serviceAmountInCents,
          commissionAmountInCents: barberCommissionRecords.commissionAmountInCents,
          paid: barberCommissionRecords.paid,
          paidAt: barberCommissionRecords.paidAt,
          createdAt: barberCommissionRecords.createdAt,
          barberName: barbers.name,
        })
          .from(barberCommissionRecords)
          .innerJoin(barbers, eq(barberCommissionRecords.barberId, barbers.id))
          .where(eq(barberCommissionRecords.barbershopId, barbershopId)) as any;

        return query;
      }),

    markAsPaid: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        for (const id of input.ids) {
          await dbInstance.update(barberCommissionRecords)
            .set({ paid: true, paidAt: new Date(), updatedAt: new Date() })
            .where(and(
              eq(barberCommissionRecords.id, id),
              eq(barberCommissionRecords.barbershopId, barbershopId)
            ));
        }
        return { success: true };
      }),

    // Saldo acumulado de comissões + fichas de um barbeiro (total gerado − total pago)
    getBalance: protectedProcedure
      .input(z.object({ barberId: z.number() }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const commissionEarned = await dbInstance
          .select({ total: sql<number>`COALESCE(SUM(${barberCommissionRecords.commissionAmountInCents}), 0)` })
          .from(barberCommissionRecords)
          .where(and(
            eq(barberCommissionRecords.barberId, input.barberId),
            eq(barberCommissionRecords.barbershopId, barbershopId)
          ));

        const fichaEarned = await dbInstance
          .select({ total: sql<number>`COALESCE(SUM(${barberFichaRecords.totalValueInCents}), 0)` })
          .from(barberFichaRecords)
          .where(and(
            eq(barberFichaRecords.barberId, input.barberId),
            eq(barberFichaRecords.barbershopId, barbershopId)
          ));

        const paid = await dbInstance
          .select({ total: sql<number>`COALESCE(SUM(${commissionPayments.amountInCents}), 0)` })
          .from(commissionPayments)
          .where(and(
            eq(commissionPayments.barberId, input.barberId),
            eq(commissionPayments.barbershopId, barbershopId)
          ));

        const totalCommission = Number(commissionEarned[0]?.total ?? 0);
        const totalFichas = Number(fichaEarned[0]?.total ?? 0);
        const totalEarned = totalCommission + totalFichas;
        const totalPaid = Number(paid[0]?.total ?? 0);

        return {
          totalEarnedInCents: totalEarned,
          totalCommissionInCents: totalCommission,
          totalFichasInCents: totalFichas,
          totalPaidInCents: totalPaid,
          balanceInCents: Math.max(0, totalEarned - totalPaid),
        };
      }),

    // Registrar pagamento de comissão (lote)
    recordPayment: protectedProcedure
      .input(z.object({
        barberId: z.number(),
        amountInCents: z.number().min(1),
        paymentMethod: z.enum(["cash", "pix", "transfer", "other"]).default("cash"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = (ctx.user as any).id;
        const barbershopId = await getBarbershopId(userId);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Valida que o barbeiro pertence à barbearia
        const [barber] = await dbInstance.select({ id: barbers.id })
          .from(barbers)
          .where(and(eq(barbers.id, input.barberId), eq(barbers.barbershopId, barbershopId)))
          .limit(1);
        if (!barber) throw new TRPCError({ code: "NOT_FOUND", message: "Barbeiro não encontrado" });

        const [payment] = await dbInstance.insert(commissionPayments).values({
          barbershopId,
          barberId: input.barberId,
          amountInCents: input.amountInCents,
          paymentMethod: input.paymentMethod,
          notes: input.notes ?? null,
          createdByUserId: userId,
          paidAt: new Date(),
        }).returning();

        return payment;
      }),

    // Histórico de pagamentos de comissão de um barbeiro
    getPaymentHistory: protectedProcedure
      .input(z.object({ barberId: z.number() }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) return [];

        return dbInstance.select()
          .from(commissionPayments)
          .where(and(
            eq(commissionPayments.barberId, input.barberId),
            eq(commissionPayments.barbershopId, barbershopId)
          ))
          .orderBy(sql`${commissionPayments.paidAt} DESC`);
      }),

    // Registros de fichas de um barbeiro no período
    getFichas: protectedProcedure
      .input(z.object({
        barberId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) return { records: [], totalFichas: 0, totalValueInCents: 0 };

        const conditions = [
          eq(barberFichaRecords.barberId, input.barberId),
          eq(barberFichaRecords.barbershopId, barbershopId),
        ];
        if (input.startDate) conditions.push(gte(barberFichaRecords.createdAt, new Date(input.startDate)));
        if (input.endDate) conditions.push(lte(barberFichaRecords.createdAt, new Date(input.endDate + "T23:59:59")));

        const records = await dbInstance.select({
          id: barberFichaRecords.id,
          appointmentId: barberFichaRecords.appointmentId,
          fichasCount: barberFichaRecords.fichasCount,
          fichaValueInCents: barberFichaRecords.fichaValueInCents,
          totalValueInCents: barberFichaRecords.totalValueInCents,
          createdAt: barberFichaRecords.createdAt,
          serviceName: sql<string>`string_agg(${services.name}, ', ' ORDER BY ${services.name})`,
        })
          .from(barberFichaRecords)
          .innerJoin(appointments, eq(barberFichaRecords.appointmentId, appointments.id))
          .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
          .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
          .where(and(...conditions))
          .groupBy(barberFichaRecords.id)
          .orderBy(sql`${barberFichaRecords.createdAt} DESC`);

        const totalFichas = records.reduce((sum, r) => sum + (r.fichasCount ?? 0), 0);
        const totalValueInCents = records.reduce((sum, r) => sum + (r.totalValueInCents ?? 0), 0);

        return { records, totalFichas, totalValueInCents };
      }),
  }),

  // ─── Payments ────────────────────────────────────────────────────────────────

  payments: router({
    list: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const userId = (ctx.user as any).id;
        const barbershopId = await getBarbershopId(userId);

        // Se for barbeiro, filtra apenas pagamentos dos agendamentos dele
        const linkedBarber = await db.getBarberByUserId(userId);
        return db.getPayments(barbershopId, linkedBarber?.id ?? undefined, {
          startDate: input?.startDate ? new Date(input.startDate) : undefined,
          endDate:   input?.endDate   ? new Date(input.endDate)   : undefined,
        });
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
          variables: z.record(z.string(), z.string()),
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
          // Novos campos
          planType: z.enum(["monthly_limited", "unlimited", "single_cut"]).default("monthly_limited"),
          allowedDaysOfWeek: z.array(z.number().min(0).max(6)).optional(), // [2,3,4] = Ter,Qua,Qui
          isUnlimited: z.boolean().default(false),
          serviceIds: z.array(z.number()).optional(), // serviços incluídos no plano
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Cria Preapproval Plan no Mercado Pago automaticamente (para assinaturas recorrentes)
        let mpPreapprovalPlanId: string | null = null;
        if (MP_ACCESS_TOKEN && input.planType !== "single_cut") {
          try {
            const mpPlanBody = {
              reason: input.name,
              auto_recurring: {
                frequency: 1,
                frequency_type: "months",
                transaction_amount: input.priceInCents / 100,
                currency_id: "BRL",
              },
              back_url: `${BASE_URL}/`,
              notification_url: `${BASE_URL}/api/mp/webhook`,
            };
            const mpRes = await fetch("https://api.mercadopago.com/preapproval_plan", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
              },
              body: JSON.stringify(mpPlanBody),
            });
            if (mpRes.ok) {
              const mpPlan = await mpRes.json() as any;
              mpPreapprovalPlanId = mpPlan.id;
              console.log("[Plans] MP Preapproval Plan criado:", mpPreapprovalPlanId);
            } else {
              console.warn("[Plans] Falha ao criar MP Preapproval Plan:", await mpRes.text());
            }
          } catch (err: any) {
            console.warn("[Plans] Erro MP (não bloqueante):", err.message);
          }
        }

        const { serviceIds, allowedDaysOfWeek, ...planData } = input;

        const [plan] = await dbInstance
          .insert(plans)
          .values({
            ...planData,
            barbershopId,
            mpPreapprovalPlanId,
            allowedDaysOfWeek: allowedDaysOfWeek ? JSON.stringify(allowedDaysOfWeek) : null,
          })
          .returning();

        // Vincula serviços ao plano
        if (serviceIds && serviceIds.length > 0) {
          await dbInstance.insert(planServices).values(
            serviceIds.map(sid => ({ planId: plan.id, serviceId: sid }))
          ).onConflictDoNothing();
        }

        return plan;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          isActive: z.boolean().optional(),
          planType: z.enum(["monthly_limited", "unlimited", "single_cut"]).optional(),
          allowedDaysOfWeek: z.array(z.number().min(0).max(6)).nullable().optional(),
          isUnlimited: z.boolean().optional(),
          serviceIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, serviceIds, allowedDaysOfWeek, ...data } = input;

        const updateData: any = { ...data, updatedAt: new Date() };
        if (allowedDaysOfWeek !== undefined) {
          updateData.allowedDaysOfWeek = allowedDaysOfWeek ? JSON.stringify(allowedDaysOfWeek) : null;
        }

        const [plan] = await dbInstance
          .update(plans)
          .set(updateData)
          .where(and(eq(plans.id, id), eq(plans.barbershopId, barbershopId)))
          .returning();

        // Atualiza serviços vinculados ao plano se fornecido
        if (serviceIds !== undefined) {
          await dbInstance.delete(planServices).where(eq(planServices.planId, id));
          if (serviceIds.length > 0) {
            await dbInstance.insert(planServices).values(
              serviceIds.map(sid => ({ planId: id, serviceId: sid }))
            ).onConflictDoNothing();
          }
        }

        return plan;
      }),

    // Serviços de um plano
    getServices: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .query(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const dbInstance = await import("./db").then(m => m.getDb());
        if (!dbInstance) return [];
        return dbInstance.select({ service: services })
          .from(planServices)
          .innerJoin(services, eq(planServices.serviceId, services.id))
          .innerJoin(plans, eq(planServices.planId, plans.id))
          .where(and(eq(planServices.planId, input.planId), eq(plans.barbershopId, barbershopId)));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const barbershopId = await getBarbershopId((ctx.user as any).id);
        const db = await import("./db").then(m => m.getDb());
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Bloqueia se houver clientes com assinatura ativa neste plano
        const [activeRef] = await db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(and(eq(subscriptions.planId, input.id), eq(subscriptions.status, "active")))
          .limit(1);
        if (activeRef) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este plano possui clientes com assinatura ativa. Cancele as assinaturas antes de removê-lo.",
          });
        }

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
