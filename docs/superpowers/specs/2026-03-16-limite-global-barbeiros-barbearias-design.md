# Spec — Limite Global de Barbeiros e Barbearias por Plano SaaS

**Data:** 2026-03-16
**Status:** Aprovado

---

## Contexto

Hoje o limite de barbeiros (`max_barbers`) é verificado **por barbearia**: cada barbearia consulta sua própria `saas_subscriptions` e conta apenas os seus próprios barbers ativos. Isso significa que um owner com 2 barbearias pode ter `max_barbers` barbeiros em cada uma, dobrando efetivamente o limite do plano.

Além disso, não existe hoje nenhum limite no número de barbearias que um owner pode criar.

---

## Requisitos

1. **Limite de barbeiros é global por dono**: o `max_barbers` do plano representa o total de barbeiros ativos somados em todas as barbearias do owner.
2. **Limite de barbearias por plano**: Starter e Profissional permitem até 2 barbearias; Premium permite ilimitadas.
3. **Novas barbearias automaticamente cobertas**: quando o owner cria uma barbearia adicional (dentro do limite), ela é coberta pela subscription existente sem pagamento extra — sem nova entrada em `saas_subscriptions`.
4. **Sem mudança de schema principal**: a tabela `saas_subscriptions` mantém `barbershop_id`; apenas as queries de checagem mudam.

---

## Limites por Plano

| Plano        | Barbearias | Barbeiros      |
|--------------|------------|----------------|
| Starter      | máx 2      | conforme plano |
| Profissional | máx 2      | conforme plano |
| Premium      | ilimitado  | -1 (ilimitado) |

---

## Definição de `ownerId`

Em todos os handlers de `routers.ts`, `ownerId` = `(ctx.user as any).id` — o `id` do usuário autenticado na sessão, **não** o resultado de `getBarbershopId()`. Em `middleware/checkSaasSubscription.ts`, o `ownerId` é obtido via subquery: `SELECT owner_id FROM barbershops WHERE id = {barbershopId}`.

---

## Migration SQL (executar atomicamente em uma única transação)

```sql
BEGIN;
ALTER TABLE saas_plans ADD COLUMN max_barbershops INTEGER NOT NULL DEFAULT 2;
UPDATE saas_plans SET max_barbershops = -1 WHERE name = 'Premium';
COMMIT;
```

> `DEFAULT 2` aplica restrição temporária a todos os planos até o `UPDATE` rodar. A transação garante que nenhum estado intermediário seja visível.

---

## Solução Técnica

### 1. `server/routers.ts` — `barbershops.create`

Adicionar verificação de limite **após a checagem de slug único e antes de `dbInstance.insert(barbershops).values(...)`**. Usa `dbInstance.execute(... as any)` conforme padrão do arquivo:

```typescript
const userId = (ctx.user as any).id; // ownerId

// Buscar subscription e max_barbershops do plano
const subResult = await dbInstance.execute(
  ("SELECT sp.max_barbershops FROM saas_subscriptions ss " +
   "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
   "WHERE ss.barbershop_id IN (SELECT id FROM barbershops WHERE owner_id = " + userId + ") " +
   "AND ss.status IN ('active','trialing') " +
   "ORDER BY CASE WHEN ss.status = 'active' THEN 0 ELSE 1 END ASC LIMIT 1") as any
);
const subRows = Array.isArray(subResult) ? subResult : (subResult as any).rows ?? [];
const maxBarbershops: number = subRows[0]?.max_barbershops ?? 2; // sem plano → limite padrão

// Contar barbearias atuais do owner
const countResult = await dbInstance.execute(
  ("SELECT COUNT(*) as total FROM barbershops WHERE owner_id = " + userId) as any
);
const countRows = Array.isArray(countResult) ? countResult : (countResult as any).rows ?? [];
const total = parseInt(countRows[0]?.total ?? "0");

if (maxBarbershops !== -1 && total >= maxBarbershops) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Seu plano permite até ${maxBarbershops} barbearia${maxBarbershops !== 1 ? "s" : ""}. Faça upgrade para o Premium para criar mais.`,
  });
}
```

---

### 2. `server/routers.ts` — `barbers.create`

Substituir as queries de subscription e contagem existentes:

```typescript
const userId = (ctx.user as any).id; // ownerId

// Subscription pelo owner (todas as barbearias dele)
const subResult = await dbInstance.execute(
  ("SELECT ss.status, ss.trial_ends_at, sp.max_barbers FROM saas_subscriptions ss " +
   "JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
   "WHERE ss.barbershop_id IN (SELECT id FROM barbershops WHERE owner_id = " + userId + ") " +
   "AND ss.status IN ('active','trialing') " +
   "ORDER BY CASE WHEN ss.status = 'active' THEN 0 ELSE 1 END ASC LIMIT 1") as any
);
const subRows = Array.isArray(subResult) ? subResult : (subResult as any).rows ?? [];
const sub = subRows[0];

// Contagem global de barbeiros ativos em TODAS as barbearias do owner
const countResult = await dbInstance.execute(
  ("SELECT COUNT(*) as total FROM barbers " +
   "WHERE barbershop_id IN (SELECT id FROM barbershops WHERE owner_id = " + userId + ") " +
   "AND is_active = true") as any
);
const countRows2 = Array.isArray(countResult) ? countResult : (countResult as any).rows ?? [];
const total = parseInt(countRows2[0]?.total ?? "0");

