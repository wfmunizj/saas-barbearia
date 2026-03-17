# Design — Portal do Cliente: Tema Claro "Creme Acolhedor"

**Data:** 2026-03-17
**Status:** Draft

---

## Contexto

O portal do cliente (todas as telas sob `/b/:slug/*`) usa atualmente um tema 100% escuro (fundo `#0a0a0a`, glassmorphism semi-transparente, texto branco). O owner considerou o visual muito escuro e quer migrar para um tema claro com cores mais quentes e acolhedoras.

**Objetivo:** Substituir o tema escuro do portal por um tema "Creme Acolhedor" — fundo creme `#FBF8F3`, cards brancos, bordas bege, texto marrom escuro, mantendo a cor primária dinâmica da barbearia como destaque.

---

## Paleta de Cores

| Token | Cor | Uso |
|-------|-----|-----|
| `--portal-bg` | `#FBF8F3` | Fundo principal de todas as telas |
| `--portal-card` | `#FFFFFF` | Fundo de cards, inputs, listas |
| `--portal-card-hover` | `#F5F0E8` | Hover em cards, fundo de header |
| `--portal-border` | `#E8DFD0` | Bordas de cards, inputs, separadores |
| `--portal-text` | `#2D2418` | Texto principal (títulos, labels) |
| `--portal-text-secondary` | `#8B7355` | Texto secundário (descrições, placeholders) |
| `--portal-text-muted` | `#B8A88A` | Texto muito sutil (timestamps, hints) |
| `--portal-accent` | dinâmico | Cor primária da barbearia (default `#C9A84C`) |
| `--portal-accent-bg` | `{accent}15` | Fundo sutil com cor primária (8% opacity) |
| `--portal-accent-border` | `{accent}40` | Borda com cor primária (25% opacity) |
| `--portal-accent-shadow` | `{accent}25` | Sombra/glow com cor primária (15% opacity) |

### Sombras

- Cards: `0 1px 3px rgba(0,0,0,0.04)` (sutil)
- Cards hover/selecionados: `0 2px 8px {accent}12` (glow suave da cor primária)
- Botões primários: `0 4px 12px {accent}25` (glow mais forte)
- Header: nenhuma sombra, usa `border-bottom` em `--portal-border`

### Tipografia

- **Títulos/headings:** `'Bodoni Moda', serif` (mantém o estilo atual)
- **Body/UI:** `'Jost', sans-serif` (mantém o estilo atual)
- Cores de texto invertidas: escuro sobre claro em vez de claro sobre escuro

---

## Telas Afetadas

### 1. BarbershopPage.tsx (`/b/:slug`)

- **Fundo:** `#FBF8F3` (era `#0a0a0a`)
- **Header:** fundo `#FFFFFF` com `border-bottom: 1px solid #E8DFD0` (era glassmorphism escuro)
- **Hero:** gradiente `linear-gradient(135deg, #FAFAFA, #F5F0E8)` com borda `#E8DFD0`
- **Cards de planos:** fundo branco, borda `#E8DFD0`, plano destaque com `border: 2px solid {primaryColor}` e badge "POPULAR"
- **Avatares de barbeiros:** fundo `linear-gradient(135deg, #E8DFD0, #D4C8B0)`, borda dourada no selecionado
- **Lista de serviços:** cards brancos, `border: 1px solid #E8DFD0`, preço em `{primaryColor}`
- **Textos:** títulos em `#2D2418`, descrições em `#8B7355`

### 2. ClientAuthPages.tsx (`/b/:slug/login` e `/b/:slug/cadastro`)

- **Layout split mantido:** painel esquerdo + formulário direito
- **Painel esquerdo (branding):** gradiente escuro marrom `linear-gradient(160deg, #2D2418, #4A3728)` com texto creme — mantém contraste elegante
- **Painel direito (formulário):** fundo `#FBF8F3`
- **Inputs:** fundo `#FFFFFF`, `border: 1px solid #E8DFD0`, `border-radius: 10px`, placeholder em `#8B7355`
- **Input focus:** `border-color: {primaryColor}`, `box-shadow: 0 0 0 3px {primaryColor}15`
- **Botão principal:** `background: {primaryColor}`, `color: #FFF`, `box-shadow: 0 4px 12px {primaryColor}25`
- **PortalWrapper:** remover glow orbs (radial gradients escuros), substituir por fundo creme limpo
- **Mobile:** painel esquerdo desaparece, só formulário sobre creme

### 3. BookingPage.tsx (`/b/:slug/agendar`)

- **Fundo:** `#FBF8F3`
- **Header sticky:** fundo `#FFFFFF`, `border-bottom: 1px solid #E8DFD0`
- **Barra de progresso (stepper):** passos concluídos em `{primaryColor}`, pendentes em `#E8DFD0`
- **Cards de seleção (barbeiro, serviço, horário):**
  - Normal: fundo branco, `border: 1px solid #E8DFD0`
  - Selecionado: `border: 2px solid {primaryColor}`, `box-shadow: 0 2px 8px {primaryColor}12`
  - Radio/check: círculo com `{primaryColor}` preenchido quando selecionado
- **Resumo:** fundo `#F5F0E8`, texto em `#8B7355` com valores em `{primaryColor}`
- **Calendário (seleção de data):** manter layout atual, trocar cores escuras por paleta creme
- **Botão "Próximo":** `{primaryColor}` com sombra dourada

### 4. ClientAccountPage.tsx (`/b/:slug/minha-conta`)

