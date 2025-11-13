import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Clients router
  clients: router({
    list: protectedProcedure.query(async () => {
      return await db.getClients();
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getClientById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        phone: z.string(),
        email: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createClient(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateClient(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteClient(input.id);
      }),
    
    getInactive: protectedProcedure
      .input(z.object({ days: z.number() }))
      .query(async ({ input }) => {
        return await db.getInactiveClients(input.days);
      }),
  }),

  // Barbers router
  barbers: router({
    list: protectedProcedure.query(async () => {
      return await db.getBarbers();
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getBarberById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        phone: z.string().optional(),
        email: z.string().optional(),
        specialties: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createBarber(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        specialties: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateBarber(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteBarber(input.id);
      }),
  }),

  // Services router
  services: router({
    list: protectedProcedure.query(async () => {
      return await db.getServices();
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getServiceById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        durationMinutes: z.number(),
        priceInCents: z.number(),
      }))
      .mutation(async ({ input }) => {
        return await db.createService(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        durationMinutes: z.number().optional(),
        priceInCents: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateService(id, data);
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteService(input.id);
      }),
  }),

  // Appointments router
  appointments: router({
    list: protectedProcedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getAppointments(input?.startDate, input?.endDate);
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getAppointmentById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        clientId: z.number(),
        barberId: z.number(),
        serviceId: z.number(),
        appointmentDate: z.date(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createAppointment(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "confirmed", "completed", "cancelled"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateAppointment(id, data);
      }),
    
    getByBarber: protectedProcedure
      .input(z.object({
        barberId: z.number(),
        date: z.date(),
      }))
      .query(async ({ input }) => {
        return await db.getAppointmentsByBarber(input.barberId, input.date);
      }),
  }),

  // Payments router
  payments: router({
    list: protectedProcedure.query(async () => {
      return await db.getPayments();
    }),
    
    getByClient: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        return await db.getPaymentsByClient(input.clientId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        clientId: z.number(),
        appointmentId: z.number().optional(),
        amountInCents: z.number(),
        paymentMethod: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createPayment(input);
      }),
  }),

  // Campaigns router
  campaigns: router({
    list: protectedProcedure.query(async () => {
      return await db.getCampaigns();
    }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        type: z.enum(["promotional", "reactivation", "referral"]),
        discountPercentage: z.number().optional(),
        discountAmountInCents: z.number().optional(),
        startDate: z.date(),
        endDate: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createCampaign(input);
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateCampaign(id, data);
      }),
  }),

  // WhatsApp messages router
  whatsapp: router({
    list: protectedProcedure.query(async () => {
      return await db.getWhatsappMessages();
    }),
    
    send: protectedProcedure
      .input(z.object({
        clientId: z.number(),
        message: z.string(),
        campaignId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.createWhatsappMessage(input);
      }),
  }),

  // Message templates router
  messageTemplates: router({
    list: protectedProcedure.query(async () => {
      return await db.getMessageTemplates();
    }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        type: z.enum(["appointment_reminder", "reactivation", "promotional", "custom"]),
        content: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await db.createMessageTemplate(input);
      }),
  }),

  // Settings router
  settings: router({
    get: protectedProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        return await db.getSetting(input.key);
      }),
    
    upsert: protectedProcedure
      .input(z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.upsertSetting(input);
      }),
  }),
});

export type AppRouter = typeof appRouter;
