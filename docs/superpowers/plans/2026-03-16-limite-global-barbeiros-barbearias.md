# Limite Global de Barbeiros e Barbearias por Plano SaaS — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o limite de barbeiros global por dono (somado em todas as barbearias) e adicionar limite de barbearias por plano (máx 2 para Starter/Profissional, ilimitado para Premium).

**Architecture:** Sem mudança de schema principal. A tabela `saas_subscriptions` mantém `barbershop_id`. Apenas as queries de verificação são alteradas para resolver por `owner_id` em vez de `barbershop_id`. Uma nova coluna `max_barbershops` é adicionada a `saas_plans` via migration SQL aplicada pelo Supabase MCP.

**Tech Stack:** TypeScript, tRPC, Drizzle ORM, PostgreSQL (Supabase), Express, Railway (deploy)

**Spec:** `docs/superpowers/specs/2026-03-16-limite-global-barbeiros-barbearias-design.md`

---

## Chunk 1: Migration SQL + routers.ts

### Task 1: Aplicar migration SQL

**Files:**
- Executar via Supabase MCP (não há arquivo de migration neste projeto)

- [ ] **Step 1: Verificar pré-requisito — owner_id preenchido em todas as barbershops**

Execute via Supabase MCP:
```sql
SELECT COUNT(*) FROM barbershops WHERE owner_id IS NULL;
```
Resultado esperado: `0`. Se > 0, não prosseguir sem investigar.

- [ ] **Step 2: Aplicar migration**

Execute via Supabase MCP (dentro de uma transação):
```sql
BEGIN;
ALTER TABLE saas_plans ADD COLUMN max_barbershops INTEGER NOT NULL DEFAULT 2;
UPDATE saas_plans SET max_barbershops = -1 WHERE name = 'Premium';
COMMIT;
```

- [ ] **Step 3: Verificar resultado**

```sql
SELECT id, name, max_barbers, max_barbershops FROM saas_plans ORDER BY sort_order;
```
Resultado esperado: Starter e Profissional com `max_barbershops = 2`, Premium com `max_barbershops = -1`.

---

### Task 2: Fix `barbers.create` — limite global por owner

**Files:**
- Modify: `server/routers.ts:332-382`

O bloco atual (linhas 332-382) faz lookup por `barbershop_id` e conta barbers só da barbearia atual. Substituir completamente esse bloco.

- [ ] **Step 1: Ler o bloco atual para confirmar contexto**

Leia `server/routers.ts` linhas 327-386 antes de editar.

- [ ] **Step 2: Substituir o bloco de verificação de limite**

Substituir o trecho entre `// ─── Verifica limite do plano SaaS ───` e `// ─────────────────────────────────────────────────────────────────────` pelo seguinte (mantendo os comentários delimitadores):

> **Nota:** A query já filtra `status IN ('active','trialing')`, portanto `sub` só existe quando a subscription é válida — não é necessário checar status novamente dentro do bloco. A verificação de bloqueio por status inativo é responsabilidade do middleware `checkSaasSubscription`.

```typescript
// ─── Verifica limite do plano SaaS ───────────────────────────────────
const userId = (ctx.user as any).id; // ownerId — NÃO usar getBarbershopId()

// Subscription resolvida pelo owner (cobre todas as barbearias dele)
const subResult = await dbInstance.execute(
  ("SELECT sp.max_barbers FROM saas_subscriptions ss " +
    "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
    "WHERE ss.barbershop_id IN (" +
    "  SELECT id FROM barbershops WHERE owner_id = " + userId +
    ") " +
    "AND ss.status IN ('active','trialing') " +
    "ORDER BY CASE WHEN ss.status = 'active' THEN 0 ELSE 1 END ASC " +
    "LIMIT 1") as any
);
const subRows = Array.isArray(subResult)
  ? subResult
  : ((subResult as any).rows ?? []);
const sub = subRows[0];

// Contagem GLOBAL de barbeiros ativos em TODAS as barbearias do owner
const countResult = await dbInstance.execute(
  ("SELECT COUNT(*) as total FROM barbers " +
    "WHERE barbershop_id IN (" +
    "  SELECT id FROM barbershops WHERE owner_id = " + userId +
    ") " +
    "AND is_active = true") as any
);
const countRows = Array.isArray(countResult)
  ? countResult
  : ((countResult as any).rows ?? []);
const total = parseInt(countRows[0]?.total ?? "0");

// sub inexistente → sem subscription = sem bloqueio (comportamento legado)
if (sub && sub.max_barbers !== -1 && total >= sub.max_barbers) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Seu plano permite até ${sub.max_barbers} barbeiro${sub.max_barbers !== 1 ? "s" : ""} no total. Faça upgrade para adicionar mais.`,
  });
}
// ─────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Verificar build TypeScript**