- **Nota:** Esta tela já usa `bg-background` em alguns lugares. A migração foca em substituir inline styles escuros restantes e garantir uso consistente dos tokens `--portal-*`.
- **Fundo:** `#FBF8F3`
- **Header:** fundo `#FFFFFF`, `border-bottom`
- **Avatar:** fundo `linear-gradient(135deg, {primaryColor}, darken)`, letra branca
- **Card de assinatura:** fundo branco, `border: 1.5px solid {primaryColor}`, badge "Ativo" em verde `#E8F5E9`/`#2E7D32`
- **Cards de agendamentos:** fundo branco, `border: 1px solid #E8DFD0`, data em `{primaryColor}`
- **Grid de ações:** cards brancos com `border: 1px solid #E8DFD0`, ícones + label
- **Botão "Sair":** texto `{primaryColor}`, sem fundo

### 5. SubscribePage.tsx (`/b/:slug/assinar/:planId`)

- Mesma paleta: fundo creme, card branco com detalhes do plano, botão dourado
- Lista de benefícios com bullets dourados
- **Nota:** Esta tela já usa `bg-background` (Tailwind theme-aware) e header com `primaryColor`. A migração consiste em garantir consistência com os tokens `--portal-*` em vez de cores hardcoded.

### 6. VerifyEmailPage.tsx (`/b/:slug/verificar-email`)

- **Fundo:** `#FBF8F3` (era `#0a0a0a`)
- **Card central:** fundo `#FFFFFF`, `border: 1px solid #E8DFD0` (era glassmorphism `rgba(255,255,255,0.04)`)
- **Textos:** título em `#2D2418`, descrição em `#8B7355`
- **Botão reenviar:** `{primaryColor}` com sombra suave
- **Status de sucesso/erro:** manter cores semânticas (verde/vermelho)

---

## Mudanças Técnicas

### Substituição de padrões

| De (escuro) | Para (creme) |
|---|---|
| `backgroundColor: "#0a0a0a"` | `backgroundColor: "#FBF8F3"` |
| `rgba(255,255,255,0.04)` (glass card) | `#FFFFFF` com `border: 1px solid #E8DFD0` |
| `rgba(255,255,255,0.06-0.12)` (bordas) | `#E8DFD0` |
| `rgba(255,255,255,0.8)` (texto) | `#2D2418` |
| `rgba(255,255,255,0.4)` (texto sec.) | `#8B7355` |
| `backdropFilter: "blur(20px)"` | Remover (desnecessário em fundo claro) |
| `${primaryColor}0d-28` (glow escuro) | `${primaryColor}12-25` (sombra suave) |
| `radial-gradient(...)` orbs | Remover |
| Skeleton `rgba(255,255,255,0.05)` | `#F0EBE3` |

### CSS Classes: `portal-dark-input` / `portal-dark-textarea` (index.css)

Renomear para `portal-input` / `portal-textarea` e atualizar estilos:

| Propriedade | De (escuro) | Para (creme) |
|---|---|---|
| `caret-color` | `white` | `#2D2418` |
| `placeholder color` | `rgba(255,255,255,0.22)` | `#8B7355` |
| `autofill background` | escuro | `#FFFFFF` |
| `autofill text` | branco | `#2D2418` |
| `autofill border` | `rgba(255,255,255,...)` | `#E8DFD0` |

Atualizar referências em `ClientAuthPages.tsx` e `BookingPage.tsx`.

### CSS Variables (index.css)

Adicionar variáveis CSS para o portal no `:root` (não no `.dark`). Renomear comentário `/* Portal Dark Theme */` para `/* Portal Creme Theme */`:
```css
:root {
  --portal-bg: #FBF8F3;
  --portal-card: #FFFFFF;
  --portal-card-hover: #F5F0E8;
  --portal-border: #E8DFD0;
  --portal-text: #2D2418;
  --portal-text-secondary: #8B7355;
  --portal-text-muted: #B8A88A;
}
```

Tokens dinâmicos (`--portal-accent`, `--portal-accent-bg`, `--portal-accent-border`, `--portal-accent-shadow`) são aplicados via inline styles pois dependem da cor primária da barbearia.

### Animações

- `portal-slide-up`, `portal-fade-in`, `portal-step-in` — manter keyframes, só mudar cores de referência se houver
- Remover animações de glow orbs (background radial gradients)

---

## Escopo

### Incluso
- Migrar as 6 telas do portal para tema creme acolhedor (incluindo VerifyEmailPage)
- Manter cor primária dinâmica da barbearia como destaque
- Manter fontes Bodoni Moda + Jost
- Manter layout/estrutura dos componentes (só trocar cores)
- Manter todas as funcionalidades existentes

### Excluído
- Dashboard do admin (continua com tema light padrão)
- Mudanças de layout ou funcionalidade
- Novos componentes

---

## Verificação

1. Abrir `/b/:slug` — fundo creme, header branco, cards brancos, textos legíveis
2. Abrir `/b/:slug/login` e `/cadastro` — painel esquerdo marrom escuro, formulário creme
3. Abrir `/b/:slug/agendar` — wizard com stepper dourado, cards selecionáveis com borda dourada
4. Abrir `/b/:slug/minha-conta` — perfil, assinatura, agendamentos em cards brancos
5. Abrir `/b/:slug/assinar/:planId` — detalhes do plano em fundo creme
6. Abrir `/b/:slug/verificar-email` — card branco sobre fundo creme, botão funcional
7. Testar com diferentes cores primárias (não só ouro) — verificar que contraste funciona
8. Testar responsivo mobile — formulários e cards adaptam corretamente
9. Verificar que dashboard admin NÃO foi afetado
10. Verificar que classes `portal-input`/`portal-textarea` renderizam corretamente (placeholder, caret, autofill)
