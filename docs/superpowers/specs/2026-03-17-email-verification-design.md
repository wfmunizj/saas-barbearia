# Spec — Verificação de Email por Link de Confirmação

**Data:** 2026-03-17
**Status:** Aprovado (autorização autônoma do owner)

---

## Contexto

Atualmente, qualquer pessoa pode criar uma conta (owner ou client) com qualquer email sem verificação. Isso permite criação massiva de contas com emails falsos, comprometendo a integridade dos dados e potencialmente gerando spam.

O owner solicitou "pelo menos um link de confirmação" para validar que o email é real antes de permitir uso completo da plataforma.

---

## Requisitos

1. **Ambos os fluxos de registro** (owner e client) devem enviar email de confirmação
2. **Usuário não verificado não pode usar a plataforma** — redirecionado para página "verifique seu email"
3. **Link de confirmação** com token único e expiração de 24 horas
4. **Reenvio de email** disponível com rate limit (1 por minuto)
5. **Sem mudança na experiência de registro** — a conta é criada normalmente, mas o acesso fica bloqueado até verificar
6. **Serviço de email**: Resend (API simples, 100 emails/dia grátis, ideal para fase inicial)

---

## Decisões de Design

### Por que bloquear acesso antes da verificação?
- O objetivo principal é impedir contas com emails falsos
- Se permitir acesso sem verificação, o incentivo para verificar é baixo
- Experiência: registra → vê tela "verifique seu email" → clica link → acesso liberado

### Por que Resend?
- API simples (1 dependência, 1 chamada HTTP)
- 100 emails/dia grátis (suficiente para fase inicial)
- Suporte a domínio customizado depois
- Alternativa seria Nodemailer+SMTP, mas requer configuração de servidor SMTP

### Tokens
- UUID v4 como token (não-sequencial, seguro)
- Armazenado como hash SHA256 no banco (proteção se DB vazar)
- Expiração: 24 horas
- Tabela única `email_verification_tokens` para ambos os tipos de usuário

---

## Migration SQL

```sql
CREATE TABLE email_verification_tokens (
  id SERIAL PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('owner', 'client')),
  user_id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evt_token_hash ON email_verification_tokens(token_hash);
CREATE INDEX idx_evt_user ON email_verification_tokens(user_type, user_id);

-- Adicionar coluna email_verified em ambas as tabelas
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Marcar owners existentes como verificados (já estão usando a plataforma)
UPDATE users SET email_verified = true;
UPDATE client_users SET email_verified = true;
```

---

## Solução Técnica

### 1. Novo arquivo: `server/emailService.ts`

Wrapper simples para o Resend SDK:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL ?? "noreply@seudominio.com";

export async function sendVerificationEmail(
  to: string,
  name: string,
  verificationUrl: string,
  barbershopName?: string
): Promise<boolean> {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: barbershopName
      ? `Confirme seu email — ${barbershopName}`
      : "Confirme seu email — BarberSaaS",
    html: buildVerificationHtml(name, verificationUrl, barbershopName),
  });
  return !error;
}
```

### 2. Modificar: `server/auth.ts` — `registerBarbershop()`

Após criar o user e gerar sessão:
1. Gerar token UUID, calcular hash SHA256
2. Inserir em `email_verification_tokens`
3. Enviar email via `sendVerificationEmail()`
4. Retornar `{ success: true, requiresVerification: true }` (em vez de setar cookie imediatamente)
5. Frontend redireciona para `/verify-email` em vez de dashboard

### 3. Modificar: `server/clientAuth.ts` — `registerClientUser()`

Mesmo padrão:
1. Criar conta normalmente
2. Gerar e enviar token de verificação
3. Setar cookie mas com flag `emailVerified: false` no JWT
4. Frontend redireciona para `/b/:slug/verificar-email`

### 4. Novo endpoint: `GET /api/auth/verify-email?token=...`

1. Calcular SHA256 do token recebido
2. Buscar em `email_verification_tokens` WHERE `token_hash` = hash AND `used_at IS NULL` AND `expires_at > NOW()`
3. Se válido: marcar `used_at = NOW()`, atualizar `email_verified = true` no user/client_user
4. Redirecionar para página de sucesso

### 5. Novo endpoint: `POST /api/auth/resend-verification`

1. Autenticar via cookie
2. Verificar rate limit (último envio > 1 minuto)
3. Gerar novo token, invalidar anteriores
4. Enviar email

### 6. Middleware de verificação

Para owners: checar `email_verified` no middleware de autenticação do tRPC. Se false, retornar erro especial que o frontend trata exibindo "verifique seu email".

Para clients: checar `email_verified` no `verifyClientToken`. Endpoints públicos (getBarbershop, getPlans, etc.) continuam acessíveis; endpoints protegidos (bookAppointment, etc.) bloqueiam.

### 7. Frontend

**Owner**:
- Nova página `/verify-email` com mensagem "Verifique seu email" + botão reenviar
- Dashboard detecta `emailVerified: false` e redireciona

**Client**:
- Nova página `/b/:slug/verificar-email` com mesma estrutura
- Styled com cores da barbearia

---

## Arquivos Modificados/Criados

| Arquivo | Mudança |
|---|---|
| Migration SQL | Tabela `email_verification_tokens`, colunas `email_verified` |
| `server/emailService.ts` | **NOVO** — wrapper Resend + template HTML |
| `server/auth.ts` | Enviar verificação no registro owner |
| `server/clientAuth.ts` | Enviar verificação no registro client |
| `server/authRoutes.ts` | Novos endpoints verify-email, resend-verification |
| `server/clientAuth.ts` | Novo endpoint verify-email para clients |
| `client/src/pages/VerifyEmail.tsx` | **NOVO** — página de verificação owner |
| `client/src/pages/portal/VerifyEmailPage.tsx` | **NOVO** — página de verificação client |
| `package.json` | Adicionar `resend` como dependência |

---

## Variáveis de Ambiente Necessárias

| Variável | Descrição |
|---|---|
| `RESEND_API_KEY` | API key do Resend |
| `FROM_EMAIL` | Email remetente (ex: noreply@barbersaas.com) |

---

## Verificação

1. Registrar owner → recebe email → clica link → acesso liberado
2. Registrar client → recebe email → clica link → pode agendar
3. Tentar acessar dashboard sem verificar → redirecionado para "verifique seu email"
4. Reenviar email → funciona, mas não mais que 1x por minuto
5. Token expirado (>24h) → mensagem de erro + opção de reenviar
6. Usuários existentes → continuam funcionando (marcados como verificados na migration)
