/**
 * Produtos e preços do Stripe
 * Centralizando a definição de produtos para facilitar manutenção
 */

export interface StripeProduct {
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
}

// Produtos padrão - podem ser sobrescritos pelos serviços cadastrados no banco
export const defaultProducts: Record<string, StripeProduct> = {
  haircut: {
    name: "Corte de Cabelo",
    description: "Corte de cabelo profissional",
    priceInCents: 5000, // R$ 50,00
    currency: "brl",
  },
  beard: {
    name: "Barba",
    description: "Aparar e modelar barba",
    priceInCents: 3000, // R$ 30,00
    currency: "brl",
  },
  combo: {
    name: "Combo Completo",
    description: "Corte + Barba",
    priceInCents: 7000, // R$ 70,00
    currency: "brl",
  },
};
