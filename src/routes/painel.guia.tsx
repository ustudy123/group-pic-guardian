import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Inbox,
  Users,
  Camera,
  Download,
  Upload,
  Trash2,
  Archive,
  RefreshCw,
  KeyRound,
  Search,
  Calendar,
  LogIn,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/painel/guia")({
  component: GuiaUsuario,
});

function Secao({
  num,
  titulo,
  icone,
  children,
}: {
  num: number;
  titulo: string;
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border rounded-2xl bg-card p-6 space-y-3" id={`secao-${num}`}>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: "var(--gradient-safety)" }}
        >
          {icone}
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Etapa {num}
          </div>
          <h2 className="text-xl font-bold leading-tight">{titulo}</h2>
        </div>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function Dica({ children, tipo = "info" }: { children: React.ReactNode; tipo?: "info" | "alerta" | "ok" }) {
  const cfg = {
    info: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-900", icon: <BookOpen size={14} className="text-blue-600" /> },
    alerta: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-900", icon: <AlertTriangle size={14} className="text-amber-600" /> },
    ok: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-900", icon: <CheckCircle2 size={14} className="text-emerald-600" /> },
  }[tipo];
  return (
    <div className={`flex gap-2 items-start rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2 text-xs`}>
      <span className="mt-0.5">{cfg.icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function GuiaUsuario() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/painel" className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar ao painel
          </Link>
          <h1 className="text-3xl font-black tracking-tight mt-2">Guia do Usuário</h1>
          <p className="text-muted-foreground">
            Aprenda passo a passo como usar o sistema de organização de fotos das obras.
          </p>
        </div>
      </div>

      {/* Índice */}
      <nav className="border rounded-xl bg-muted/30 p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Conteúdo
        </div>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal pl-5">
          <li><a href="#visao" className="hover:underline text-primary">Visão geral</a></li>
          <li><a href="#secao-1" className="hover:underline text-primary">Acessar o sistema</a></li>
          <li><a href="#secao-2" className="hover:underline text-primary">Como o bot captura fotos</a></li>
          <li><a href="#secao-3" className="hover:underline text-primary">Ativar grupos novos</a></li>
          <li><a href="#secao-4" className="hover:underline text-primary">Painel de encarregados</a></li>
          <li><a href="#secao-5" className="hover:underline text-primary">Editar e gerenciar encarregado</a></li>
          <li><a href="#secao-6" className="hover:underline text-primary">Navegar pelas pastas</a></li>
          <li><a href="#secao-7" className="hover:underline text-primary">Visualizar fotos do dia</a></li>
          <li><a href="#secao-8" className="hover:underline text-primary">Baixar fotos (.zip)</a></li>
          <li><a href="#secao-9" className="hover:underline text-primary">Enviar foto manualmente</a></li>
          <li><a href="#secao-10" className="hover:underline text-primary">Excluir fotos</a></li>
          <li><a href="#secao-11" className="hover:underline text-primary">Alterar senha</a></li>
          <li><a href="#secao-12" className="hover:underline text-primary">Boas práticas e dúvidas</a></li>
        </ol>
      </nav>

      {/* Visão geral */}
      <section id="visao" className="border rounded-2xl bg-gradient-to-br from-card to-muted/40 p-6 space-y-2">
        <h2 className="text-xl font-bold">O que é este sistema?</h2>
        <p className="text-sm leading-relaxed">
          Este painel automatiza a coleta e organização das fotos enviadas pelos encarregados nos
          grupos do WhatsApp da obra. Um bot conectado ao WhatsApp escuta os grupos cadastrados,
          baixa cada foto enviada e organiza tudo por <strong>encarregado</strong> e por <strong>dia</strong>.
          Você usa o painel para visualizar, filtrar, baixar em lote e gerenciar essas fotos.
        </p>
        <div className="grid sm:grid-cols-3 gap-2 pt-2">
          <div className="rounded-lg border bg-background p-3 text-xs">
            <Smartphone size={16} className="text-emerald-600 mb-1" />
            <strong>WhatsApp</strong> — encarregado envia foto no grupo da obra.
          </div>
          <div className="rounded-lg border bg-background p-3 text-xs">
            <RefreshCw size={16} className="text-blue-600 mb-1" />
            <strong>Bot</strong> — captura automaticamente e armazena na nuvem.
          </div>
          <div className="rounded-lg border bg-background p-3 text-xs">
            <Camera size={16} className="text-orange-600 mb-1" />
            <strong>Painel</strong> — você consulta, filtra e baixa as fotos.
          </div>
        </div>
      </section>

      <Secao num={1} titulo="Acessar o sistema" icone={<LogIn size={18} />}>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Abra <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">https://macroambiental-botgrupos.lovable.app/login</span></li>
          <li>Informe seu <strong>e-mail corporativo</strong> e <strong>senha</strong>.</li>
          <li>Clique em <strong>Entrar</strong>. Você será direcionado ao painel.</li>
        </ol>
        <Dica tipo="info">
          Os cadastros de usuários são feitos manualmente pelo administrador. Caso não tenha acesso,
          solicite ao responsável.
        </Dica>
      </Secao>

      <Secao num={2} titulo="Como o bot captura fotos" icone={<Smartphone size={18} />}>
        <p>
          Existe um número de WhatsApp dedicado (o <em>bot</em>) que precisa estar dentro do grupo da
          obra. Sempre que um membro envia uma foto naquele grupo, o bot:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Recebe a imagem em tempo real.</li>
          <li>Salva no armazenamento em nuvem.</li>
          <li>Registra remetente, data, hora e legenda (caption).</li>
          <li>Organiza dentro da pasta do encarregado, no dia correspondente (fuso de Brasília).</li>
        </ol>
        <Dica tipo="alerta">
          O bot precisa estar <strong>online</strong> (indicador no topo do painel). Se aparecer
          “Bot offline”, fotos novas não serão capturadas até que ele seja reconectado.
        </Dica>
      </Secao>

      <Secao num={3} titulo="Ativar grupos novos" icone={<Inbox size={18} />}>
        <p>
          Sempre que o bot é adicionado a um novo grupo, esse grupo aparece em{" "}
          <strong>Grupos novos</strong> (botão no topo direito, com contador vermelho).
        </p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Clique em <strong>Grupos novos</strong> no cabeçalho.</li>
          <li>Para forçar a busca de grupos diretamente do WhatsApp, clique em <strong>Sincronizar do WhatsApp</strong>.</li>
          <li>Em cada grupo pendente você tem três ações:
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li><strong>Ativar</strong> — cria um encarregado vinculado ao grupo e passa a coletar as fotos.</li>
              <li><Archive size={12} className="inline" /> <strong>Arquivar</strong> — esconde o grupo da lista de pendentes (pode reativar depois).</li>
              <li><Trash2 size={12} className="inline" /> <strong>Excluir</strong> — disponível apenas para o administrador master.</li>
            </ul>
          </li>
        </ol>
        <Dica tipo="info">
          Ao ativar, o sistema sugere automaticamente um nome de encarregado baseado no nome do grupo
          (ex.: “Fotos Wilson” → encarregado “Wilson”). Você pode renomear depois.
        </Dica>
      </Secao>

      <Secao num={4} titulo="Painel de encarregados" icone={<Users size={18} />}>
        <p>
          A tela inicial (<strong>/painel</strong>) lista todos os encarregados ativos como cartões
          coloridos. Cada cartão mostra:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Foto do grupo (ou ícone padrão) e nome do encarregado.</li>
          <li>Nome do grupo do WhatsApp vinculado.</li>
          <li><strong>Hoje</strong> — quantas fotos chegaram no dia atual.</li>
          <li><strong>Total</strong> — total acumulado.</li>
          <li>Data e hora da última foto recebida.</li>
        </ul>
        <p className="font-semibold mt-2">Filtros disponíveis:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><Search size={12} className="inline" /> Busca por nome de encarregado ou grupo.</li>
          <li>Atividade: <strong>Todos</strong>, <strong>Hoje</strong>, <strong>7 dias</strong>, <strong>30 dias</strong> ou <strong>Sem fotos</strong>.</li>
        </ul>
      </Secao>

      <Secao num={5} titulo="Editar e gerenciar um encarregado" icone={<Pencil size={18} />}>
        <p>
          No cartão do encarregado, passe o mouse e clique no ícone de <strong>lápis</strong> para
          abrir o diálogo de edição. Você pode:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Alterar o <strong>nome</strong> do encarregado.</li>
          <li>Trocar a <strong>foto</strong> do grupo.</li>
          <li><Archive size={12} className="inline" /> <strong>Arquivar</strong> o grupo — ele some do painel, mas o histórico fica preservado e pode ser reativado em <em>Grupos novos → Arquivados</em>.</li>
        </ul>
        <Dica tipo="alerta">
          Por segurança, a opção de exclusão definitiva de um grupo foi removida — use sempre o
          arquivamento.
        </Dica>
      </Secao>

      <Secao num={6} titulo="Navegar pelas pastas (meses e dias)" icone={<Calendar size={18} />}>
        <p>
          Clique em um cartão de encarregado para abrir as pastas. As fotos ficam agrupadas por{" "}
          <strong>mês</strong>, e dentro de cada mês aparecem ícones amarelos de pasta — um por{" "}
          <strong>dia</strong> em que houve envio.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Cada pasta mostra o número do dia, o dia da semana e a quantidade de fotos.</li>
          <li>Use os filtros no topo para selecionar <strong>ano</strong>, <strong>mês</strong> ou um <strong>dia</strong> específico.</li>
          <li>Clique na pasta para ver todas as fotos daquele dia em tela cheia.</li>
        </ul>
      </Secao>

      <Secao num={7} titulo="Visualizar as fotos de um dia" icone={<Camera size={18} />}>
        <p>Ao abrir um dia, você vê todas as fotos como miniaturas. Recursos disponíveis:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Buscar</strong> por legenda ou nome do remetente.</li>
          <li>Filtrar por <strong>remetente</strong> específico.</li>
          <li>Filtrar por <strong>faixa de horário</strong> (das __ até __).</li>
          <li>Alternar a ordem: mais antigas ou mais recentes primeiro.</li>
          <li>Clique em qualquer miniatura para ampliar e ver remetente, data/hora e legenda.</li>
        </ul>
      </Secao>

      <Secao num={8} titulo="Baixar fotos em lote (.zip)" icone={<Download size={18} />}>
        <p>Existem dois pontos onde você pode baixar fotos compactadas:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Na lista de pastas do encarregado</strong> — abaixo de cada pasta há o botão{" "}
            <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium">
              <Download size={11} /> Baixar pasta
            </span>{" "}
            que gera um <code>.zip</code> com todas as fotos daquele dia.
          </li>
          <li>
            <strong>Dentro da tela do dia</strong> — botão{" "}
            <span className="inline-flex items-center gap-1 rounded bg-primary text-primary-foreground px-1.5 py-0.5 text-xs font-medium">
              <Download size={11} /> Baixar todas (.zip)
            </span>{" "}
            que respeita os filtros aplicados (ex.: baixa só as fotos de um remetente).
          </li>
        </ul>
        <Dica tipo="info">
          Os arquivos no zip são nomeados como <code>001_HH-MM-SS_Remetente.jpg</code> para manter a
          ordem cronológica.
        </Dica>
      </Secao>

      <Secao num={9} titulo="Enviar foto manualmente" icone={<Upload size={18} />}>
        <p>
          Se um encarregado esqueceu de mandar pelo WhatsApp ou enviou pelo canal errado, você pode
          subir a foto manualmente:
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Abra o dia desejado.</li>
          <li>Clique em <strong>Enviar foto</strong> no topo direito.</li>
          <li>Selecione uma ou várias imagens — todas serão associadas ao encarregado e ao dia abertos, com remetente <em>“Upload manual”</em>.</li>
        </ol>
      </Secao>

      <Secao num={10} titulo="Excluir fotos" icone={<Trash2 size={18} />}>
        <p>
          Dentro da tela do dia, passe o mouse sobre uma miniatura e clique no ícone de lixeira no
          canto superior direito. Confirme a exclusão. A foto será removida tanto do banco quanto do
          armazenamento.
        </p>
        <Dica tipo="alerta">
          A exclusão é definitiva. Tenha certeza antes de confirmar — não há lixeira de recuperação.
        </Dica>
      </Secao>

      <Secao num={11} titulo="Alterar senha" icone={<KeyRound size={18} />}>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Saia do sistema (botão <strong>Sair</strong>) ou acesse a tela de login.</li>
          <li>Clique em <strong>Esqueci minha senha</strong>.</li>
          <li>Informe seu e-mail. Você receberá um link de redefinição.</li>
          <li>Abra o e-mail, clique no link e cadastre uma nova senha (mínimo de 6 caracteres).</li>
          <li>Será redirecionado automaticamente para o painel já autenticado.</li>
        </ol>
      </Secao>

      <Secao num={12} titulo="Boas práticas e dúvidas frequentes" icone={<BookOpen size={18} />}>
        <div className="space-y-3">
          <div>
            <p className="font-semibold">Mantenha um grupo por encarregado/frente de obra.</p>
            <p className="text-muted-foreground">
              Isso preserva a organização das pastas e evita misturar fotos de equipes diferentes.
            </p>
          </div>
          <div>
            <p className="font-semibold">Peça que o encarregado escreva uma legenda curta.</p>
            <p className="text-muted-foreground">
              A legenda é salva junto à foto e ajuda nas buscas posteriores (ex.: “Lançamento de
              concreto pilar P7”).
            </p>
          </div>
          <div>
            <p className="font-semibold">O bot ficou offline. E agora?</p>
            <p className="text-muted-foreground">
              Avise o administrador. Fotos enviadas durante o período offline não são capturadas
              automaticamente — nesses casos use o <strong>upload manual</strong> dentro do dia.
            </p>
          </div>
          <div>
            <p className="font-semibold">Posso renomear o encarregado a qualquer momento?</p>
            <p className="text-muted-foreground">
              Sim. A renomeação é só de exibição; o histórico continua intacto.
            </p>
          </div>
          <div>
            <p className="font-semibold">Um grupo antigo voltou a aparecer em “Grupos novos”.</p>
            <p className="text-muted-foreground">
              Isso acontece quando o grupo é excluído e recriado no WhatsApp, ou após sincronização
              forçada. Basta arquivar novamente ou reativar conforme o caso.
            </p>
          </div>
        </div>
      </Secao>

      <div className="text-center py-6 text-xs text-muted-foreground">
        Precisa de ajuda adicional? Fale com o administrador do sistema.
      </div>
    </div>
  );
}
