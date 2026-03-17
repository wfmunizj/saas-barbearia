import { useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const emailVerified = params.get("emailVerified") === "true";
  const error = params.get("error");

  const { data: barbershop } = trpc.clientPortal.getBarbershop.useQuery({ slug });
  const primaryColor = barbershop?.primaryColor ?? "#C9A84C";

  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    setIsResending(true);
    try {
      const res = await fetch(`/api/client/${slug}/resend-verification`, {
        method: "POST",
        credentials: "include",
      });
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

  if (emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0a" }}>
        <div className="max-w-md w-full text-center rounded-2xl p-8" style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `${primaryColor}22` }}>
            <CheckCircle2 className="h-8 w-8" style={{ color: primaryColor }} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Bodoni Moda', serif" }}>
            Email Verificado!
          </h2>
          <p className="text-white/50 mb-6">
            Seu email foi confirmado. Agora você pode agendar e usar todos os recursos.
          </p>
          <Button
            onClick={() => window.location.href = `/b/${slug}`}
            className="w-full"
            style={{ background: primaryColor }}
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0a" }}>
      <div className="max-w-md w-full text-center rounded-2xl p-8" style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `${primaryColor}22` }}>
          <Mail className="h-8 w-8" style={{ color: primaryColor }} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Bodoni Moda', serif" }}>
          {error ? "Erro na Verificação" : "Verifique seu Email"}
        </h2>
        <p className="text-white/50 mb-6">
          {error
            ? decodeURIComponent(error)
            : "Enviamos um link de confirmação para o seu email. Clique no link para ativar sua conta."}
        </p>
        <p className="text-sm text-white/30 mb-6">
          Não recebeu? Verifique a pasta de spam ou clique abaixo.
        </p>
        <Button
          onClick={handleResend}
          disabled={isResending || cooldown > 0}
          variant="outline"
          className="w-full border-white/10 text-white hover:bg-white/5"
        >
          {isResending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
          ) : cooldown > 0 ? (
            `Reenviar em ${cooldown}s`
          ) : (
            "Reenviar Email"
          )}
        </Button>
      </div>
    </div>
  );
}
