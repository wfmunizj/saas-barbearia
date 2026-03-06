import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Clock, DollarSign, AlertCircle, Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Services() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    durationMinutes: "",
    priceInCents: "",
    fichasCount: "0",
  });

  const { data: services, isLoading, refetch } = trpc.services.list.useQuery();
  const { data: appointments } = trpc.appointments.list.useQuery();

  const createMutation = trpc.services.create.useMutation({
    onSuccess: () => {
      toast.success("Serviço criado com sucesso!");
      refetch();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao criar serviço: " + error.message);
    },
  });

  const updateMutation = trpc.services.update.useMutation({
    onSuccess: () => {
      toast.success("Serviço atualizado com sucesso!");
      refetch();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar serviço: " + error.message);
    },
  });

  const deleteMutation = trpc.services.delete.useMutation({
    onSuccess: () => {
      toast.success("Serviço removido com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error("Erro ao remover serviço: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", durationMinutes: "", priceInCents: "", fichasCount: "0" });
    setEditingService(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      description: formData.description || undefined,
      durationMinutes: parseInt(formData.durationMinutes),
      priceInCents: Math.round(parseFloat(formData.priceInCents) * 100),
      fichasCount: parseInt(formData.fichasCount) || 0,
    };

    if (editingService) {
      updateMutation.mutate({ id: editingService.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (service: any) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || "",
      durationMinutes: service.durationMinutes.toString(),
      priceInCents: (service.priceInCents / 100).toFixed(2),
      fichasCount: (service.fichasCount ?? 0).toString(),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este serviço?")) {
      deleteMutation.mutate({ id });
    }
  };

  // Verifica se o serviço tem agendamentos ativos (pending ou confirmed)
  const hasActiveAppointments = (serviceId: number) => {
    return appointments?.some(
      (a) =>
        a.serviceId === serviceId &&
        (a.status === "pending" || a.status === "confirmed")
    ) ?? false;
  };

  const filteredServices = services?.filter((service) =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Serviços</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie os serviços oferecidos
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Serviço
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingService ? "Editar Serviço" : "Novo Serviço"}
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os dados do serviço
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Ex: Corte de Cabelo"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      placeholder="Descreva o serviço..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="duration">Duração (min) *</Label>
                      <Input
                        id="duration"
                        type="number"
                        value={formData.durationMinutes}
                        onChange={(e) =>
                          setFormData({ ...formData, durationMinutes: e.target.value })
                        }
                        placeholder="30"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Preço (R$) *</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={formData.priceInCents}
                        onChange={(e) =>
                          setFormData({ ...formData, priceInCents: e.target.value })
                        }
                        placeholder="50.00"
                        required
                      />
                    </div>
                  </div>
                  <div className="border-t pt-4 space-y-2">
                    <Label htmlFor="fichasCount" className="flex items-center gap-1">
                      <Ticket className="h-4 w-4" /> Fichas geradas (plano ilimitado)
                    </Label>
                    <Input
                      id="fichasCount"
                      type="number"
                      min="0"
                      value={formData.fichasCount}
                      onChange={(e) => setFormData({ ...formData, fichasCount: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Quantidade de fichas que o barbeiro recebe ao realizar este serviço em um cliente de plano ilimitado. 0 = não gera fichas.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingService ? "Atualizar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse bg-muted rounded" />
                ))}
              </div>
            ) : filteredServices && filteredServices.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredServices.map((service) => {
                  const blocked = hasActiveAppointments(service.id);
                  return (
                    <div
                      key={service.id}
                      className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-lg">{service.name}</h3>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(service)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          {blocked ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-40 cursor-not-allowed"
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 text-sm" side="left">
                                <div className="flex gap-2">
                                  <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-semibold mb-1">Exclusão bloqueada</p>
                                    <p className="text-muted-foreground">
                                      Este serviço possui agendamentos pendentes ou confirmados. Conclua ou cancele todos os agendamentos antes de removê-lo.
                                    </p>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDelete(service.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {service.description && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {service.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{service.durationMinutes} min</span>
                        </div>
                        <div className="flex items-center gap-1 font-semibold text-lg">
                          <DollarSign className="h-4 w-4" />
                          <span>R$ {(service.priceInCents / 100).toFixed(2)}</span>
                        </div>
                      </div>
                      {(service.fichasCount ?? 0) > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Ticket className="h-3 w-3" />
                          {service.fichasCount} ficha{service.fichasCount !== 1 ? "s" : ""} (plano ilimitado)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum serviço encontrado
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}