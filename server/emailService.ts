/**
 * server/emailService.ts
 * Serviço de envio de emails via Resend
 * Usado para verificação de email no registro de owners e clientes
 */

import { Resend } from "resend";
import { createHash, randomUUID } from "crypto";
import { getDb } from "./db";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "onboarding@resend.dev";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ─── Token helpers ──────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ─── Gerar e salvar token de verificação ─────────────────────────────────────

export async function createVerificationToken(
  userType: "owner" | "client",
  userId: number,
  email: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Invalidar tokens anteriores do mesmo usuário
  await db.execute(
    (`DELETE FROM email_verification_tokens WHERE user_type = '${userType}' AND user_id = ${userId}`) as any
  );

  const token = randomUUID();
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db.execute(
    (`INSERT INTO email_verification_tokens (token_hash, user_type, user_id, email, expires_at) ` +
      `VALUES ('${tokenHash}', '${userType}', ${userId}, '${email.replace(/'/g, "''")}', '${expiresAt.toISOString()}')`) as any
  );

  return token;
}

// ─── Verificar token ─────────────────────────────────────────────────────────

export async function verifyEmailToken(
  token: string
): Promise<{ valid: boolean; userType?: "owner" | "client"; userId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { valid: false, error: "Database not available" };

  const tokenHash = hashToken(token);

  const result = await db.execute(
    (`SELECT id, user_type, user_id, email, expires_at, used_at ` +
      `FROM email_verification_tokens WHERE token_hash = '${tokenHash}' LIMIT 1`) as any
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  const row = rows[0];

  if (!row) return { valid: false, error: "Token inválido" };
  if (row.used_at) return { valid: false, error: "Token já utilizado" };
  if (new Date(row.expires_at) < new Date()) return { valid: false, error: "Token expirado" };

  // Marcar como usado
  await db.execute(
    (`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ${row.id}`) as any
  );

  // Atualizar email_verified no usuário
  if (row.user_type === "owner") {
    await db.execute(
      (`UPDATE users SET email_verified = true WHERE id = ${row.user_id}`) as any
    );
  } else {
    await db.execute(
      (`UPDATE client_users SET email_verified = true WHERE id = ${row.user_id}`) as any
    );
  }

  return { valid: true, userType: row.user_type, userId: row.user_id };
}

// ─── Rate limit de reenvio (1 por minuto) ────────────────────────────────────

export async function canResendVerification(
  userType: "owner" | "client",
  userId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.execute(
    (`SELECT created_at FROM email_verification_tokens ` +
      `WHERE user_type = '${userType}' AND user_id = ${userId} ` +
      `ORDER BY created_at DESC LIMIT 1`) as any
  );
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  const lastToken = rows[0];

  if (!lastToken) return true;

  const elapsed = Date.now() - new Date(lastToken.created_at).getTime();
  return elapsed > 60_000; // 1 minuto
}

// ─── Enviar email de verificação ─────────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  options?: { barbershopName?: string; userType?: "owner" | "client"; slug?: string }
): Promise<boolean> {
  const userType = options?.userType ?? "owner";
  const verifyPath = userType === "client" && options?.slug
    ? `/b/${options.slug}/verificar-email?token=${token}`
    : `/verificar-email?token=${token}`;
  const verificationUrl = `${BASE_URL}${verifyPath}`;

  const barbershopName = options?.barbershopName;
  const subject = barbershopName
    ? `Confirme seu email — ${barbershopName}`
    : "Confirme seu email — BarberSaaS";

  const html = buildVerificationHtml(name, verificationUrl, barbershopName);

  if (!resend) {
    console.log(`[Email] Resend não configurado. URL de verificação: ${verificationUrl}`);
    return true; // Em dev, permite continuar sem email
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[Email] Erro ao enviar:", error);
      return false;
    }

    console.log(`[Email] Verificação enviada para ${to}`);
    return true;
  } catch (err) {
    console.error("[Email] Erro inesperado:", err);
    return false;
  }
}

// ─── Template HTML ───────────────────────────────────────────────────────────

function buildVerificationHtml(
  name: string,
  verificationUrl: string,
  barbershopName?: string
): string {
  const brand = barbershopName ?? "BarberSaaS";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#18181b;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">✂️ ${brand}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:18px;">Olá, ${name}! 👋</h2>
              <p style="margin:0 0 24px;color:#52525b;font-size:15px;line-height:1.6;">
                Para confirmar seu email e ativar sua conta, clique no botão abaixo:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;">
                      Confirmar Email
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;line-height:1.5;">
                Este link expira em <strong>24 horas</strong>.<br>
                Se você não criou esta conta, pode ignorar este email.
              </p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #e4e4e7;">
              <p style="margin:0;color:#d4d4d8;font-size:11px;">
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${verificationUrl}" style="color:#a1a1aa;word-break:break-all;">${verificationUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