```bash
cd C:\Users\welli\OneDrive\Projetos\saas-barbearia && npx tsc --noEmit 2>&1 | head -30
```
Resultado esperado: sem erros.

---

### Task 3: Fix `barbershops.create` — limite de barbearias por plano

**Files:**
- Modify: `server/routers.ts:148-152` (entre slug check e `dbInstance.insert`)

- [ ] **Step 1: Ler contexto exato da inserção**

Leia `server/routers.ts` linhas 139-167 antes de editar.

- [ ] **Step 2: Inserir bloco de verificação de limite de barbearias**

Após o bloco `if (existingSlug) { throw ... }` (linha ~150) e antes de `const [newShop] = await dbInstance.insert(barbershops)...`, inserir:

```typescript
// ─── Verifica limite de barbearias do plano SaaS ─────────────────────
const shopSubResult = await dbInstance.execute(
  ("SELECT sp.max_barbershops FROM saas_subscriptions ss " +
    "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
    "WHERE ss.barbershop_id IN (" +
    "  SELECT id FROM barbershops WHERE owner_id = " + userId +
    ") " +
    "AND ss.status IN ('active','trialing') " +
    "ORDER BY CASE WHEN ss.status = 'active' THEN 0 ELSE 1 END ASC " +
    "LIMIT 1") as any
);
const shopSubRows = Array.isArray(shopSubResult)
  ? shopSubResult
  : ((shopSubResult as any).rows ?? []);
const maxBarbershops: number = shopSubRows[0]?.max_barbershops ?? 2;

const shopCountResult = await dbInstance.execute(
  ("SELECT COUNT(*) as total FROM barbershops WHERE owner_id = " + userId) as any
);
const shopCountRows = Array.isArray(shopCountResult)
  ? shopCountResult
  : ((shopCountResult as any).rows ?? []);
const totalShops = parseInt(shopCountRows[0]?.total ?? "0");

if (maxBarbershops !== -1 && totalShops >= maxBarbershops) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Seu plano permite até ${maxBarbershops} barbearia${maxBarbershops !== 1 ? "s" : ""}. Faça upgrade para o Premium para criar mais.`,
  });
}
// ─────────────────────────────────────────────────────────────────────
```

> **Atenção:** `userId` já está declarado na linha 140 (`const userId = (ctx.user as any).id`). Não redeclare.

- [ ] **Step 3: Verificar build TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Resultado esperado: sem erros.

- [ ] **Step 4: Commit do Chunk 1**

```bash
git add server/routers.ts
git commit -m "feat: limite global de barbeiros e limite de barbearias por plano SaaS"
```

---

## Chunk 2: Middleware + mpSaasRoutes + Push

### Task 4: Fix `checkSaasSubscription.ts` — lookup via owner

**Files:**
- Modify: `server/middleware/checkSaasSubscription.ts:59-85`

- [ ] **Step 1: Ler o arquivo completo**

Leia `server/middleware/checkSaasSubscription.ts` completo antes de editar.

- [ ] **Step 2: Substituir SELECT e normalização de rows**

Substituir o bloco do `db.execute` (SELECT) e a linha de normalização:

```typescript
// ANTES (linhas 59-63):
const result = await db.execute(
  ("SELECT status, trial_ends_at FROM saas_subscriptions " +
  "WHERE barbershop_id = " + barbershopId + " LIMIT 1") as any
);
const rows = Array.isArray(result) ? result : (result as any[]);

// DEPOIS:
const result = await db.execute(
  ("SELECT ss.id, ss.status, ss.trial_ends_at FROM saas_subscriptions ss " +
   "WHERE ss.barbershop_id IN (" +
   "  SELECT id FROM barbershops WHERE owner_id = (" +
   "    SELECT owner_id FROM barbershops WHERE id = " + barbershopId +
   "  )" +
   ") " +
   "AND ss.status IN ('active','trialing','past_due','cancelled','expired') " +
   "ORDER BY CASE WHEN ss.status = 'active' THEN 0 WHEN ss.status = 'trialing' THEN 1 ELSE 2 END ASC " +
   "LIMIT 1") as any
);
const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
```

- [ ] **Step 3: Substituir UPDATE de expiração de trial**

Substituir o UPDATE de expiração (linhas ~77-80):

```typescript
// ANTES:
await db.execute(
  ("UPDATE saas_subscriptions SET status='expired', updated_at=NOW() " +
  "WHERE barbershop_id=" + barbershopId) as any
);

