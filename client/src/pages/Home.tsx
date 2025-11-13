import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Calendar, DollarSign, Users, Scissors } from "lucide-react";

export default function Home() {
  const { data: clients, isLoading: loadingClients } = trpc.clients.list.useQuery();
  const { data: barbers, isLoading: loadingBarbers } = trpc.barbers.list.useQuery();
  const { data: appointments, isLoading: loadingAppointments } = trpc.appointments.list.useQuery();
  const { data: payments, isLoading: loadingPayments } = trpc.payments.list.useQuery();

  const totalClients = clients?.length || 0;
  const totalBarbers = barbers?.length || 0;
  const totalAppointments = appointments?.length || 0;
  
  const totalRevenue = payments?.reduce((sum, payment) => {
    if (payment.status === 'completed') {
      return sum + (payment.amountInCents / 100);
    }
    return sum;
  }, 0) || 0;

  const stats = [
    {
      title: "Total de Clientes",
      value: totalClients,
      icon: Users,
      loading: loadingClients,
    },
    {
      title: "Barbeiros Ativos",
      value: totalBarbers,
      icon: Scissors,
      loading: loadingBarbers,
    },
    {
      title: "Agendamentos",
      value: totalAppointments,
      icon: Calendar,
      loading: loadingAppointments,
    },
    {
      title: "Receita Total",
      value: `R$ ${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      loading: loadingPayments,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Visão geral do seu negócio
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {stat.loading ? (
                    <div className="h-7 w-20 animate-pulse bg-muted rounded" />
                  ) : (
                    <div className="text-2xl font-bold">{stat.value}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Próximos Agendamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAppointments ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse bg-muted rounded" />
                  ))}
                </div>
              ) : appointments && appointments.length > 0 ? (
                <div className="space-y-3">
                  {appointments.slice(0, 5).map((appointment) => (
                    <div
                      key={appointment.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">Cliente #{appointment.clientId}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(appointment.appointmentDate).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        appointment.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        appointment.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {appointment.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum agendamento encontrado
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atividade Recente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Últimas atividades do sistema aparecerão aqui
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
