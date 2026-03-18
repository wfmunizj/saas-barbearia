import { Router } from "express";
import PDFDocument from "pdfkit";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { getUserById, getDb } from "./db";
import {
  barbers, appointments, clients, services,
  appointmentServices, barberCommissionRecords,
  commissionPayments, barberFichaRecords, barbershops,
} from "../drizzle/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

export const pdfExportRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function parseCookies(header: string) {
  return Object.fromEntries(
    header.split(";").map(c => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=")];
    })
  );
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Concluído",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  pending: "Pendente",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  transfer: "Transferência",
  other: "Outro",
};

// ── Auth middleware ──────────────────────────────────────────────────────────
async function authenticateUser(req: any): Promise<{ userId: number; barbershopId: number } | null> {
  try {
    const cookies = parseCookies(req.headers.cookie ?? "");
    const token = cookies[COOKIE_NAME];
    if (!token) return null;

    const session = await sdk.verifySession(token);
    if (!session?.openId) return null;

    const userId = parseInt(session.openId);
    if (isNaN(userId)) return null;

    const user = await getUserById(userId);
    if (!user?.barbershopId) return null;

    return { userId, barbershopId: user.barbershopId };
  } catch {
    return null;
  }
}

// ── PDF Generation Route ─────────────────────────────────────────────────────
pdfExportRouter.get("/barber-pdf", async (req, res) => {
  try {
    const auth = await authenticateUser(req);
    if (!auth) return res.status(401).json({ error: "Não autenticado" });

    const barberId = parseInt(req.query.barberId as string);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!barberId || !startDate || !endDate) {
      return res.status(400).json({ error: "Parâmetros inválidos (barberId, startDate, endDate)" });
    }

    const dbInstance = await getDb();
    if (!dbInstance) return res.status(500).json({ error: "DB indisponível" });

    // ── Fetch barbershop name ──
    const [shop] = await dbInstance.select({ name: barbershops.name })
      .from(barbershops)
      .where(eq(barbershops.id, auth.barbershopId))
      .limit(1);

    // ── Fetch barber ──
    const [barber] = await dbInstance.select().from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.barbershopId, auth.barbershopId)))
      .limit(1);

    if (!barber) return res.status(404).json({ error: "Barbeiro não encontrado" });

    const start = new Date(startDate + "T00:00:00-03:00");
    const end = new Date(endDate + "T23:59:59-03:00");

    // ── Fetch appointments ──
    const appts = await dbInstance.select({
      id: appointments.id,
      status: appointments.status,
      appointmentDate: appointments.appointmentDate,
      primaryBarberId: appointments.primaryBarberId,
      clientName: sql<string>`MAX(${clients.name})`,
      serviceName: sql<string>`string_agg(${services.name}, ', ' ORDER BY ${services.name})`,
      servicePrice: sql<number>`COALESCE(SUM(${appointmentServices.priceInCents}), MAX(${services.priceInCents}), 0)`,
    })
      .from(appointments)
      .leftJoin(clients, eq(clients.id, appointments.clientId))
      .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
      .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
      .where(and(
        eq(appointments.barberId, barberId),
        eq(appointments.barbershopId, auth.barbershopId),
        gte(appointments.appointmentDate, start),
        lte(appointments.appointmentDate, end),
      ))
      .groupBy(appointments.id, appointments.status, appointments.appointmentDate, appointments.primaryBarberId)
      .orderBy(desc(appointments.appointmentDate));

    // ── Calculate metrics ──
    const completedAppts = appts.filter(a => a.status === "completed");
    const cancelledAppts = appts.filter(a => a.status === "cancelled");
    const totalRevenue = completedAppts.reduce((s, a) => s + Number(a.servicePrice ?? 0), 0);
    const commissionPercent = parseFloat(barber.commissionPercent ?? "0");
    const commissionAmount = Math.floor(totalRevenue * commissionPercent / 100);

    // ── Fetch balance ──
    const commissionEarned = await dbInstance
      .select({ total: sql<number>`COALESCE(SUM(${barberCommissionRecords.commissionAmountInCents}), 0)` })
      .from(barberCommissionRecords)
      .where(and(eq(barberCommissionRecords.barberId, barberId), eq(barberCommissionRecords.barbershopId, auth.barbershopId)));

    const fichaEarned = await dbInstance
      .select({ total: sql<number>`COALESCE(SUM(${barberFichaRecords.totalValueInCents}), 0)` })
      .from(barberFichaRecords)
      .where(and(eq(barberFichaRecords.barberId, barberId), eq(barberFichaRecords.barbershopId, auth.barbershopId)));

    const paid = await dbInstance
      .select({ total: sql<number>`COALESCE(SUM(${commissionPayments.amountInCents}), 0)` })
      .from(commissionPayments)
      .where(and(eq(commissionPayments.barberId, barberId), eq(commissionPayments.barbershopId, auth.barbershopId)));

    const totalCommission = Number(commissionEarned[0]?.total ?? 0);
    const totalFichas = Number(fichaEarned[0]?.total ?? 0);
    const totalEarned = totalCommission + totalFichas;
    const totalPaid = Number(paid[0]?.total ?? 0);
    const balance = Math.max(0, totalEarned - totalPaid);

    // ── Fetch fichas in period ──
    const fichaConditions = [
      eq(barberFichaRecords.barberId, barberId),
      eq(barberFichaRecords.barbershopId, auth.barbershopId),
      gte(barberFichaRecords.createdAt, start),
      lte(barberFichaRecords.createdAt, end),
    ];

    const fichaRecords = await dbInstance.select({
      id: barberFichaRecords.id,
      fichasCount: barberFichaRecords.fichasCount,
      fichaValueInCents: barberFichaRecords.fichaValueInCents,
      totalValueInCents: barberFichaRecords.totalValueInCents,
      createdAt: barberFichaRecords.createdAt,
      serviceName: sql<string>`string_agg(${services.name}, ', ' ORDER BY ${services.name})`,
    })
      .from(barberFichaRecords)
      .innerJoin(appointments, eq(barberFichaRecords.appointmentId, appointments.id))
      .leftJoin(appointmentServices, eq(appointmentServices.appointmentId, appointments.id))
      .leftJoin(services, sql`${services.id} = COALESCE(${appointmentServices.serviceId}, ${appointments.serviceId})`)
      .where(and(...fichaConditions))
      .groupBy(barberFichaRecords.id)
      .orderBy(sql`${barberFichaRecords.createdAt} DESC`);

    const totalFichasCount = fichaRecords.reduce((s, r) => s + (r.fichasCount ?? 0), 0);
    const totalFichasValue = fichaRecords.reduce((s, r) => s + (r.totalValueInCents ?? 0), 0);

    // ── Fetch payment history ──
    const paymentHistory = await dbInstance.select()
      .from(commissionPayments)
      .where(and(eq(commissionPayments.barberId, barberId), eq(commissionPayments.barbershopId, auth.barbershopId)))
      .orderBy(sql`${commissionPayments.paidAt} DESC`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ██ PDF GENERATION ██
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });

    const fileName = `relatorio-${barber.name.replace(/\s+/g, "-").toLowerCase()}-${startDate}-a-${endDate}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    doc.pipe(res);

    // Colors
    const PRIMARY = "#1a1a1a";
    const ACCENT = "#8B6914";
    const MUTED = "#666666";
    const LIGHT_BG = "#F5F0E8";
    const BORDER = "#D4C5A9";

    const pageW = doc.page.width - 80; // margin*2

    // ── Header ──
    doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);
    doc.fillColor("#FFFFFF").fontSize(20).font("Helvetica-Bold")
      .text(shop?.name ?? "Barbearia", 40, 25, { width: pageW });
    doc.fontSize(11).font("Helvetica")
      .text(`Relatório de Desempenho — ${barber.name}`, 40, 52);
    doc.fontSize(9).fillColor("#CCCCCC")
      .text(`Período: ${formatDateBR(start)} a ${formatDateBR(end)}  |  Gerado em: ${formatDateBR(new Date())}`, 40, 68);

    doc.fillColor(PRIMARY);
    let y = 110;

    // ── Metrics Cards ──
    const cardW = (pageW - 12) / 4;
    const metrics = [
      { label: "Total de Cortes", value: String(appts.length), sub: `${completedAppts.length} concl. / ${cancelledAppts.length} canc.` },
      { label: "Receita Gerada", value: fmt(totalRevenue), sub: "Serviços concluídos" },
      { label: `Comissão (${commissionPercent}%)`, value: fmt(commissionAmount), sub: "No período" },
      { label: "Saldo Pendente", value: fmt(balance), sub: balance > 0 ? "Aguardando pagamento" : "Em dia" },
    ];

    metrics.forEach((m, i) => {
      const x = 40 + i * (cardW + 4);
      doc.save();
      doc.roundedRect(x, y, cardW, 60, 4).fill(LIGHT_BG);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(m.label, x + 8, y + 8, { width: cardW - 16 });
      doc.fillColor(PRIMARY).fontSize(14).font("Helvetica-Bold").text(m.value, x + 8, y + 22, { width: cardW - 16 });
      doc.fillColor(MUTED).fontSize(6.5).font("Helvetica").text(m.sub, x + 8, y + 42, { width: cardW - 16 });
      doc.restore();
    });

    y += 75;

    // ── Saldo Acumulado ──
    y = drawSectionTitle(doc, "Saldo Acumulado", y, pageW, ACCENT);
    const balCols = [
      { label: "Total gerado", value: fmt(totalEarned) },
      { label: "Total pago", value: fmt(totalPaid) },
      { label: "Saldo devedor", value: fmt(balance) },
    ];
    if (totalCommission > 0) balCols.push({ label: "Comissões", value: fmt(totalCommission) });
    if (totalFichas > 0) balCols.push({ label: "Fichas", value: fmt(totalFichas) });

    const bw = (pageW - (balCols.length - 1) * 4) / balCols.length;
    balCols.forEach((c, i) => {
      const x = 40 + i * (bw + 4);
      doc.roundedRect(x, y, bw, 38, 3).fill(LIGHT_BG);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(c.label, x + 6, y + 6, { width: bw - 12 });
      doc.fillColor(PRIMARY).fontSize(11).font("Helvetica-Bold").text(c.value, x + 6, y + 19, { width: bw - 12 });
    });
    y += 50;

    // ── Agendamentos no Período ──
    y = drawSectionTitle(doc, `Agendamentos no Período (${appts.length})`, y, pageW, ACCENT);

    if (appts.length > 0) {
      // Table header
      y = drawTableHeader(doc, y, pageW, ACCENT);

      appts.forEach((appt) => {
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 40;
          y = drawTableHeader(doc, y, pageW, ACCENT);
        }

        const isCross = !!(appt.primaryBarberId && appt.primaryBarberId !== barberId);
        const dateStr = new Date(appt.appointmentDate).toLocaleDateString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "2-digit",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });

        doc.fillColor(PRIMARY).fontSize(7.5).font("Helvetica");
        doc.text(dateStr, 40, y + 4, { width: 80 });
        doc.text(appt.clientName ?? "—", 125, y + 4, { width: 110 });
        doc.text((appt.serviceName ?? "—") + (isCross ? " *" : ""), 240, y + 4, { width: 130 });
        doc.text(fmt(Number(appt.servicePrice ?? 0)), 375, y + 4, { width: 70, align: "right" });
        doc.text(STATUS_LABELS[appt.status] ?? appt.status, 450, y + 4, { width: 70, align: "right" });

        y += 18;
        doc.strokeColor(BORDER).lineWidth(0.3).moveTo(40, y).lineTo(40 + pageW, y).stroke();
      });

      if (appts.some(a => a.primaryBarberId && a.primaryBarberId !== barberId)) {
        y += 6;
        doc.fillColor(MUTED).fontSize(6.5).font("Helvetica-Oblique")
          .text("* Atendimento de mensalista de outro barbeiro", 40, y);
        y += 12;
      }
    } else {
      doc.fillColor(MUTED).fontSize(9).text("Nenhum agendamento no período.", 40, y);
      y += 20;
    }

    y += 10;

    // ── Fichas (Plano Ilimitado) ──
    if (y > doc.page.height - 120) { doc.addPage(); y = 40; }
    y = drawSectionTitle(doc, `Rendimento por Fichas — Plano Ilimitado`, y, pageW, ACCENT);

    if (fichaRecords.length > 0) {
      const fichaMetrics = [
        { label: "Total de fichas", value: String(totalFichasCount) },
        { label: "Valor total", value: fmt(totalFichasValue) },
      ];
      const fw = (pageW - 4) / 2;
      fichaMetrics.forEach((m, i) => {
        const x = 40 + i * (fw + 4);
        doc.roundedRect(x, y, fw, 32, 3).fill(LIGHT_BG);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(m.label, x + 6, y + 5, { width: fw - 12 });
        doc.fillColor(ACCENT).fontSize(12).font("Helvetica-Bold").text(m.value, x + 6, y + 16, { width: fw - 12 });
      });
      y += 42;

      fichaRecords.forEach(r => {
        if (y > doc.page.height - 50) { doc.addPage(); y = 40; }
        const dateStr = new Date(r.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
        doc.fillColor(PRIMARY).fontSize(7.5).font("Helvetica")
          .text(`${dateStr}  —  ${r.serviceName ?? "Serviço"}  —  ${r.fichasCount} ficha${(r.fichasCount ?? 0) !== 1 ? "s" : ""}`, 40, y + 3, { width: pageW - 80 });
        doc.fillColor(ACCENT).font("Helvetica-Bold")
          .text(fmt(r.totalValueInCents ?? 0), 40 + pageW - 80, y + 3, { width: 80, align: "right" });
        y += 16;
        doc.strokeColor(BORDER).lineWidth(0.3).moveTo(40, y).lineTo(40 + pageW, y).stroke();
      });
    } else {
      doc.fillColor(MUTED).fontSize(9).text("Nenhuma ficha gerada no período.", 40, y);
      y += 20;
    }

    y += 15;

    // ── Histórico de Pagamentos ──
    if (paymentHistory.length > 0) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
      y = drawSectionTitle(doc, `Histórico de Pagamentos (${paymentHistory.length})`, y, pageW, ACCENT);

      paymentHistory.forEach(p => {
        if (y > doc.page.height - 50) { doc.addPage(); y = 40; }
        const dateStr = new Date(p.paidAt!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
        doc.fillColor(PRIMARY).fontSize(7.5).font("Helvetica")
          .text(`${dateStr}  —  ${METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}${p.notes ? `  ·  ${p.notes}` : ""}`, 40, y + 3, { width: pageW - 80 });
        doc.fillColor("#16a34a").font("Helvetica-Bold")
          .text(fmt(p.amountInCents), 40 + pageW - 80, y + 3, { width: 80, align: "right" });
        y += 16;
        doc.strokeColor(BORDER).lineWidth(0.3).moveTo(40, y).lineTo(40 + pageW, y).stroke();
      });
    }

    y += 20;

    // ── Dados do Barbeiro ──
    if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
    y = drawSectionTitle(doc, "Dados do Barbeiro", y, pageW, ACCENT);
    doc.roundedRect(40, y, pageW, 50, 4).fill(LIGHT_BG);
    doc.fillColor(PRIMARY).fontSize(9).font("Helvetica-Bold").text(barber.name, 50, y + 8);
    const infoLines: string[] = [];
    if (barber.phone) infoLines.push(`Tel: ${barber.phone}`);
    if (barber.email) infoLines.push(`Email: ${barber.email}`);
    if (barber.specialties) infoLines.push(`Especialidades: ${barber.specialties}`);
    infoLines.push(`Comissão: ${commissionPercent}%${(barber.bonusAmountInCents ?? 0) > 0 ? ` | Bônus: ${fmt(barber.bonusAmountInCents!)}` : ""}`);
    doc.fillColor(MUTED).fontSize(7.5).font("Helvetica").text(infoLines.join("  |  "), 50, y + 22, { width: pageW - 20 });

    // ── Footer ──
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica")
        .text(
          `${shop?.name ?? "Barbearia"} — Relatório gerado automaticamente  |  Página ${i + 1} de ${pages.count}`,
          40, doc.page.height - 30,
          { width: pageW, align: "center" }
        );
    }

    doc.end();
  } catch (err: any) {
    console.error("[PDF Export] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro ao gerar PDF", details: err.message });
    }
  }
});

// ── Drawing helpers ──────────────────────────────────────────────────────────
function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number, pageW: number, color: string): number {
  doc.fillColor(color).fontSize(11).font("Helvetica-Bold").text(title, 40, y);
  y += 16;
  doc.strokeColor(color).lineWidth(1).moveTo(40, y).lineTo(40 + pageW, y).stroke();
  y += 8;
  return y;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, pageW: number, color: string): number {
  doc.rect(40, y, pageW, 16).fill(color);
  doc.fillColor("#FFFFFF").fontSize(7).font("Helvetica-Bold");
  doc.text("Data/Hora", 44, y + 4, { width: 80 });
  doc.text("Cliente", 125, y + 4, { width: 110 });
  doc.text("Serviço", 240, y + 4, { width: 130 });
  doc.text("Valor", 375, y + 4, { width: 70, align: "right" });
  doc.text("Status", 450, y + 4, { width: 70, align: "right" });
  return y + 20;
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}