// sub inexistente → comportamento legado: sem bloqueio
if (sub && sub.max_barbers !== -1 && total >= sub.max_barbers) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Seu plano permite até ${sub.max_barbers} barbeiro${sub.max_barbers !== 1 ? "s" : ""} no total. Faça upgrade para adicionar mais.`,
  });
}
```

---

### 3. `server/middleware/checkSaasSubscription.ts`

**Problema:** a middleware usa `WHERE barbershop_id = {barbershopId}` — uma barbearia secundária (sem linha em `saas_subscriptions`) recebe 402, quebrando o Requisito 3.

**Solução:** buscar a subscription via `owner_id` da barbearia. O SELECT retorna o `id` da linha para o UPDATE usar (evita o bug de UPDATE por `barbershop_id` em barbearia sem linha).

Também corrigir a normalização de rows na linha seguinte ao `db.execute`: substituir `(result as any[])` por `(result as any).rows ?? []` — o padrão atual tem um bug onde objetos não-array são castados diretamente, fazendo `sub` ser `undefined` quando o driver retorna `{ rows: [...] }`.

```typescript
// ANTES:
const result = await db.execute(
  ("SELECT status, trial_ends_at FROM saas_subscriptions " +
  "WHERE barbershop_id = " + barbershopId + " LIMIT 1") as any
);
const rows = Array.isArray(result) ? result : (result as any[]); // BUG: cast errado

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
const rows = Array.isArray(result) ? result : (result as any).rows ?? []; // normalização correta
```

O UPDATE de expiração de trial usa `WHERE id = sub.id` (não `barbershop_id`):

```typescript
// ANTES:
"UPDATE saas_subscriptions SET status='expired', updated_at=NOW() WHERE barbershop_id=" + barbershopId

// DEPOIS:
"UPDATE saas_subscriptions SET status='expired', updated_at=NOW() WHERE id=" + sub.id
```

---

### 4. `server/mpSaasRoutes.ts` — `GET /api/saas/subscription`

A query atual já usa `WHERE owner_id = owner.id` (correto), mas precisa.

> **Pré-requisito:** esta mudança remove o `UNION SELECT owner.barbershopId` (fallback para quando `barbershops.owner_id` não estava preenchido). Assumimos que todos os registros em `barbershops` têm `owner_id` populado em produção. Se houver dúvida, verificar com `SELECT COUNT(*) FROM barbershops WHERE owner_id IS NULL` antes de aplicar.

Mudanças necessárias:
- Incluir `sp.max_barbershops` no SELECT (nova coluna)
- Corrigir o `ORDER BY` para forma portável

```typescript
// ANTES:
"SELECT ss.*, sp.name as plan_name, sp.max_barbers, sp.price_in_cents " +
"FROM saas_subscriptions ss " +
"JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
"WHERE ss.barbershop_id IN (" +
"  SELECT id FROM barbershops WHERE owner_id = " + owner.id +
"  UNION SELECT " + owner.barbershopId +
") " +
"ORDER BY ss.status = 'active' DESC, ss.status = 'trialing' DESC, ss.created_at DESC LIMIT 1"

// DEPOIS:
"SELECT ss.*, sp.name as plan_name, sp.max_barbers, sp.max_barbershops, sp.price_in_cents " +
"FROM saas_subscriptions ss " +
"JOIN saas_plans sp ON sp.id = ss.saas_plan_id " +
"WHERE ss.barbershop_id IN (" +
"  SELECT id FROM barbershops WHERE owner_id = " + owner.id +
") " +
"ORDER BY CASE WHEN ss.status = 'active' THEN 0 WHEN ss.status = 'trialing' THEN 1 ELSE 2 END ASC, " +
"ss.created_at DESC LIMIT 1"
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| Migration SQL | `ALTER TABLE saas_plans ADD COLUMN max_barbershops` + UPDATE Premium |
| `server/routers.ts` | Limite de barbearias em `barbershops.create`; queries globais em `barbers.create` |
| `server/middleware/checkSaasSubscription.ts` | Lookup via owner; UPDATE usa `WHERE id=` |
| `server/mpSaasRoutes.ts` | SELECT inclui `max_barbershops`; ORDER BY corrigido |

---

## Verificação

1. Owner Starter/Profissional com 2 barbearias → tenta criar 3ª → erro: *"Seu plano permite até 2 barbearias"*
2. Owner Premium → cria 3ª barbearia → sucesso; subscription da barbearia principal cobre a nova
3. Owner com 4 barbeiros na barbearia A e 1 na B (limite 5) → tenta adicionar 1 em A → erro global
4. Owner Premium (`max_barbers = -1`) → adiciona barbeiros sem restrição
5. Owner sem subscription → pode criar barbeiros (comportamento legado preservado)
6. Owner em barbearia secundária → `/api/saas/subscription` retorna plano ativo corretamente
7. Trial expirado detectado em barbearia secundária → UPDATE aplica no `id` da subscription correta
