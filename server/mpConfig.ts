/**
 * server/mpConfig.ts
 * Helper centralizado para seleção de credenciais do Mercado Pago.
 *
 * Super Admin (SUPER_ADMIN_EMAIL): usa credenciais de TESTE (sandbox) do MP.
 * Todos os outros usuários: credenciais de PRODUÇÃO.
 *
 * O webhook tenta prod primeiro e usa teste como fallback, suportando
 * eventos de ambas as envs no mesmo endpoint.
 */

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? "";

/** Token de produção (sempre disponível) */
export const MP_ACCESS_TOKEN_PROD = process.env.MP_ACCESS_TOKEN!;

/** Token de teste (pode estar vazio se não configurado) */
export const MP_ACCESS_TOKEN_TEST_VALUE = process.env.MP_ACCESS_TOKEN_TEST ?? "";

/** Retorna true se o e-mail pertence ao super admin (modo teste MP ativo) */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email || !SUPER_ADMIN_EMAIL) return false;
  return email.toLowerCase().trim() === SUPER_ADMIN_EMAIL.toLowerCase().trim();
}

/**
 * Retorna o access token MP correto conforme o e-mail do usuário autenticado.
 * Super admin → token de teste; demais → token de produção.
 */
export function getMpAccessToken(userEmail?: string | null): string {
  if (isSuperAdmin(userEmail) && MP_ACCESS_TOKEN_TEST_VALUE) {
    console.log("[MP] 🧪 Modo teste ativo para:", userEmail);
    return MP_ACCESS_TOKEN_TEST_VALUE;
  }
  return MP_ACCESS_TOKEN_PROD;
}
