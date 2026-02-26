import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Scissors, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ─── Login do Cliente ─────────────────────────────────────────────────────────

export function ClientLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const redirect = new URLSearchParams(search).get("redirect") ?? "";
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`/api/client/${slug}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao entrar");
        return;
      }
      toast.success(`Bem-vindo, ${data.user.name}!`);
      // Força reload para garantir que o cookie seja lido
      window.location.href = redirect ? `/b/${slug}/${redirect}` : `/b/${slug}`;
    } catch (err) {
      console.error("[Login] Network error:", err);
      toast.error("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary rounded-2xl p-4 shadow-lg">
              <Scissors className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Entrar</h1>
          <p className="text-sm text-muted-foreground">Acesse sua conta para agendar</p>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Login</CardTitle>
            <CardDescription>Use seu email e senha</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="seu@email.com" required
                  value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} placeholder="••••••••" required
                    value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                  <button type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <button onClick={() => navigate(`/b/${slug}/cadastro`)} className="text-primary hover:underline font-medium">
            Criar conta
          </button>
        </p>
        <p className="text-center">
          <button onClick={() => navigate(`/b/${slug}`)} className="text-sm text-muted-foreground hover:underline">
            ← Voltar para a barbearia
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Cadastro do Cliente ──────────────────────────────────────────────────────

export function ClientRegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const planId = new URLSearchParams(search).get("planId");
  const redirect = new URLSearchParams(search).get("redirect") ?? "";
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) { toast.error("As senhas não coincidem"); return; }
    if (formData.password.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/client/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao criar conta");
        return;
      }
      toast.success("Conta criada com sucesso!");
      // Força reload para garantir que o cookie seja lido
      if (planId) {
        window.location.href = `/b/${slug}/assinar/${planId}`;
      } else {
        window.location.href = redirect ? `/b/${slug}/${redirect}` : `/b/${slug}`;
      }
    } catch (err) {
      console.error("[Register] Network error:", err);
      toast.error("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary rounded-2xl p-4 shadow-lg">
              <Scissors className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Criar Conta</h1>
          <p className="text-sm text-muted-foreground">Cadastre-se para agendar</p>
        </div>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Seus dados</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome completo *</Label>
                <Input placeholder="João Silva" required
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="seu@email.com" required
                  value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone / WhatsApp</Label>
                <Input placeholder="(11) 99999-9999"
                  value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Senha *</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} placeholder="Mínimo 6 caracteres" required minLength={6}
                    value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                  <button type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confirmar Senha *</Label>
                <Input type={showPassword ? "text" : "password"} placeholder="Repita a senha" required
                  value={formData.confirmPassword} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando conta...</> : "Criar Conta"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <button onClick={() => navigate(`/b/${slug}/login`)} className="text-primary hover:underline font-medium">
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
}