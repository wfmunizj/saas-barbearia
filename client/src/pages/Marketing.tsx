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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, MessageSquare, Tag, Send, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Marketing() {
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  const [inactiveDays, setInactiveDays] = useState("30");
  
  const [campaignFormData, setCampaignFormData] = useState({
    name: "",
    description: "",
    type: "promotional" as "promotional" | "reactivation" | "referral",
    discountPercentage: "",
    startDate: "",
    endDate: "",
  });

  const [messageFormData, setMessageFormData] = useState({
    message: "",
  });

  const { data: campaigns, refetch: refetchCampaigns } = trpc.campaigns.list.useQuery();
  const { data: whatsappMessages } = trpc.whatsapp.list.useQuery();
  const { data: messageTemplates } = trpc.messageTemplates.list.useQuery();
  const { data: inactiveClients } = trpc.clients.getInactive.useQuery(
    { days: parseInt(inactiveDays) },
    { enabled: !!inactiveDays }
  );

  const createCampaignMutation = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campanha criada com sucesso!");
      refetchCampaigns();
      setIsCampaignDialogOpen(false);
      resetCampaignForm();
    },
    onError: (error) => {
      toast.error("Erro ao criar campanha: " + error.message);
    },
  });

  const sendMessageMutation = trpc.whatsapp.send.useMutation({
    onSuccess: () => {
      toast.success("Mensagem enviada com sucesso!");
      setIsMessageDialogOpen(false);
      resetMessageForm();
    },
    onError: (error) => {
      toast.error("Erro ao enviar mensagem: " + error.message);
    },
  });

  const resetCampaignForm = () => {
    setCampaignFormData({
      name: "",
      description: "",
      type: "promotional",
      discountPercentage: "",
      startDate: "",
      endDate: "",
    });
  };

  const resetMessageForm = () => {
    setMessageFormData({ message: "" });
  };

  const handleCampaignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaignMutation.mutate({
      name: campaignFormData.name,
      description: campaignFormData.description || undefined,
      type: campaignFormData.type,
      discountPercentage: campaignFormData.discountPercentage 
        ? parseInt(campaignFormData.discountPercentage) 
        : undefined,
      startDate: new Date(campaignFormData.startDate),
      endDate: campaignFormData.endDate ? new Date(campaignFormData.endDate) : undefined,
    });
  };

  const handleSendToInactive = () => {
    if (!messageFormData.message) {
      toast.error("Digite uma mensagem antes de enviar");
      return;
    }

    if (!inactiveClients || inactiveClients.length === 0) {
      toast.error("Nenhum cliente inativo encontrado");
      return;
    }

    // Enviar mensagem para cada cliente inativo
    inactiveClients.forEach((client) => {
      sendMessageMutation.mutate({
        clientId: client.id,
        message: messageFormData.message,
      });
    });

    toast.success(`Mensagens agendadas para ${inactiveClients.length} clientes`);
    setIsMessageDialogOpen(false);
    resetMessageForm();
  };

  const getCampaignTypeLabel = (type: string) => {
    switch (type) {
      case 'promotional':
        return 'Promocional';
      case 'reactivation':
        return 'Reativação';
      case 'referral':
        return 'Indicação';
      default:
        return type;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Marketing</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie campanhas e comunicação com clientes
          </p>
        </div>

        <Tabs defaultValue="campaigns" className="space-y-4">
          <TabsList>
            <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Campanhas Promocionais</h2>
                <p className="text-sm text-muted-foreground">
                  Crie e gerencie campanhas de marketing
                </p>
              </div>
              <Dialog open={isCampaignDialogOpen} onOpenChange={(open) => {
                setIsCampaignDialogOpen(open);
                if (!open) resetCampaignForm();
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Campanha
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCampaignSubmit}>
                    <DialogHeader>
                      <DialogTitle>Nova Campanha</DialogTitle>
                      <DialogDescription>
                        Crie uma nova campanha de marketing
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nome *</Label>
                        <Input
                          id="name"
                          value={campaignFormData.name}
                          onChange={(e) =>
                            setCampaignFormData({ ...campaignFormData, name: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Tipo *</Label>
                        <Select
                          value={campaignFormData.type}
                          onValueChange={(value: any) =>
                            setCampaignFormData({ ...campaignFormData, type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="promotional">Promocional</SelectItem>
                            <SelectItem value="reactivation">Reativação</SelectItem>
                            <SelectItem value="referral">Indicação</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                          id="description"
                          value={campaignFormData.description}
                          onChange={(e) =>
                            setCampaignFormData({ ...campaignFormData, description: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="discount">Desconto (%)</Label>
                        <Input
                          id="discount"
                          type="number"
                          value={campaignFormData.discountPercentage}
                          onChange={(e) =>
                            setCampaignFormData({ ...campaignFormData, discountPercentage: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Data Início *</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={campaignFormData.startDate}
                            onChange={(e) =>
                              setCampaignFormData({ ...campaignFormData, startDate: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate">Data Fim</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={campaignFormData.endDate}
                            onChange={(e) =>
                              setCampaignFormData({ ...campaignFormData, endDate: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCampaignDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createCampaignMutation.isPending}>
                        Criar Campanha
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns && campaigns.length > 0 ? (
                campaigns.map((campaign) => (
                  <Card key={campaign.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{campaign.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {getCampaignTypeLabel(campaign.type)}
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          campaign.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {campaign.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {campaign.description && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {campaign.description}
                        </p>
                      )}
                      {campaign.discountPercentage && (
                        <p className="text-sm font-semibold mb-2">
                          Desconto: {campaign.discountPercentage}%
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Início: {new Date(campaign.startDate).toLocaleDateString('pt-BR')}
                      </p>
                      {campaign.endDate && (
                        <p className="text-xs text-muted-foreground">
                          Fim: {new Date(campaign.endDate).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full">
                  <CardContent className="py-12">
                    <p className="text-center text-muted-foreground">
                      Nenhuma campanha criada ainda
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Automação WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inactiveDays">Clientes inativos há (dias)</Label>
                  <Input
                    id="inactiveDays"
                    type="number"
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(e.target.value)}
                    placeholder="30"
                  />
                  {inactiveClients && (
                    <p className="text-sm text-muted-foreground">
                      {inactiveClients.length} clientes inativos encontrados
                    </p>
                  )}
                </div>

                <Dialog open={isMessageDialogOpen} onOpenChange={setIsMessageDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full">
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Mensagem para Clientes Inativos
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Enviar Mensagem WhatsApp</DialogTitle>
                      <DialogDescription>
                        Mensagem será enviada para {inactiveClients?.length || 0} clientes inativos
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="message">Mensagem *</Label>
                        <Textarea
                          id="message"
                          value={messageFormData.message}
                          onChange={(e) =>
                            setMessageFormData({ message: e.target.value })
                          }
                          placeholder="Olá! Sentimos sua falta. Que tal agendar um horário?"
                          rows={5}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsMessageDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button onClick={handleSendToInactive} disabled={sendMessageMutation.isPending}>
                        Enviar Mensagens
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico de Mensagens</CardTitle>
              </CardHeader>
              <CardContent>
                {whatsappMessages && whatsappMessages.length > 0 ? (
                  <div className="space-y-3">
                    {whatsappMessages.slice(0, 10).map((msg) => (
                      <div
                        key={msg.id}
                        className="p-3 border rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium">
                            Cliente #{msg.clientId}
                          </p>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            msg.status === 'sent' ? 'bg-green-100 text-green-800' :
                            msg.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {msg.status === 'sent' ? 'Enviado' :
                             msg.status === 'pending' ? 'Pendente' : 'Falhou'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {msg.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(msg.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma mensagem enviada ainda
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Templates de Mensagens
                </CardTitle>
              </CardHeader>
              <CardContent>
                {messageTemplates && messageTemplates.length > 0 ? (
                  <div className="space-y-3">
                    {messageTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <h3 className="font-semibold mb-2">{template.name}</h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {template.content}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          Tipo: {template.type}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum template disponível
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
