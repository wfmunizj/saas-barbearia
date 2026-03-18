import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, AlertCircle, BarChart2, Percent, Ticket } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Barbers() {
  const [, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    specialties: "",
    commissionPercent: 0,
    bonusAmountInCents: 0,
    fichaValueInCents: 0,
  });

  const { data: barbers, isLoading, refetch } = trpc.barbers.list.useQuery();
  const { data: appointments } = trpc.appointments.list.useQuery();

  const createMutation = trpc.barbers.create.useMutation({
    onSuccess: () => {
      toast.success("Barbeiro criado com sucesso!");
      refetch();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error("Erro ao criar barbeiro: " + error.message),
  });

  const updateMutation = trpc.barbers.update.useMutation({
    onSuccess: () => {
      toast.success("Barbeiro atualizado com sucesso!");
      refetch();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error("Erro ao atualizar barbeiro: " + error.message),
  });

  const deleteMutation = trpc.barbers.delete.useMutation({
    onSuccess: () => {
      toast.success("Barbeiro removido com sucesso!");
      refetch();
    },
    onError: (error) => toast.error("Erro ao remover barbeiro: " + error.message),
  });

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", specialties: "", commissionPercent: 0, bonusAmountInCents: 0, fichaValueInCents: 0 });
    setEditingBarber(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      specialties: formData.specialties || undefined,
      commissionPercent: formData.commissionPercent,
      bonusAmountInCents: formData.bonusAmountInCents,
      fichaValueInCents: formData.fichaValueInCents,
    };
    if (editingBarber) {
      updateMutation.mutate({ id: editingBarber.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (barber: any) => {
    setEditingBarber(barber);
    setFormData({
      name: barber.name,
      phone: barber.phone || "",
      email: barber.email || "",
      specialties: barber.specialties || "",
      commissionPercent: parseFloat(barber.commissionPercent ?? "0"),
      bonusAmountInCents: barber.bonusAmountInCents ?? 0,
      fichaValueInCents: barber.fichaValueInCents ?? 0,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este barbeiro?")) {
      deleteMutation.mutate({ id });
    }
  };

  const hasActiveAppointments = (barberId: number) =>
    appointments?.some(a => a.barberId === barberId && (a.status === "pending" || a.status === "confirmed")) ?? false;

  const filteredBarbers = barbers?.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Barbeiros</h1>
            <p className="text-muted-foreground mt-2">Gerencie sua equipe de barbeiros</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo Barbeiro</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>{editingBarber ? "Editar Barbeiro" : "Novo Barbeiro"}</DialogTitle>
                  <DialogDescription>Preencha os dados do barbeiro</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input id="name" value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="specialties">Especialidades</Label>
                    <Textarea id="specialties" value={formData.specialties}
                      onChange={e => setFormData({ ...formData, specialties: e.target.value })}
                      placeholder="Ex: Cortes clássicos, Barbas, Degradê..." />
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3 flex items-center gap-1">
                      <Percent className="h-4 w-4" /> Comissão e Bonificação
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="commissionPercent">Comissão (%)</Label>
                        <Input id="commissionPercent" type="number" min="0" max="100" step="0.5"
                          value={formData.commissionPercent}
                          onChange={e => setFormData({ ...formData, commissionPercent: parseFloat(e.target.value) || 0 })}
                          placeholder="Ex: 30" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bonusAmount">Bonificação (R$)</Label>
                        <Input id="bonusAmount" type="number" min="0" step="0.01"
                          value={(formData.bonusAmountInCents / 100).toFixed(2)}
                          onChange={e => setFormData({ ...formData, bonusAmountInCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                          placeholder="Ex: 50.00" />
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3 flex items-center gap-1">
                      <Ticket className="h-4 w-4" /> Fichas (Plano Ilimitado)
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="fichaValue">Valor por ficha (R$)</Label>
                      <Input id="fichaValue" type="number" min="0" step="0.01"
                        value={(formData.fichaValueInCents / 100).toFixed(2)}
                        onChange={e => setFormData({ ...formData, fichaValueInCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                        placeholder="Ex: 5.00" />
                      <p className="text-xs text-muted-foreground">
                        Valor em R$ que o barbeiro recebe por cada ficha gerada em atendimentos de plano ilimitado.
                      </p>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingBarber ? "Atualizar" : "Criar"}
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
                <Input placeholder="Buscar por nome..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse bg-muted rounded" />)}
              </div>
            ) : filteredBarbers && filteredBarbers.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredBarbers.map(barber => {
                  const blocked = hasActiveAppointments(barber.id);
                  const commission = parseFloat(barber.commissionPercent ?? "0");
                  const bonus = (barber.bonusAmountInCents ?? 0) / 100;
                  return (
                    <div key={barber.id} className="p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-base">{barber.name}</h3>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            title="Ver resumo" onClick={() => navigate(`/barbeiros/${barber.id}/resumo`)}>
                            <BarChart2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => handleEdit(barber)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {blocked ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-40 cursor-not-allowed"
                                  onClick={e => e.preventDefault()}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 text-sm" side="left">
                                <div className="flex gap-2">
                                  <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-semibold mb-1">Exclusão bloqueada</p>
                                    <p className="text-muted-foreground">
                                      Este barbeiro possui agendamentos pendentes ou confirmados.
                                      Conclua ou cancele todos antes de removê-lo.
                                    </p>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => handleDelete(barber.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {barber.phone && <p className="text-sm text-muted-foreground">📞 {barber.phone}</p>}
                      {barber.email && <p className="text-sm text-muted-foreground">✉️ {barber.email}</p>}
                      {barber.specialties && (
                        <p className="text-sm text-muted-foreground mt-1">
                          <strong>Especialidades:</strong> {barber.specialties}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {commission > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <Percent className="h-3 w-3 mr-1" />{commission}% comissão
                          </Badge>
                        )}
                        {bonus > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Bônus R${bonus.toFixed(2).replace(".", ",")}
                          </Badge>
                        )}
                        {/* Ficha badge — sempre exibido para visibilidade */}
                        {(barber.fichaValueInCents ?? 0) > 0 ? (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            <Ticket className="h-3 w-3 mr-1" />
                            R${((barber.fichaValueInCents ?? 0) / 100).toFixed(2).replace(".", ",")}/ficha
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground border-dashed">
                            <Ticket className="h-3 w-3 mr-1" />
                            Valor/ficha não definido
                          </Badge>
                        )}
                        {commission === 0 && bonus === 0 && (barber.fichaValueInCents ?? 0) === 0 && (
                          <span className="text-xs text-muted-foreground">· sem comissão</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhum barbeiro encontrado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
