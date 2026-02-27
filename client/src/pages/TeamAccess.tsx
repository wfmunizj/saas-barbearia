import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Scissors, ShieldCheck, ShieldOff } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface BarberWithLogin {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  userId: number | null;
  userEmail: string | null;
  hasLogin: boolean;
  userIsActive?: boolean;
}

export default function TeamAccess() {
  const [barbers, setBarbers] = useState<BarberWithLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<BarberWithLogin | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchBarbers = async () => {
    try {
      const res = await fetch("/api/barber-users/list", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setBarbers(data);
    } catch (err) {
      toast.error("Erro ao carregar barbeiros");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarbers();
  }, []);

  const handleOpenDialog = (barber: BarberWithLogin) => {
    setSelectedBarber(barber);
    setFormData({ name: barber.name, email: barber.email ?? "", password: "" });
    setIsDialogOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarber) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/barber-users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          barberId: selectedBarber.id,
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao criar acesso");
        return;
      }
      toast.success(`Acesso criado para ${selectedBarber.name}!`);
      setIsDialogOpen(false);
      fetchBarbers();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveLogin = async (barber: BarberWithLogin) => {
    if (!confirm(`Remover o acesso de ${barber.name}? Ele não conseguirá mais fazer login.`)) return;
    try {
      const res = await fetch(`/api/barber-users/${barber.id}/remove-login`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao remover acesso");
        return;
      }
      toast.success("Acesso removido com sucesso");
      fetchBarbers();
    } catch {
      toast.error("Erro de conexão");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Acesso da Equipe</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie os logins dos seus barbeiros no sistema
          </p>
        </div>

        {/* Explicação */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-semibold">Como funciona?</p>
            <p>
              Cada barbeiro pode ter um login próprio. Com ele, ele acessa apenas os{" "}
              <strong>agendamentos</strong> e <strong>pagamentos</strong> — sem ver clientes,
              marketing, planos ou configurações da barbearia.
            </p>
          </CardContent>
        </Card>

        {/* Lista de barbeiros */}
        <Card>
          <CardHeader>
            <CardTitle>Barbeiros cadastrados</CardTitle>
            <CardDescription>
              Clique em "Criar Acesso" para gerar um login para o barbeiro
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse bg-muted rounded-lg" />
                ))}
              </div>
            ) : barbers.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Scissors className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">
                  Nenhum barbeiro cadastrado ainda.{" "}
                  <a href="/barbers" className="underline text-primary">
                    Cadastre barbeiros primeiro.
                  </a>
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {barbers.map((barber) => (
                  <div
                    key={barber.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-muted rounded-full h-10 w-10 flex items-center justify-center shrink-0">
                        <Scissors className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold">{barber.name}</p>
                        {barber.hasLogin ? (
                          <p className="text-xs text-muted-foreground">
                            Login: {barber.userEmail}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Sem acesso ao sistema
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {barber.hasLogin ? (
                        <>
                          <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                            <ShieldCheck className="h-3 w-3" />
                            Com acesso
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveLogin(barber)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <ShieldOff className="h-3 w-3" />
                            Sem acesso
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => handleOpenDialog(barber)}
                          >
                            <UserPlus className="h-4 w-4" />
                            Criar Acesso
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de criação de login */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Criar acesso para {selectedBarber?.name}</DialogTitle>
              <DialogDescription>
                Defina o email e senha que o barbeiro usará para fazer login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email de acesso</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="barbeiro@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  minLength={6}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Criando..." : "Criar Acesso"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}