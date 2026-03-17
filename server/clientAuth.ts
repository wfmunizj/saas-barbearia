/**
 * server/clientAuth.ts
 * Autenticação do cliente final (portal público /b/[slug])
 */

import { Request, Response, Router } from "express";
import { getDb } from "./db";
import { clientUsers, clients, barbershops, subscriptions, plans } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createPasswordHash, verifyPassword } from "./auth";
import { createVerificationToken, sendVerificationEmail, verifyEmailToken, canResendVerification } from "./emailService";
import { SignJWT, jwtVerify } from "jose";
import { ONE_YEAR_MS } from "@shared/const";

export const CLIENT_COOKIE_NAME = "client_session_id";

// Usa o COOKIE_SECRET do ambiente, mas assina com propósito diferente
function getSecret() {
  const secret = process.env.COOKIE_SECRET ?? "client-portal-secret-fallback";
  return new TextEncoder().encode(secret + "-client");
}

// ─── JWT próprio para clientes (independente do sdk) ─────────────────────────

export async function createClientToken(clientUserId: number, name: string): Promise<string> {
  return new SignJWT({ clientUserId, name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(getSecret());
}

export async function verifyClientToken(token: string): Promise<{ clientUserId: number; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const clientUserId = payload.clientUserId as number;
    const name = payload.name as string;
    if (!clientUserId) return null;
    return { clientUserId, name };
  } catch {
    return null;
  }
}

// ─── Verifica sessão do cliente a partir do request ──────────────────────────

export async function verifyClientSession(req: Request) {
  const cookieHeader = req.headers.cookie ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => {
      const [k, ...v] = c.trim().split("=");
      return [decodeURIComponent(k.trim()), decodeURIComponent(v.join("="))];
    })
  );
  const token = cookies[CLIENT_COOKIE_NAME];
  if (!token) return null;

  const payload = await verifyClientToken(token);
  if (!payload) return null;

  const db = await getDb();
  if (!db) return null;

  const [clientUser] = await db
    .select()
    .from(clientUsers)
    .where(eq(clientUsers.id, payload.clientUserId))
    .limit(1);

  return clientUser ?? null;
}

// ─── Cookie helper ────────────────────────────────────────────────────────────

function setClientCookie(res: Response, token: string) {
  res.cookie(CLIENT_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: ONE_YEAR_MS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const clientAuthRouter = Router();

// POST /api/client/:slug/register
clientAuthRouter.post("/:slug/register", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });

    const [barbershop] = await db.select().from(barbershops)
      .where(and(eq(barbershops.slug, slug), eq(barbershops.isActive, true))).limit(1);
    if (!barbershop) return res.status(404).json({ error: "Barbearia não encontrada" });

    // Verifica se email já existe nessa barbearia
    const [existing] = await db.select().from(clientUsers).where(
      and(eq(clientUsers.email, email), eq(clientUsers.barbershopId, barbershop.id))
    ).limit(1);
    if (existing) return res.status(409).json({ error: "Este email já está cadastrado" });

    // Cria ou vincula cliente
    let clientId: number | null = null;
    const [existingClient] = await db.select().from(clients).where(
      and(eq(clients.barbershopId, barbershop.id), eq(clients.email, email))
    ).limit(1);

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const [newClient] = await db.insert(clients).values({
        barbershopId: barbershop.id,
        name,
        phone: phone || "",
        email,
        isActive: true,
      }).returning();
      clientId = newClient.id;
    }

    const passwordHash = createPasswordHash(password);
    const [clientUser] = await db.insert(clientUsers).values({
      barbershopId: barbershop.id,
      clientId,
      name,
      email,
      passwordHash,
      phone: phone || null,
      isActive: true,
      lastSignedIn: new Date(),
    }).returning();

    const sessionToken = await createClientToken(clientUser.id, name);
    setClientCookie(res, sessionToken);

    // Enviar email de verificação
    try {
      const verifyToken = await createVerificationToken("client", clientUser.id, email);
      await sendVerificationEmail(email, name, verifyToken, {
        barbershopName: barbershop.name,
        userType: "client",
        slug: barbershop.slug,
      });
    } catch (err) {
      console.error("[ClientAuth] Falha ao enviar email de verificação:", err);
    }

    return res.json({
      success: true,
      requiresVerification: true,
      user: { id: clientUser.id, name: clientUser.name, email: clientUser.email, emailVerified: false },
      barbershop: { id: barbershop.id, name: barbershop.name, slug: barbershop.slug },
    });
  } catch (error) {
    console.error("[ClientAuth] Register error:", error);
    return res.status(500).json({ error: "Erro interno ao registrar" });
  }
});

