import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart3, TrendingUp, Users, Calendar, DollarSign } from "lucide-react";

export default function Reports() {
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: appointments } = trpc.appointments.list.useQuery();
  const { data: payments } = trpc.payments.list.useQuery();
  const { data: services } = trpc.services.list.useQuery();

  // Calcular métricas
  const totalClients = clients?.length || 0;
  const activeClients = clients?.filter(c => c.isActive).length || 0;
  
  const totalAppointments = appointments?.length || 0;
  const completedAppointments = appointments?.filter(a => a.status === 'completed').length || 0;
  const cancelledAppointments = appointments?.filter(a => a.status === 'cancelled').length || 0;
  
  const totalRevenue = payments?.reduce((sum, p) => {
    if (p.status === 'completed') return sum + p.amountInCents;
    return sum;
  }, 0) || 0;

  const averageTicket = completedAppointments > 0 
    ? totalRevenue / completedAppointments 
    : 0;

  // Serviços mais solicitados
  const serviceStats = appointments?.reduce((acc, appointment) => {
    const serviceId = appointment.serviceId;
    if (!acc[serviceId]) {
      acc[serviceId] = 0;
    }
    acc[serviceId]++;
    return acc;
  }, {} as Record<number, number>);

  const topServices = services
    ?.map(service => ({
      ...service,
      count: serviceStats?.[service.id] || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Agendamentos por mês
  const appointmentsByMonth = appointments?.reduce((acc, appointment) => {
    const month = new Date(appointment.appointmentDate).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
    });
    if (!acc[month]) {
      acc[month] = 0;
    }
    acc[month]++;
    return acc;
  }, {} as Record<string, number>);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground mt-2">
            Análises e métricas do negócio
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Clientes
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClients}</div>
              <p className="text-xs text-muted-foreground">
                {activeClients} ativos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Agendamentos
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAppointments}</div>
              <p className="text-xs text-muted-foreground">
                {completedAppointments} concluídos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Total
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R$ {(totalRevenue / 100).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Ticket médio: R$ {(averageTicket / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Taxa de Cancelamento
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalAppointments > 0 
                  ? ((cancelledAppointments / totalAppointments) * 100).toFixed(1)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {cancelledAppointments} cancelados
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Serviços Mais Solicitados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topServices && topServices.length > 0 ? (
                <div className="space-y-4">
                  {topServices.map((service, index) => (
                    <div key={service.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-muted-foreground">
                            #{index + 1}
                          </span>
                          <span className="font-medium">{service.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {service.count} vezes
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2"
                          style={{
                            width: `${(service.count / (topServices[0]?.count || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Agendamentos por Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appointmentsByMonth && Object.keys(appointmentsByMonth).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(appointmentsByMonth)
                    .slice(0, 6)
                    .map(([month, count]) => (
                      <div key={month} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{month}</span>
                          <span className="text-sm text-muted-foreground">
                            {count} agendamentos
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2"
                            style={{
                              width: `${(count / Math.max(...Object.values(appointmentsByMonth))) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumo de Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Taxa de Conclusão</p>
                <p className="text-2xl font-bold">
                  {totalAppointments > 0
                    ? ((completedAppointments / totalAppointments) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Clientes Ativos</p>
                <p className="text-2xl font-bold">
                  {totalClients > 0
                    ? ((activeClients / totalClients) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Receita por Cliente</p>
                <p className="text-2xl font-bold">
                  R$ {activeClients > 0
                    ? ((totalRevenue / 100) / activeClients).toFixed(2)
                    : '0.00'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