// DEPOIS:
await db.execute(
  ("UPDATE saas_subscriptions SET status='expired', updated_at=NOW() " +
  "WHERE id=" + sub.id) as any
);
```

- [ ] **Step 4: Verificar build TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Resultado esperado: sem erros.

---

### Task 5: Fix `mpSaasRoutes.ts` — incluir `max_barbershops` e corrigir ORDER BY

**Files:**
- Modify: `server/mpSaasRoutes.ts:67-76`

- [ ] **Step 1: Ler o trecho atual**

Leia `server/mpSaasRoutes.ts` linhas 60-97 antes de editar.

- [ ] **Step 2: Substituir a query do GET /api/saas/subscription**

```typescript
// ANTES (linhas 67-76):
const rows = await rawSql(db,
  "SELECT ss.*, sp.name as plan_name, sp.max_barbers, sp.price_in_cents " +
  "FROM saas_subscriptions ss " +
  "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
  "WHERE ss.barbershop_id IN (" +
  "  SELECT id FROM barbershops WHERE owner_id = " + owner.id +
  "  UNION SELECT " + owner.barbershopId +
  ") " +
  "ORDER BY ss.status = 'active' DESC, ss.status = 'trialing' DESC, ss.created_at DESC LIMIT 1"
);

// DEPOIS:
const rows = await rawSql(db,
  "SELECT ss.*, sp.name as plan_name, sp.max_barbers, sp.max_barbershops, sp.price_in_cents " +
  "FROM saas_subscriptions ss " +
  "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
  "WHERE ss.barbershop_id IN (" +
  "  SELECT id FROM barbershops WHERE owner_id = " + owner.id +
  ") " +
  "ORDER BY CASE WHEN ss.status = 'active' THEN 0 WHEN ss.status = 'trialing' THEN 1 ELSE 2 END ASC, " +
  "ss.created_at DESC LIMIT 1"
);
```

- [ ] **Step 3: Verificar build TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Resultado esperado: sem erros.

- [ ] **Step 4: Commit do Chunk 2**

```bash
git add server/middleware/checkSaasSubscription.ts server/mpSaasRoutes.ts
git commit -m "feat: middleware e rota saas resolvem subscription via owner para barbearias secundárias"
```

- [ ] **Step 5: Push para Railway**

```bash
git push origin main
```
Aguardar deploy concluir (≈2 min).

---

## Verificação Final (manual)

- [ ] **V1 — Limite de barbearias**
  - Owner Starter/Profissional com 2 barbearias → tentar criar 3ª via UI
  - Resultado esperado: erro *"Seu plano permite até 2 barbearias. Faça upgrade para o Premium para criar mais."*

- [ ] **V2 — Limite global de barbeiros**
  - Owner com barbeiros distribuídos (ex: 4 na barbearia A e 1 na barbearia B, limite 5)
  - Tentar adicionar 1 barbeiro em qualquer barbearia
  - Resultado esperado: erro *"Seu plano permite até 5 barbeiros no total."*

- [ ] **V3 — Barbearia secundária coberta automaticamente**
  - Owner com subscription ativa na barbearia principal cria uma barbearia adicional
  - Acessa a barbearia adicional → não deve receber 402
  - `GET /api/saas/subscription` na barbearia adicional deve retornar `canUse: true`

- [ ] **V4 — Premium ilimitado**
  - Owner Premium cria 3ª barbearia → sucesso
  - Adiciona barbeiros além do limite anterior → sucesso

- [ ] **V5 — DB: verificar `max_barbershops`**

```sql
SELECT id, name, max_barbers, max_barbershops FROM saas_plans ORDER BY sort_order;
```
Esperado: Premium com `max_barbershops = -1`, demais com `2`.

- [ ] **V6 — Owner sem subscription pode criar barbeiros (comportamento legado)**
  - Criar um owner sem `saas_subscriptions` (ou usar conta de teste sem plano ativo)
  - Tentar adicionar um barbeiro → deve funcionar sem erro
  - Garante que a remoção do bloco `if (sub)` não quebrou o caminho de dados legados