// POST /api/client/:slug/login
clientAuthRouter.post("/:slug/login", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });

    const [barbershop] = await db.select().from(barbershops)
      .where(eq(barbershops.slug, slug)).limit(1);
    if (!barbershop) return res.status(404).json({ error: "Barbearia não encontrada" });

    const [clientUser] = await db.select().from(clientUsers).where(
      and(eq(clientUsers.email, email), eq(clientUsers.barbershopId, barbershop.id))
    ).limit(1);

    if (!clientUser || !verifyPassword(password, clientUser.passwordHash)) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    if (!clientUser.isActive) {
      return res.status(403).json({ error: "Conta desativada" });
    }

    await db.update(clientUsers)
      .set({ lastSignedIn: new Date(), updatedAt: new Date() })
      .where(eq(clientUsers.id, clientUser.id));

    const token = await createClientToken(clientUser.id, clientUser.name ?? "");
    setClientCookie(res, token);

    return res.json({
      success: true,
      user: { id: clientUser.id, name: clientUser.name, email: clientUser.email },
      barbershop: { id: barbershop.id, name: barbershop.name, slug: barbershop.slug },
    });
  } catch (error) {
    console.error("[ClientAuth] Login error:", error);
    return res.status(500).json({ error: "Erro interno ao fazer login" });
  }
});

// GET /api/client/:slug/me
clientAuthRouter.get("/:slug/me", async (req: Request, res: Response) => {
  try {
    const clientUser = await verifyClientSession(req);
    if (!clientUser) return res.status(401).json({ error: "Não autenticado" });
    return res.json({
      user: {
        id: clientUser.id,
        name: clientUser.name,
        email: clientUser.email,
        emailVerified: clientUser.emailVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

// GET /api/client/verify-email?token=... — Verificar email via link (client)
clientAuthRouter.get("/verify-email", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) return res.redirect("/?error=token_missing");

    const result = await verifyEmailToken(token);
    if (!result.valid) {
      const errorParam = encodeURIComponent(result.error ?? "Token inválido");
      return res.redirect(`/?error=${errorParam}`);
    }

    return res.redirect("/?emailVerified=true");
  } catch (error) {
    console.error("[ClientAuth] Verify email error:", error);
    return res.redirect("/?error=internal");
  }
});

// POST /api/client/:slug/resend-verification — Reenviar email de verificação
clientAuthRouter.post("/:slug/resend-verification", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const clientUser = await verifyClientSession(req);
    if (!clientUser) return res.status(401).json({ error: "Não autenticado" });

    if ((clientUser as any).email_verified || (clientUser as any).emailVerified) {
      return res.json({ success: true, message: "Email já verificado" });
    }

    const allowed = await canResendVerification("client", clientUser.id);
    if (!allowed) {
      return res.status(429).json({ error: "Aguarde 1 minuto para reenviar" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco indisponível" });
    const [barbershop] = await db.select().from(barbershops).where(eq(barbershops.slug, slug)).limit(1);

    const verifyToken = await createVerificationToken("client", clientUser.id, clientUser.email ?? "");
    await sendVerificationEmail(clientUser.email ?? "", clientUser.name ?? "", verifyToken, {
      barbershopName: barbershop?.name,
      userType: "client",
      slug,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("[ClientAuth] Resend verification error:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// POST /api/client/logout
clientAuthRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(CLIENT_COOKIE_NAME, { path: "/" });
  return res.json({ success: true });
});