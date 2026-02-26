/**
 * server/auth.ts
 * Autenticação própria: registro de barbearia + login por email/senha
 * Compatível com o sistema de JWT/session já existente
 */

import { Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { getDb } from "./db";
import { users, barbershops } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt).digest("hex");
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

// Armazena salt junto com o hash: "salt:hash"
export function createPasswordHash(password: string): string {
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  return hashPassword(password, salt) === hash;
}

// ─── Register Barbershop ──────────────────────────────────────────────────────

export async function registerBarbershop(req: Request, res: Response) {
  try {
    const { barbershopName, ownerName, email, password } = req.body;

    if (!barbershopName || !ownerName || !email || !password) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados indisponível" });

    // Verifica se email já existe
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      return res.status(409).json({ error: "Este email já está cadastrado" });
    }

    // Gera slug único para a barbearia
    let slug = generateSlug(barbershopName);
    const existingSlug = await db.select().from(barbershops).where(eq(barbershops.slug, slug)).limit(1);
    if (existingSlug.length > 0) {
      slug = `${slug}-${randomBytes(3).toString("hex")}`;
    }

    // Cria a barbearia
    const [barbershop] = await db.insert(barbershops).values({
      name: barbershopName,
      slug,
      email,
      plan: "free",
      isActive: true,
    }).returning();

    // Cria o usuário owner
    const passwordHash = createPasswordHash(password);
    const [user] = await db.insert(users).values({
      barbershopId: barbershop.id,
      name: ownerName,
      email,
      passwordHash,
      loginMethod: "email",
      role: "owner",
      isActive: true,
      lastSignedIn: new Date(),
    }).returning();

    // Gera session token
    const sessionToken = await sdk.createSessionToken(user.id.toString(), {
      name: ownerName,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      barbershop: { id: barbershop.id, name: barbershop.name, slug: barbershop.slug },
    });
  } catch (error) {
    console.error("[Auth] Register error:", error);
    return res.status(500).json({ error: "Erro interno ao registrar" });
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginWithEmail(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados indisponível" });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Conta desativada. Entre em contato com o suporte." });
    }

    const passwordValid = verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    // Atualiza lastSignedIn
    await db.update(users).set({ lastSignedIn: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

    const sessionToken = await sdk.createSessionToken(user.id.toString(), {
      name: user.name || "",
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

    // Busca dados da barbearia
    let barbershop = null;
    if (user.barbershopId) {
      const [bs] = await db.select().from(barbershops).where(eq(barbershops.id, user.barbershopId)).limit(1);
      barbershop = bs ? { id: bs.id, name: bs.name, slug: bs.slug, plan: bs.plan } : null;
    }

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      barbershop,
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return res.status(500).json({ error: "Erro interno ao fazer login" });
  }
}

// ─── Get current user (via session) ──────────────────────────────────────────

export async function getCurrentUser(req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Banco de dados indisponível" });

    // Tenta autenticar via session cookie
    const cookies = req.headers.cookie ?? "";
    const cookieMap = Object.fromEntries(
      cookies.split(";").map(c => c.trim().split("=").map(decodeURIComponent))
    );
    const sessionToken = cookieMap[COOKIE_NAME];

    if (!sessionToken) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const session = await sdk.verifySession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: "Sessão inválida" });
    }

    // session.openId agora guarda user.id (para auth própria) ou openId (OAuth)
    const userId = parseInt(session.openId);
    if (isNaN(userId)) {
      return res.status(401).json({ error: "Sessão inválida" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

    let barbershop = null;
    if (user.barbershopId) {
      const [bs] = await db.select().from(barbershops).where(eq(barbershops.id, user.barbershopId)).limit(1);
      barbershop = bs ? { id: bs.id, name: bs.name, slug: bs.slug, plan: bs.plan } : null;
    }

    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      barbershop,
    });
  } catch (error) {
    console.error("[Auth] getCurrentUser error:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
}
