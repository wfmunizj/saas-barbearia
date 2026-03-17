import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

export default function VerifyEmail() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const emailVerified = params.get("emailVerified") === "true";
  const error = params.get("error");

  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Email Verificado!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              Seu email foi confirmado com sucesso. Você já pode usar a plataforma.
            </p>
            <Button onClick={() => window.location.href = "/"} className="w-full">
              Ir para o Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <Mail className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Erro na Verificação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              {decodeURIComponent(error)}
            </p>
            <Button
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="w-full"
            >
              {isResending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
              ) : cooldown > 0 ? (
                `Reenviar em ${cooldown}s`
              ) : (
                "Reenviar Email de Verificação"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleResend() {
    setIsResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao reenviar");
      } else {
        toast.success("Email reenviado! Verifique sua caixa de entrada.");
        setCooldown(60);
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setIsResending(false);
    }
  }

  // Tela padrão: "Verifique seu email"
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Mail className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Verifique seu Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            Enviamos um link de confirmação para o seu email.
            Clique no link para ativar sua conta.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Não recebeu? Verifique a pasta de spam ou clique abaixo para reenviar.
          </p>
          <Button
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            variant="outline"
            className="w-full"
          >
            {isResending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
            ) : cooldown > 0 ? (
              `Reenviar em ${cooldown}s`
            ) : (
              "Reenviar Email"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
