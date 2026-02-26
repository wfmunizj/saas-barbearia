import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  decimal,
  unique,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "barber", "owner"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["pending", "confirmed", "completed", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"]);
export const campaignTypeEnum = pgEnum("campaign_type", ["discount", "reactivation", "referral", "custom"]);
export const whatsappStatusEnum = pgEnum("whatsapp_status", ["pending", "sent", "failed"]);
export const messageTemplateTypeEnum = pgEnum("message_template_type", ["appointment_reminder", "reactivation", "promotional", "custom"]);
export const planEnum = pgEnum("plan", ["free", "starter", "pro", "enterprise"]);

// ─── Barbearias (Multi-tenancy) ───────────────────────────────────────────────

export const barbershops = pgTable("barbershops", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  logoUrl: text("logo_url"),
  plan: planEnum("plan").default("free").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  // WhatsApp / Evolution API
  whatsappInstanceName: varchar("whatsapp_instance_name", { length: 255 }),
  whatsappApiUrl: text("whatsapp_api_url"),
  whatsappApiKey: text("whatsapp_api_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Barbershop = typeof barbershops.$inferSelect;
export type InsertBarbershop = typeof barbershops.$inferInsert;

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // openId mantido para compatibilidade com OAuth existente, mas agora opcional
  openId: varchar("open_id", { length: 64 }).unique(),
  barbershopId: integer("barbershop_id").references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: text("password_hash"), // auth própria
  loginMethod: varchar("login_method", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Clientes ─────────────────────────────────────────────────────────────────

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 320 }),
  notes: text("notes"),
  lastVisit: timestamp("last_visit"),
  totalVisits: integer("total_visits").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// ─── Barbeiros ────────────────────────────────────────────────────────────────

export const barbers = pgTable("barbers", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  specialties: text("specialties"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Barber = typeof barbers.$inferSelect;
export type InsertBarber = typeof barbers.$inferInsert;

// ─── Horários dos Barbeiros ───────────────────────────────────────────────────

export const barberSchedules = pgTable("barber_schedules", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  barberId: integer("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Dom, 1=Seg, ... 6=Sab
  startTime: varchar("start_time", { length: 5 }).notNull(), // "08:00"
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "18:00"
  isAvailable: boolean("is_available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BarberSchedule = typeof barberSchedules.$inferSelect;
export type InsertBarberSchedule = typeof barberSchedules.$inferInsert;

// ─── Serviços ─────────────────────────────────────────────────────────────────

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull(),
  priceInCents: integer("price_in_cents").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

// ─── Agendamentos ─────────────────────────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clients.id),
  barberId: integer("barber_id").notNull().references(() => barbers.id),
  serviceId: integer("service_id").notNull().references(() => services.id),
  appointmentDate: timestamp("appointment_date").notNull(),
  status: appointmentStatusEnum("status").default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

// ─── Pagamentos ───────────────────────────────────────────────────────────────

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  clientId: integer("client_id").notNull().references(() => clients.id),
  amountInCents: integer("amount_in_cents").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── Campanhas ────────────────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: campaignTypeEnum("type").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// ─── Cupons ───────────────────────────────────────────────────────────────────

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  code: varchar("code", { length: 50 }).notNull(),
  discountPercent: integer("discount_percent"),
  discountInCents: integer("discount_in_cents"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0).notNull(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;

// ─── Mensagens WhatsApp ───────────────────────────────────────────────────────

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clients.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  message: text("message").notNull(),
  status: whatsappStatusEnum("status").default("pending").notNull(),
  // Evolution API
  evolutionMessageId: varchar("evolution_message_id", { length: 255 }),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = typeof whatsappMessages.$inferInsert;

// ─── Templates de Mensagens ───────────────────────────────────────────────────

export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: messageTemplateTypeEnum("type").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = typeof messageTemplates.$inferInsert;

// ─── Configurações ────────────────────────────────────────────────────────────

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueKeyPerShop: unique("settings_barbershop_key_unique").on(table.barbershopId, table.key),
}));

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;

// ─── Planos da Barbearia ───────────────────────────────────────────────────────

export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "cancelled", "past_due", "trialing"]);

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),           // "Plano Mensal Básico"
  description: text("description"),
  priceInCents: integer("price_in_cents").notNull(),           // 12000 = R$120,00
  creditsPerMonth: integer("credits_per_month").notNull(),     // qtd de agendamentos incluídos
  stripePriceId: varchar("stripe_price_id", { length: 255 }), // price_xxx do Stripe
  stripeProductId: varchar("stripe_product_id", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

// ─── Usuários Clientes (acesso público) ───────────────────────────────────────

export const clientUsers = pgTable("client_users", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clients.id), // vinculado ao cliente existente
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  phone: varchar("phone", { length: 20 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
}, (table) => ({
  uniqueEmailPerShop: unique("client_users_email_barbershop_unique").on(table.email, table.barbershopId),
}));

export type ClientUser = typeof clientUsers.$inferSelect;
export type InsertClientUser = typeof clientUsers.$inferInsert;

// ─── Assinaturas dos Clientes ─────────────────────────────────────────────────

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  barbershopId: integer("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientUserId: integer("client_user_id").notNull().references(() => clientUsers.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => plans.id),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  status: subscriptionStatusEnum("status").default("trialing").notNull(),
  creditsRemaining: integer("credits_remaining").default(0).notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
