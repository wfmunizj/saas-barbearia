import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ArrowLeft, Scissors, DollarSign, CheckCircle, Clock, Percent } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

type Props = {
  barberId: number;
  backPath: string;
  showPayControls?: boolean;
};

export default function BarberSummaryContent({ barberId, backPath, showPayControls = false }: Props) {
  const [, navigate] = useLocation();

  const today = new Date();
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);

  const { data, isLoading, refetch } = trpc.barbers.summary.useQuery({
    barberId,
    startDate,
    endDate,
  });

  const { data: commissions, refetch: refetchCommissions } = trpc.commissions.list.useQuery({
    barberId,
    paid: false,
  });

  const markPaidMutation = trpc.commissions.markAsPaid.useMutation({
    onSuccess: () => {
      toast.success("Comissão marcada como paga!");
      refetchCommissions();
      refetch();
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

  const pendingCommissions = commissions?.filter((c: any) => !c.paid && c.barberId === barberId) ?? [];
  const pendingCommissionIds = pendingCommissions.map((c: any) => c.id);

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

        {/* Cards de métricas */}
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
                <Percent className="h-4 w-4" /><span className="text-xs">Comissão</span>
              </div>
              <p className="text-2xl font-bold">{fmt(data.commissionAmountInCents)}</p>
              <p className="text-xs text-muted-foreground">{data.commissionPercent}% sobre receita</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" /><span className="text-xs">Comissão Pendente</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{fmt(data.pendingCommission)}</p>
              <p className="text-xs text-muted-foreground">Aguardando pagamento</p>
            </CardContent>
          </Card>
        </div>

        {/* Comissões pendentes */}
        {pendingCommissionIds.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Comissões Pendentes</CardTitle>
                {showPayControls && (
                  <Button size="sm" onClick={() => markPaidMutation.mutate({ ids: pendingCommissionIds })}
                    disabled={markPaidMutation.isPending}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Marcar todas como pagas
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pendingCommissions.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">Agendamento #{c.appointmentId}</p>
                      <p className="text-xs text-muted-foreground">
                        Serviço: {fmt(c.serviceAmountInCents)} × {parseFloat(c.commissionPercent).toFixed(0)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-amber-600">{fmt(c.commissionAmountInCents)}</span>
                      {showPayControls && (
                        <Button variant="outline" size="sm" onClick={() => markPaidMutation.mutate({ ids: [c.id] })}>
                          Pagar
                        </Button>
                      )}
                    </div>
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
