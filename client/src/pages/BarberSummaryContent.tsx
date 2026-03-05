import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Scissors, DollarSign, Clock, Percent, Wallet, History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  transfer: "Transferência",
  other: "Outro",
};

type Props = {
  barberId: number;
  backPath: string;
  showPayControls?: boolean;
};

export default function BarberSummaryContent({ barberId, backPath, showPayControls = false }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const today = new Date();
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "pix" | "transfer" | "other">("cash");
  const [payNotes, setPayNotes] = useState("");

  const { data, isLoading, refetch } = trpc.barbers.summary.useQuery({ barberId, startDate, endDate });
  const { data: balance, refetch: refetchBalance } = trpc.commissions.getBalance.useQuery({ barberId });
  const { data: paymentHistory, refetch: refetchHistory } = trpc.commissions.getPaymentHistory.useQuery({ barberId });

  const recordPaymentMutation = trpc.commissions.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Pagamento registrado com sucesso!");
      setPayAmount("");
      setPayNotes("");
      refetchBalance();
      refetchHistory();
      refetch();
      utils.commissions.getBalance.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-xl" />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="text-center py-16 text-muted-foreground">
          <p>Barbeiro não encontrado.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(backPath)}>
            Voltar
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const balanceInCents = balance?.balanceInCents ?? 0;
  const totalEarned = balance?.totalEarnedInCents ?? 0;
  const totalPaid = balance?.totalPaidInCents ?? 0;

  function applyPercent(pct: number) {
    const value = Math.round(balanceInCents * pct) / 100;
    setPayAmount((value / 100).toFixed(2));
  }

  function handleRegisterPayment() {
    const cents = Math.round(parseFloat(payAmount.replace(",", ".")) * 100);
    if (isNaN(cents) || cents <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (cents > balanceInCents) {
      toast.error("Valor maior que o saldo pendente.");
      return;
    }
    recordPaymentMutation.mutate({
      barberId,
      amountInCents: cents,
      paymentMethod: payMethod,
      notes: payNotes || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {showPayControls ? `Resumo — ${data.barber.name}` : "Meu Resumo"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {showPayControls ? "Desempenho e comissões do barbeiro" : "Seu desempenho no período"}
            </p>
          </div>
        </div>

        {/* Filtro de período */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data início</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data fim</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Filtrar</Button>
              <Button variant="outline" size="sm" onClick={() => {
                const now = new Date();
                setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
                setEndDate(now.toISOString().split("T")[0]);
              }}>Este mês</Button>
            </div>
          </CardContent>
        </Card>

        {/* Cards de métricas do período */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Scissors className="h-4 w-4" /><span className="text-xs">Total de Cortes</span>
              </div>
              <p className="text-3xl font-bold">{data.totalAppointments}</p>
              <div className="flex gap-2 text-xs">
                <span className="text-green-600">{data.completedAppointments} concluídos</span>
                <span className="text-red-500">{data.cancelledAppointments} cancelados</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" /><span className="text-xs">Receita Gerada</span>
              </div>
              <p className="text-2xl font-bold">{fmt(data.totalRevenueInCents)}</p>
              <p className="text-xs text-muted-foreground">Serviços concluídos</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Percent className="h-4 w-4" /><span className="text-xs">Comissão no Período</span>
              </div>
              <p className="text-2xl font-bold">{fmt(data.commissionAmountInCents)}</p>
              <p className="text-xs text-muted-foreground">{data.commissionPercent}% sobre receita</p>
            </CardContent>
          </Card>

          <Card className={balanceInCents > 0 ? "border-amber-400" : "border-green-400"}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" /><span className="text-xs">Saldo Pendente</span>
              </div>
              <p className={`text-2xl font-bold ${balanceInCents > 0 ? "text-amber-600" : "text-green-600"}`}>
                {fmt(balanceInCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                {balanceInCents > 0 ? "Aguardando pagamento" : "Em dia"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bloco de pagamento (owner) */}
        {showPayControls && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Pagar Comissão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Resumo acumulado */}
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total gerado</p>
                  <p className="font-bold">{fmt(totalEarned)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total pago</p>
                  <p className="font-bold text-green-600">{fmt(totalPaid)}</p>
                </div>
                <div className={`rounded-lg p-3 ${balanceInCents > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                  <p className="text-xs text-muted-foreground">Saldo devedor</p>
                  <p className={`font-bold ${balanceInCents > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {fmt(balanceInCents)}
                  </p>
                </div>
              </div>

              {/* Atalhos de percentual */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Valor a pagar</p>
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map(pct => (
                    <Button key={pct} variant="outline" size="sm" className="flex-1"
                      onClick={() => applyPercent(pct)} disabled={balanceInCents === 0}>
                      {pct}%
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">R$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>

              {/* Método */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Método de pagamento</p>
                <div className="flex gap-2 flex-wrap">
                  {(["cash", "pix", "transfer", "other"] as const).map(m => (
                    <Button key={m} variant={payMethod === m ? "default" : "outline"} size="sm" onClick={() => setPayMethod(m)}>
                      {METHOD_LABELS[m]}
                    </Button>
                  ))}
                </div>
              </div>

              <Input
                placeholder="Observação (opcional)"
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
              />

              <Button
                className="w-full"
                onClick={handleRegisterPayment}
                disabled={recordPaymentMutation.isPending || !payAmount || balanceInCents === 0}
              >
                {recordPaymentMutation.isPending ? "Registrando..." : "Registrar Pagamento"}
              </Button>

              {balanceInCents === 0 && (
                <p className="text-center text-sm text-green-600 font-medium">
                  Nenhum saldo pendente — comissões em dia!
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Saldo para o barbeiro (leitura) */}
        {!showPayControls && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Saldo de Comissões
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total gerado</p>
                  <p className="font-bold">{fmt(totalEarned)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Total recebido</p>
                  <p className="font-bold text-green-600">{fmt(totalPaid)}</p>
                </div>
                <div className={`rounded-lg p-3 ${balanceInCents > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                  <p className="text-xs text-muted-foreground">A receber</p>
                  <p className={`font-bold ${balanceInCents > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {fmt(balanceInCents)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de pagamentos */}
        {paymentHistory && paymentHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                {showPayControls ? "Histórico de Pagamentos" : "Pagamentos Recebidos"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {paymentHistory.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.paidAt).toLocaleDateString("pt-BR", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                        {p.notes && ` · ${p.notes}`}
                      </p>
                    </div>
                    <span className="font-semibold text-green-600">{fmt(p.amountInCents)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de agendamentos do período */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agendamentos no Período</CardTitle>
          </CardHeader>
          <CardContent>
            {data.appointments.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">Nenhum agendamento no período.</p>
            ) : (
              <div className="space-y-2">
                {data.appointments.map((appt: any) => (
                  <div key={appt.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{appt.serviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(appt.appointmentDate).toLocaleDateString("pt-BR", {
                          weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{fmt(appt.servicePrice)}</span>
                      <Badge variant={
                        appt.status === "completed" ? "default" :
                        appt.status === "confirmed" ? "secondary" :
                        appt.status === "cancelled" ? "destructive" : "outline"
                      } className="text-xs">
                        {appt.status === "completed" ? "Concluído" :
                         appt.status === "confirmed" ? "Confirmado" :
                         appt.status === "cancelled" ? "Cancelado" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info do barbeiro */}
        <Card className="bg-muted/20">
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-medium">{data.barber.name}</p>
            {data.barber.phone && <p className="text-muted-foreground">📞 {data.barber.phone}</p>}
            {data.barber.email && <p className="text-muted-foreground">✉️ {data.barber.email}</p>}
            {data.barber.specialties && <p className="text-muted-foreground">✂️ {data.barber.specialties}</p>}
            <p className="text-muted-foreground">
              Comissão: {parseFloat(data.barber.commissionPercent ?? "0").toFixed(0)}%
              {(data.barber.bonusAmountInCents ?? 0) > 0 &&
                ` | Bônus: ${fmt(data.barber.bonusAmountInCents!)}`}
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
