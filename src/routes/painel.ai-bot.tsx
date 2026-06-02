import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Bot, ArrowLeft, Plus, Trash2, Save, MessageSquare, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/painel/ai-bot")({
  component: AiBotPage,
});

type Aba = "persona" | "kb" | "exemplos" | "autorizados" | "alertas" | "historico";

function AiBotPage() {
  const [aba, setAba] = useState<Aba>("persona");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/painel" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Voltar
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot size={22} /> Bot IA dos Encarregados
          </h1>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {([
          ["persona", "Persona & Config"],
          ["kb", "Base de conhecimento"],
          ["exemplos", "Exemplos"],
          ["autorizados", "Autorizados"],
          ["historico", "Histórico"],
        ] as [Aba, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              aba === k
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "persona" && <PersonaTab />}
      {aba === "kb" && <KbTab />}
      {aba === "exemplos" && <ExemplosTab />}
      {aba === "autorizados" && <AutorizadosTab />}
      {aba === "historico" && <HistoricoTab />}

      {aba === "persona" && <GuiaIntegracao />}
    </div>
  );
}

/* ----------------- PERSONA ----------------- */
function PersonaTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ai-bot-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_config")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    ativo: false,
    persona: "",
    modelo: "google/gemini-2.5-flash",
    temperatura: 0.7,
    max_historico: 20,
    saudacao_inicial: "",
    somente_autorizados: true,
  });

  useEffect(() => {
    if (data) {
      setForm({
        ativo: data.ativo,
        persona: data.persona || "",
        modelo: data.modelo,
        temperatura: Number(data.temperatura),
        max_historico: data.max_historico,
        saudacao_inicial: data.saudacao_inicial || "",
        somente_autorizados: data.somente_autorizados,
      });
    }
  }, [data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_bot_config")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", "default");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["ai-bot-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5 max-w-3xl">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.ativo}
          onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
          className="size-4"
        />
        <span className="font-medium">Bot ativo (responder mensagens)</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.somente_autorizados}
          onChange={(e) => setForm((f) => ({ ...f, somente_autorizados: e.target.checked }))}
          className="size-4"
        />
        <span className="text-sm">Responder apenas telefones autorizados</span>
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">Persona / Instruções principais</label>
        <textarea
          value={form.persona}
          onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
          rows={14}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          placeholder={`Ex.: Você é o assistente da equipe Macroambiental. Atende encarregados de obra no WhatsApp.

Regras:
- Sempre responder em português, de forma educada e direta.
- Quando perguntarem sobre procedimentos de envio de fotos, oriente passo a passo.
- Nunca prometa prazos sem confirmação humana.
- Se não souber, diga "vou verificar com a equipe e retorno".`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Modelo</label>
          <select
            value={form.modelo}
            onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (rápido)</option>
            <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (mais barato)</option>
            <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (melhor qualidade)</option>
            <option value="openai/gpt-5-mini">GPT-5 Mini</option>
            <option value="openai/gpt-5">GPT-5</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Temperatura ({form.temperatura})
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={form.temperatura}
            onChange={(e) => setForm((f) => ({ ...f, temperatura: Number(e.target.value) }))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Máx. histórico</label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.max_historico}
            onChange={(e) => setForm((f) => ({ ...f, max_historico: Number(e.target.value) }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        <Save size={15} /> Salvar configuração
      </button>
    </div>
  );
}

/* ----------------- KB ----------------- */
function KbTab() {
  const qc = useQueryClient();
  const { data: itens = [] } = useQuery({
    queryKey: ["ai-bot-kb"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_kb")
        .select("*")
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const [novo, setNovo] = useState({ titulo: "", conteudo: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!novo.titulo.trim() || !novo.conteudo.trim()) throw new Error("Preencha título e conteúdo");
      const { error } = await supabase.from("ai_bot_kb").insert({ ...novo });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ titulo: "", conteudo: "" });
      qc.invalidateQueries({ queryKey: ["ai-bot-kb"] });
      toast.success("Item adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_bot_kb").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-bot-kb"] }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("ai_bot_kb").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-bot-kb"] }),
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-lg border p-4 space-y-3 bg-card">
        <h3 className="font-medium">Adicionar item</h3>
        <input
          placeholder="Título (ex: Como enviar fotos)"
          value={novo.titulo}
          onChange={(e) => setNovo((n) => ({ ...n, titulo: e.target.value }))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Conteúdo / procedimento que a IA deve consultar para responder"
          value={novo.conteudo}
          onChange={(e) => setNovo((n) => ({ ...n, conteudo: e.target.value }))}
          rows={5}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {itens.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>
        )}
        {itens.map((it) => (
          <div key={it.id} className="rounded-md border p-3 bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium text-sm">{it.titulo}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                  {it.conteudo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={it.ativo}
                    onChange={(e) => toggle.mutate({ id: it.id, ativo: e.target.checked })}
                  />
                  ativo
                </label>
                <button
                  onClick={() => del.mutate(it.id)}
                  className="text-red-600 hover:bg-red-50 p-1 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------- EXEMPLOS ----------------- */
function ExemplosTab() {
  const qc = useQueryClient();
  const { data: itens = [] } = useQuery({
    queryKey: ["ai-bot-exemplos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_exemplos")
        .select("*")
        .order("ordem")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const [novo, setNovo] = useState({ pergunta: "", resposta: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!novo.pergunta.trim() || !novo.resposta.trim()) throw new Error("Preencha pergunta e resposta");
      const { error } = await supabase.from("ai_bot_exemplos").insert({ ...novo });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ pergunta: "", resposta: "" });
      qc.invalidateQueries({ queryKey: ["ai-bot-exemplos"] });
      toast.success("Exemplo adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_bot_exemplos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-bot-exemplos"] }),
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-lg border p-4 space-y-3 bg-card">
        <h3 className="font-medium">Novo exemplo</h3>
        <textarea
          placeholder="Pergunta do encarregado"
          value={novo.pergunta}
          onChange={(e) => setNovo((n) => ({ ...n, pergunta: e.target.value }))}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Resposta modelo da IA"
          value={novo.resposta}
          onChange={(e) => setNovo((n) => ({ ...n, resposta: e.target.value }))}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {itens.map((it) => (
          <div key={it.id} className="rounded-md border p-3 bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Pergunta</p>
                  <p className="text-sm">{it.pergunta}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Resposta</p>
                  <p className="text-sm whitespace-pre-wrap">{it.resposta}</p>
                </div>
              </div>
              <button
                onClick={() => del.mutate(it.id)}
                className="text-red-600 hover:bg-red-50 p-1 rounded"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------- AUTORIZADOS ----------------- */
function AutorizadosTab() {
  const qc = useQueryClient();
  const { data: itens = [] } = useQuery({
    queryKey: ["ai-bot-autorizados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_autorizados")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [novo, setNovo] = useState({ telefone: "", nome: "" });

  const add = useMutation({
    mutationFn: async () => {
      const tel = novo.telefone.replace(/\D/g, "");
      if (!tel) throw new Error("Telefone inválido");
      const { error } = await supabase
        .from("ai_bot_autorizados")
        .insert({ telefone: tel, nome: novo.nome || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovo({ telefone: "", nome: "" });
      qc.invalidateQueries({ queryKey: ["ai-bot-autorizados"] });
      toast.success("Adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_bot_autorizados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-bot-autorizados"] }),
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-lg border p-4 space-y-3 bg-card">
        <h3 className="font-medium">Autorizar novo encarregado</h3>
        <div className="flex gap-2">
          <input
            placeholder="Telefone (com DDD, só números)"
            value={novo.telefone}
            onChange={(e) => setNovo((n) => ({ ...n, telefone: e.target.value }))}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Nome (opcional)"
            value={novo.nome}
            onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={() => add.mutate()}
            disabled={add.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum autorizado.</p>}
        {itens.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-md border p-2 bg-card">
            <div className="text-sm">
              <span className="font-mono">{it.telefone}</span>
              {it.nome && <span className="text-muted-foreground"> — {it.nome}</span>}
            </div>
            <button
              onClick={() => del.mutate(it.id)}
              className="text-red-600 hover:bg-red-50 p-1 rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------- HISTÓRICO ----------------- */
function HistoricoTab() {
  const [tel, setTel] = useState("");

  const { data: telefones = [] } = useQuery({
    queryKey: ["ai-bot-historico-telefones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_conversas")
        .select("telefone,nome,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map = new Map<string, { telefone: string; nome: string | null; ultimo: string }>();
      for (const r of data ?? []) {
        if (!map.has(r.telefone))
          map.set(r.telefone, { telefone: r.telefone, nome: r.nome, ultimo: r.created_at });
      }
      return Array.from(map.values());
    },
  });

  const { data: msgs = [] } = useQuery({
    queryKey: ["ai-bot-historico", tel],
    enabled: !!tel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_conversas")
        .select("*")
        .eq("telefone", tel)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      <div className="space-y-1 border rounded-md p-2 bg-card max-h-[60vh] overflow-auto">
        {telefones.length === 0 && (
          <p className="text-sm text-muted-foreground p-2">Sem conversas ainda.</p>
        )}
        {telefones.map((t) => (
          <button
            key={t.telefone}
            onClick={() => setTel(t.telefone)}
            className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-accent ${
              tel === t.telefone ? "bg-accent" : ""
            }`}
          >
            <div className="font-mono text-xs">{t.telefone}</div>
            {t.nome && <div className="text-xs text-muted-foreground">{t.nome}</div>}
          </button>
        ))}
      </div>
      <div className="border rounded-md p-3 bg-card max-h-[60vh] overflow-auto">
        {!tel && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <MessageSquare size={16} /> Selecione um telefone para ver a conversa
          </p>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`mb-2 ${m.role === "user" ? "" : "pl-6"}`}>
            <div className="text-[10px] uppercase text-muted-foreground">
              {m.role} · {new Date(m.created_at).toLocaleString("pt-BR")}
            </div>
            <div
              className={`rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-muted" : "bg-primary/10"
              }`}
            >
              {m.conteudo}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------- GUIA ----------------- */
function GuiaIntegracao() {
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/hooks/ai-bot`;

  return (
    <div className="mt-10 max-w-3xl rounded-lg border bg-muted/30 p-5 space-y-4 text-sm">
      <h2 className="font-semibold text-base">Como conectar o WhatsApp ao bot</h2>

      <div>
        <p className="font-medium mb-1">1. Crie o secret <code className="text-xs bg-background px-1.5 py-0.5 rounded">AI_BOT_WEBHOOK_SECRET</code></p>
        <p className="text-muted-foreground">
          Vá em Lovable Cloud → Secrets, adicione uma senha forte. Esse valor protege o endpoint.
        </p>
      </div>

      <div>
        <p className="font-medium mb-1">2. URL do webhook do seu app</p>
        <code className="block bg-background border rounded px-2 py-1.5 text-xs break-all">
          {webhookUrl}
        </code>
        <p className="text-muted-foreground mt-1">
          Aceita <code>POST</code> com JSON <code>{`{ "telefone": "5511...", "mensagem": "...", "nome": "opcional" }`}</code>.
          Header obrigatório: <code>X-Bot-Secret: &lt;valor do secret&gt;</code>.
          Retorna <code>{`{ "resposta": "..." }`}</code>.
        </p>
      </div>

      <div>
        <p className="font-medium mb-1">3. Configure no seu provedor de WhatsApp</p>

        <p className="mt-2 font-medium">▸ Evolution API (recomendado, gratuito, self-hosted)</p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>Instale Evolution API (Docker) e conecte um número novo via QR Code.</li>
          <li>
            Crie um <strong>webhook de evento</strong> "messages.upsert" apontando para um pequeno
            script intermediário (ou n8n) que: extrai <code>data.key.remoteJid</code> e{" "}
            <code>data.message.conversation</code>, chama o webhook acima, e devolve a resposta via{" "}
            <code>sendText</code> da Evolution API.
          </li>
          <li>Posso gerar esse script intermediário (Node ou n8n) — é só pedir.</li>
        </ol>

        <p className="mt-3 font-medium">▸ Meta Cloud API (oficial)</p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>Crie um app em developers.facebook.com → WhatsApp → adicione um número de teste.</li>
          <li>Configure o webhook do app para o seu endpoint (precisa adaptar para o formato Meta).</li>
          <li>Esse caminho é mais formal e exige verificação de negócio para uso em produção.</li>
        </ol>

        <p className="mt-3 font-medium">▸ Z-API (mesmo provedor que você já usa)</p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>Crie uma <strong>nova instância</strong> Z-API com outro número.</li>
          <li>
            Em "Webhook ao receber" cole uma URL intermediária que reformata o payload Z-API para o
            formato deste endpoint e reenvia a resposta usando <code>send-text</code>.
          </li>
        </ol>
      </div>

      <div>
        <p className="font-medium">4. Teste rápido (curl)</p>
        <pre className="bg-background border rounded px-2 py-2 text-[11px] overflow-auto">
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Bot-Secret: SEU_SECRET" \\
  -d '{"telefone":"5511999998888","mensagem":"olá","nome":"Teste"}'`}
        </pre>
      </div>
    </div>
  );
}
