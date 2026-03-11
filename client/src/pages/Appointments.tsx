import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import AppointmentCalendar from "@/components/AppointmentCalendar";
import { Calendar, Plus, Clock, List } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type DisplayMode = "calendar" | "list";

export default function Appointments() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("calendar");

  const [formData, setFormData] = useState({
    clientId: "",
    barberId: "",
    serviceId: "",
    date: "",
    time: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: appointments, isLoading } = trpc.appointments.list.useQuery();
  const { data: clientsList } = trpc.clients.list.useQuery();
  const { data: barbers } = trpc.barbers.list.useQuery();
  const { data: services } = trpc.services.list.useQuery();

  function invalidateAppts() {
    utils.appointments.list.invalidate();
  }

  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("Agendamento criado com sucesso!");
      invalidateAppts();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao criar agendamento: " + error.message);
    },
  });

  const updateMutation = trpc.appointments.update.useMutation({
    onSuccess: () => {
      toast.success("Agendamento atualizado com sucesso!");
      invalidateAppts();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar agendamento: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({ clientId: "", barberId: "", serviceId: "", date: "", time: "", notes: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const appointmentDateTime = new Date(`${formData.date}T${formData.time}`);
    createMutation.mutate({
      clientId: parseInt(formData.clientId),
      barberId: parseInt(formData.barberId),
      serviceId: parseInt(formData.serviceId),
      appointmentDate: appointmentDateTime,
      notes: formData.notes || undefined,
    });
  };

  const handleStatusChange = (id: number, status: "pending" | "confirmed" | "completed" | "cancelled") => {
    updateMutation.mutate({ id, status });
  };

  // Pre-fill form from calendar cell click
  const handleCalendarCreateClick = (date: string, time: string, barberId?: number) => {
    setFormData(prev => ({
      ...prev,
      date,
      time,
      barberId: barberId ? String(barberId) : prev.barberId,
    }));
    setIsDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-800 border-green-200";
      case "pending":   return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "completed": return "bg-blue-100 text-blue-800 border-blue-200";
      case "cancelled": return "bg-red-100 text-red-800 border-red-200";
      default:          return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "confirmed": return "Confirmado";
      case "pending":   return "Pendente";
      case "completed": return "Concluído";
      case "cancelled": return "Cancelado";
      default:          return status;
    }
  };

  // Group by date for list view
  const groupedAppointments = appointments?.reduce((acc, appt) => {
    const date = new Date(appt.appointmentDate).toLocaleDateString("pt-BR");
    if (!acc[date]) acc[date] = [];
    acc[date].push(appt);
    return acc;
  }, {} as Record<string, typeof appointments>);

  // New appointment dialog
  const newApptDialog = (
    <Dialog open={isDialogOpen} onOpenChange={(open) => {
      setIsDialogOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Agendamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
            <DialogDescription>Preencha os dados do agendamento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Select value={formData.clientId} onValueChange={v => setFormData({ ...formData, clientId: v })} required>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {clientsList?.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Barbeiro *</Label>
              <Select value={formData.barberId} onValueChange={v => setFormData({ ...formData, barberId: v })} required>
                <SelectTrigger><SelectValue placeholder="Selecione um barbeiro" /></SelectTrigger>
                <SelectContent>
                  {barbers?.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Serviço *</Label>
              <Select value={formData.serviceId} onValueChange={v => setFormData({ ...formData, serviceId: v })} required>
                <SelectTrigger><SelectValue placeholder="Selecione um serviço" /></SelectTrigger>
                <SelectContent>
                  {services?.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} — R$ {(s.priceInCents / 100).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input type="date" value={formData.date}
                  onChange={e => setFormData({ ...formData, date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Horário *</Label>
                <Input type="time" value={formData.time}
                  onChange={e => setFormData({ ...formData, time: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending}>Criar Agendamento</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Agendamentos</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie os agendamentos da barbearia
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setDisplayMode("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  displayMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendário
              </button>
              <button
                onClick={() => setDisplayMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  displayMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </button>
            </div>
            {newApptDialog}
          </div>
        </div>

        {/* ── Calendar View ─────────────────────────────────────────────────── */}
        {displayMode === "calendar" && (
          isLoading ? (
            <div className="h-96 animate-pulse bg-muted rounded-xl" />
          ) : (
            <AppointmentCalendar
              appointments={(appointments ?? []) as any}
              barbers={barbers?.map(b => ({ id: b.id, name: b.name }))}
              onCreateClick={handleCalendarCreateClick}
              onAppointmentClick={(appt) => {
                // Future: open detail/edit dialog
                toast.info(`${appt.clientName ?? "Cliente"} — ${appt.serviceName ?? "Serviço"}`);
              }}
            />
          )
        )}

        {/* ── List View ──────────────────────────────────────────────────────── */}
        {displayMode === "list" && (
          <div className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardHeader><div className="h-6 w-32 animate-pulse bg-muted rounded" /></CardHeader>
                    <CardContent><div className="h-20 animate-pulse bg-muted rounded" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : groupedAppointments && Object.keys(groupedAppointments).length > 0 ? (
              Object.entries(groupedAppointments)
                .sort((a, b) => new Date(b[1]![0].appointmentDate).getTime() - new Date(a[1]![0].appointmentDate).getTime())
                .map(([date, dayAppts]) => (
                  <Card key={date}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        {date}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {dayAppts!.map(appt => {
                          const client = clientsList?.find(c => c.id === appt.clientId);
                          const barber = barbers?.find(b => b.id === appt.barberId);
                          return (
                            <div
                              key={appt.id}
                              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-semibold">
                                    {new Date(appt.appointmentDate).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit", minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <p className="font-medium">
                                  {appt.clientName ?? client?.name ?? `Cliente #${appt.clientId}`}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Barbeiro: {appt.barberName ?? barber?.name ?? `#${appt.barberId}`} ·{" "}
                                  Serviço: {(appt as any).serviceName || "—"}
                                </p>
                                {appt.notes && (
                                  <p className="text-sm text-muted-foreground mt-1">Obs: {appt.notes}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Select
                                  value={appt.status}
                                  onValueChange={(v: any) => handleStatusChange(appt.id, v)}
                                >
                                  <SelectTrigger className={`w-[140px] ${getStatusColor(appt.status)}`}>
                                    <SelectValue>{getStatusLabel(appt.status)}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pendente</SelectItem>
                                    <SelectItem value="confirmed">Confirmado</SelectItem>
                                    <SelectItem value="completed">Concluído</SelectItem>
                                    <SelectItem value="cancelled">Cancelado</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))
            ) : (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground">Nenhum agendamento encontrado</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
