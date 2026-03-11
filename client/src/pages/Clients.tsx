import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type FilterType = "all" | "active" | "inactive" | "monthly" | "recurring";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "Todos",
  active: "Ativos",
  inactive: "Inativos",
  monthly: "Mensalistas",
  recurring: "Recorrentes",
};

export default function Clients() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [inactiveDays, setInactiveDays] = useState(30);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: clientsList, isLoading } = trpc.clients.list.useQuery(
    { filter: activeFilter, inactiveDays }
  );

  function invalidateClients() {
    utils.clients.list.invalidate();
  }

  const createMutation = trpc.clients.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente criado com sucesso!");
      invalidateClients();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao criar cliente: " + error.message);
    },
  });

  const updateMutation = trpc.clients.update.useMutation({
    onSuccess: () => {
      toast.success("Cliente atualizado com sucesso!");
      invalidateClients();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar cliente: " + error.message);
    },
  });

  const deleteMutation = trpc.clients.delete.useMutation({
    onSuccess: () => {
      toast.success("Cliente removido com sucesso!");
      invalidateClients();
    },
    onError: (error) => {
      toast.error("Erro ao remover cliente: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", notes: "" });
    setEditingClient(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (client: any) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      phone: client.phone,
      email: client.email || "",
      notes: client.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este cliente?")) {
      deleteMutation.mutate({ id });
    }
  };

  const filteredClients = clientsList?.filter((client) =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone.includes(searchTerm)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Clientes</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie sua base de clientes
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingClient ? "Editar Cliente" : "Novo Cliente"}
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os dados do cliente
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
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                    />
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
                    {editingClient ? "Atualizar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            {/* Barra de busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {/* Chips de filtro */}
            <div className="flex flex-wrap gap-2 items-center">
              {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    activeFilter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/60"
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
              {activeFilter === "inactive" && (
                <div className="flex items-center gap-1 ml-2 text-xs text-muted-foreground">
                  <span>há mais de</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(Number(e.target.value))}
                    className="w-14 border rounded px-2 py-0.5 text-xs bg-background"
                  />
                  <span>dias</span>
                </div>
              )}
              {clientsList && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {filteredClients?.length ?? 0} cliente{filteredClients?.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse bg-muted rounded" />
                ))}
              </div>
            ) : filteredClients && filteredClients.length > 0 ? (
              <div className="space-y-3">
                {filteredClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{client.name}</h3>
                        {activeFilter === "monthly" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Mensalista</Badge>
                        )}
                        {activeFilter === "recurring" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{client.totalVisits}x visitas</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {client.phone}
                        {client.email && ` • ${client.email}`}
                      </p>
                      {client.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {client.notes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {client.totalVisits || 0} visita{client.totalVisits !== 1 ? "s" : ""}
                        {client.lastVisit && ` • Última: ${new Date(client.lastVisit).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(client)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(client.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum cliente encontrado
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
