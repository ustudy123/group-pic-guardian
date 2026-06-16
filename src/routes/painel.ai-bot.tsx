import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Bot, ArrowLeft, Plus, Trash2, Save, MessageSquare, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/painel/ai-bot")({
  component: AiBotPage,
});

type Aba = "persona" | "programadas" | "kb" | "exemplos" | "autorizados" | "alertas" | "historico";

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
            <Bot size={22} /> Macro I.A
          </h1>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {([
          ["persona", "Persona & Config"],
          ["programadas", "Mensagens programadas"],
          ["kb", "Base de conhecimento"],
          ["exemplos", "Exemplos"],
          ["autorizados", "Autorizados"],
          ["alertas", "Alertas"],
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
      {aba === "programadas" && <ProgramadasTab />}
      {aba === "kb" && <KbTab />}
      {aba === "exemplos" && <ExemplosTab />}
      {aba === "autorizados" && <AutorizadosTab />}
      {aba === "alertas" && <AlertasTab />}
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
    coordenador_telefone: "",
    coordenador_nome: "",
    coordenador_telefone_2: "",
    coordenador_nome_2: "",
    coordenador_telefone_3: "",
    coordenador_nome_3: "",
    coordenador_telefone_4: "",
    coordenador_nome_4: "",
    alertas_ativos: true,
  });

  useEffect(() => {
    if (data) {
      const d = data as Record<string, unknown>;
      setForm({
        ativo: data.ativo,
        persona: data.persona || "",
        modelo: data.modelo,
        temperatura: Number(data.temperatura),
        max_historico: data.max_historico,
        saudacao_inicial: data.saudacao_inicial || "",
        somente_autorizados: data.somente_autorizados,
        coordenador_telefone: (d.coordenador_telefone as string) || "",
        coordenador_nome: (d.coordenador_nome as string) || "",
        coordenador_telefone_2: (d.coordenador_telefone_2 as string) || "",
        coordenador_nome_2: (d.coordenador_nome_2 as string) || "",
        coordenador_telefone_3: (d.coordenador_telefone_3 as string) || "",
        coordenador_nome_3: (d.coordenador_nome_3 as string) || "",
        coordenador_telefone_4: (d.coordenador_telefone_4 as string) || "",
        coordenador_nome_4: (d.coordenador_nome_4 as string) || "",
        alertas_ativos: (d.alertas_ativos as boolean) ?? true,
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 opacity-0 h-0 overflow-hidden pointer-events-none">
        <div>
          <label className="block text-sm font-medium mb-1">Modelo</label>
          <select
            value={form.modelo}
            onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
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

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle size={16} className="text-orange-500" /> Alertas para o coordenador
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.alertas_ativos}
            onChange={(e) => setForm((f) => ({ ...f, alertas_ativos: e.target.checked }))}
            className="size-4"
          />
          <span className="text-sm">
            Detectar problemas em obra automaticamente e enviar alerta no WhatsApp do coordenador (via Z-API)
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            ["coordenador_telefone", "coordenador_nome", "Coordenador 1 (principal)"],
            ["coordenador_telefone_2", "coordenador_nome_2", "Coordenador 2"],
            ["coordenador_telefone_3", "coordenador_nome_3", "Coordenador 3"],
            ["coordenador_telefone_4", "coordenador_nome_4", "Coordenador 4"],
          ] as const).map(([telKey, nomeKey, label]) => (
            <div key={telKey} className="rounded-md border bg-background/50 p-3 space-y-2 sm:col-span-2">
              <div className="text-xs font-semibold text-muted-foreground">{label}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  placeholder="WhatsApp: 55DDDNUMERO (só números)"
                  value={form[telKey]}
                  onChange={(e) => setForm((f) => ({ ...f, [telKey]: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                />
                <input
                  placeholder="Nome"
                  value={form[nomeKey]}
                  onChange={(e) => setForm((f) => ({ ...f, [nomeKey]: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
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

/* ----------------- MENSAGENS PROGRAMADAS ----------------- */
function ProgramadasTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ai-bot-programadas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_config")
        .select("msg_programadas_ativas, msg_manha, msg_noite")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    msg_programadas_ativas: false,
    msg_manha: "",
    msg_noite: "",
  });

  useEffect(() => {
    if (data) {
      const d = data as Record<string, unknown>;
      setForm({
        msg_programadas_ativas: (d.msg_programadas_ativas as boolean) ?? false,
        msg_manha: (d.msg_manha as string) || "",
        msg_noite: (d.msg_noite as string) || "",
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
      toast.success("Mensagens programadas salvas");
      qc.invalidateQueries({ queryKey: ["ai-bot-programadas-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data: envios = [] } = useQuery({
    queryKey: ["ai-bot-envios-programados", hoje],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_bot_envios_programados")
        .select("*")
        .eq("data_ref", hoje)
        .order("enviado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
        <p className="font-medium">Como funciona</p>
        <p className="text-muted-foreground">
          O bot puxa conversa com cada encarregado autorizado duas vezes por dia, de forma
          intercalada (anti-spam): <strong>manhã entre 7h15 e 8h15</strong> e{" "}
          <strong>noite entre 18h e 19h</strong>, de segunda a sábado. Use{" "}
          <code className="bg-background px-1 rounded">{"{nome}"}</code> no texto para inserir o
          primeiro nome do encarregado (cadastrado na aba Autorizados).
        </p>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={form.msg_programadas_ativas}
          onChange={(e) => setForm((f) => ({ ...f, msg_programadas_ativas: e.target.checked }))}
          className="size-4"
        />
        <span className="font-medium">Envio automático ativo</span>
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">
          ☀️ Mensagem da manhã (7h15 – 8h15)
        </label>
        <textarea
          value={form.msg_manha}
          onChange={(e) => setForm((f) => ({ ...f, msg_manha: e.target.value }))}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">🌙 Mensagem da noite (18h – 19h)</label>
        <textarea
          value={form.msg_noite}
          onChange={(e) => setForm((f) => ({ ...f, msg_noite: e.target.value }))}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        <Save size={15} /> Salvar
      </button>

      <div className="space-y-2">
        <h3 className="font-medium text-sm">Envios de hoje ({envios.length})</h3>
        {envios.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum envio registrado hoje.</p>
        )}
        {envios.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between rounded-md border p-2 bg-card text-sm"
          >
            <div>
              <span className="font-mono">{e.telefone}</span>
              {e.nome && <span className="text-muted-foreground"> — {e.nome}</span>}
              <span className="ml-2 text-xs text-muted-foreground">
                {e.periodo === "manha" ? "☀️ manhã" : "🌙 noite"} ·{" "}
                {new Date(e.enviado_em).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })}
              </span>
            </div>
            {e.sucesso ? (
              <span className="text-emerald-700 inline-flex items-center gap-1 text-xs">
                <CheckCircle2 size={13} /> enviado
              </span>
            ) : (
              <span className="text-orange-600 text-xs">pendente/falhou</span>
            )}
          </div>
        ))}
      </div>
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

/* ----------------- ALERTAS ----------------- */
function AlertasTab() {
  const qc = useQueryClient();
  const [filtroCrit, setFiltroCrit] = useState<string>("todas");
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false);
  const [view, setView] = useState<"lista" | "kanban">("lista");

  const { data: alertas = [] } = useQuery({
    queryKey: ["ai-bot-alertas", filtroCrit, mostrarResolvidos, view],
    queryFn: async () => {
      let q = supabase
        .from("ai_bot_alertas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filtroCrit !== "todas") q = q.eq("criticidade", filtroCrit);
      // No kanban sempre mostra resolvidos (coluna dedicada)
      if (view === "lista" && !mostrarResolvidos) q = q.eq("resolvido", false);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const resolver = useMutation({
    mutationFn: async ({ id, resolvido }: { id: string; resolvido: boolean }) => {
      const { error } = await supabase
        .from("ai_bot_alertas")
        .update({ resolvido })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-bot-alertas"] }),
  });

  const cores: Record<string, string> = {
    critica: "bg-red-100 text-red-800 border-red-300",
    alta: "bg-orange-100 text-orange-800 border-orange-300",
    media: "bg-yellow-100 text-yellow-800 border-yellow-300",
    baixa: "bg-emerald-100 text-emerald-800 border-emerald-300",
  };

  const Cartao = ({ a, compact = false }: { a: any; compact?: boolean }) => (
    <div className="rounded-md border p-3 bg-card">
      <div className={compact ? "space-y-2" : "flex items-start justify-between gap-3"}>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded border ${
                cores[a.criticidade] || "bg-muted"
              }`}
            >
              {a.criticidade.toUpperCase()}
            </span>
            <span className="text-xs uppercase text-muted-foreground">{a.categoria}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleString("pt-BR")}
            </span>
            {a.enviado_coordenador && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> enviado
              </span>
            )}
          </div>
          <p className="text-sm font-medium">{a.resumo}</p>
          <p className="text-xs text-muted-foreground">De: {a.nome || a.telefone}</p>
          {a.mensagem_origem && (
            <p className="text-xs text-muted-foreground italic mt-1 border-l-2 pl-2">
              "{a.mensagem_origem}"
            </p>
          )}
        </div>
        <button
          onClick={() => resolver.mutate({ id: a.id, resolvido: !a.resolvido })}
          className={`text-xs px-3 py-1.5 rounded border whitespace-nowrap ${
            a.resolvido
              ? "bg-muted text-muted-foreground"
              : "bg-emerald-600 text-white hover:opacity-90"
          } ${compact ? "w-full" : ""}`}
        >
          {a.resolvido ? "Reabrir" : "Resolver"}
        </button>
      </div>
    </div>
  );

  const colunas = [
    {
      key: "novos",
      titulo: "🆕 Novos",
      desc: "Ainda não enviados ao coordenador",
      items: alertas.filter((a: any) => !a.resolvido && !a.enviado_coordenador),
    },
    {
      key: "andamento",
      titulo: "⏳ Em acompanhamento",
      desc: "Enviados ao coordenador, aguardando solução",
      items: alertas.filter((a: any) => !a.resolvido && a.enviado_coordenador),
    },
    {
      key: "resolvidos",
      titulo: "✅ Resolvidos",
      desc: "Já tratados",
      items: alertas.filter((a: any) => a.resolvido),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="inline-flex rounded-md border overflow-hidden">
          <button
            onClick={() => setView("lista")}
            className={`text-xs px-3 py-1.5 ${view === "lista" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            Lista
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`text-xs px-3 py-1.5 ${view === "kanban" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            Kanban
          </button>
        </div>
        <select
          value={filtroCrit}
          onChange={(e) => setFiltroCrit(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="todas">Todas as criticidades</option>
          <option value="critica">🔴 Crítica</option>
          <option value="alta">🟠 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
        {view === "lista" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mostrarResolvidos}
              onChange={(e) => setMostrarResolvidos(e.target.checked)}
            />
            Mostrar resolvidos
          </label>
        )}
      </div>

      {alertas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum alerta no momento. 🎉</p>
      )}

      {view === "lista" ? (
        <div className="space-y-2 max-w-4xl">
          {alertas.map((a: any) => (
            <Cartao key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {colunas.map((col) => (
            <div key={col.key} className="rounded-lg border bg-muted/30 p-3 flex flex-col min-h-[200px]">
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{col.titulo}</h3>
                  <span className="text-xs bg-background border rounded-full px-2 py-0.5">
                    {col.items.length}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{col.desc}</p>
              </div>
              <div className="space-y-2 flex-1">
                {col.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-6">
                    Vazio
                  </p>
                ) : (
                  col.items.map((a: any) => <Cartao key={a.id} a={a} compact />)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
