/**
 * server/whatsapp.ts
 * Integração com Evolution API para envio de mensagens WhatsApp
 * Docs: https://doc.evolution-api.com
 */

import axios from "axios";
import { getDb } from "./db";
import { barbershops, whatsappMessages, clients } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvolutionSendTextPayload {
  number: string;
  text: string;
}

interface EvolutionResponse {
  key: {
    remoteJid: string;
    id: string;
  };
  message: {
    conversation: string;
  };
  messageTimestamp: number;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhoneNumber(phone: string): string {
  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, "");
  // Garante que começa com código do país (Brasil = 55)
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

// ─── Evolution API Client ─────────────────────────────────────────────────────

export class EvolutionApiClient {
  private apiUrl: string;
  private apiKey: string;
  private instanceName: string;

  constructor(apiUrl: string, apiKey: string, instanceName: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.instanceName = instanceName;
  }

  private get headers() {
    return {
      "Content-Type": "application/json",
      apikey: this.apiKey,
    };
  }

  async sendText(to: string, message: string): Promise<EvolutionResponse> {
    const phone = formatPhoneNumber(to);
    const payload: EvolutionSendTextPayload = {
      number: phone,
      text: message,
    };

    const response = await axios.post<EvolutionResponse>(
      `${this.apiUrl}/message/sendText/${this.instanceName}`,
      payload,
      { headers: this.headers }
    );

    return response.data;
  }

  async getInstanceStatus() {
    const response = await axios.get(
      `${this.apiUrl}/instance/fetchInstances`,
      { headers: this.headers }
    );
    return response.data;
  }

  async connectInstance() {
    const response = await axios.get(
      `${this.apiUrl}/instance/connect/${this.instanceName}`,
      { headers: this.headers }
    );
    return response.data;
  }

  async getQrCode() {
    const response = await axios.get(
      `${this.apiUrl}/instance/connect/${this.instanceName}`,
      { headers: this.headers }
    );
    return response.data;
  }
}

// ─── Serviço de envio ─────────────────────────────────────────────────────────

export async function getBarbershopWhatsappClient(barbershopId: number): Promise<EvolutionApiClient | null> {
  const db = await getDb();
  if (!db) return null;

  const [barbershop] = await db
    .select()
    .from(barbershops)
    .where(eq(barbershops.id, barbershopId))
    .limit(1);

  if (!barbershop?.whatsappApiUrl || !barbershop?.whatsappApiKey || !barbershop?.whatsappInstanceName) {
    return null;
  }

  return new EvolutionApiClient(
    barbershop.whatsappApiUrl,
    barbershop.whatsappApiKey,
    barbershop.whatsappInstanceName
  );
}

/**
 * Envia uma mensagem WhatsApp para um cliente e registra no banco
 */
export async function sendWhatsappMessage(
  barbershopId: number,
  clientId: number,
  message: string,
  campaignId?: number
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Banco de dados indisponível" };

  // Busca cliente
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { success: false, error: "Cliente não encontrado" };

  // Registra mensagem como pending
  const [savedMessage] = await db.insert(whatsappMessages).values({
    barbershopId,
    clientId,
    campaignId,
    message,
    status: "pending",
  }).returning();

  // Tenta enviar via Evolution API
  const client_ = await getBarbershopWhatsappClient(barbershopId);

  if (!client_) {
    // Sem integração configurada - salva como falha mas não quebra
    await db
      .update(whatsappMessages)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(whatsappMessages.id, savedMessage.id));
    return { success: false, messageId: savedMessage.id, error: "WhatsApp não configurado para esta barbearia" };
  }

  try {
    const result = await client_.sendText(client.phone, message);

    await db.update(whatsappMessages).set({
      status: "sent",
      evolutionMessageId: result.key?.id,
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(whatsappMessages.id, savedMessage.id));

    return { success: true, messageId: savedMessage.id };
  } catch (error: any) {
    console.error("[WhatsApp] Send error:", error?.response?.data ?? error.message);

    await db.update(whatsappMessages).set({
      status: "failed",
      updatedAt: new Date(),
    }).where(eq(whatsappMessages.id, savedMessage.id));

    return {
      success: false,
      messageId: savedMessage.id,
      error: error?.response?.data?.message ?? error.message ?? "Erro ao enviar mensagem",
    };
  }
}

/**
 * Envia mensagem em massa para múltiplos clientes (ex: campanha)
 */
export async function sendBulkWhatsappMessages(
  barbershopId: number,
  clientIds: number[],
  message: string,
  campaignId?: number
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = await Promise.allSettled(
    clientIds.map((clientId) =>
      sendWhatsappMessage(barbershopId, clientId, message, campaignId)
    )
  );

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success) {
      sent++;
    } else {
      failed++;
      if (result.status === "fulfilled" && result.value.error) {
        errors.push(result.value.error);
      } else if (result.status === "rejected") {
        errors.push(String(result.reason));
      }
    }
  }

  return { sent, failed, errors };
}

/**
 * Interpola variáveis em templates de mensagem
 * Variáveis disponíveis: {{nome}}, {{telefone}}, {{data}}, {{servico}}, {{barbeiro}}
 */
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}
