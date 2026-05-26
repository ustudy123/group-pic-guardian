import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Camera,
  MapPin,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Users,
  AlertTriangle,
} from "lucide-react";

export function VistoriasManual() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/40 transition"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BookOpen size={18} />
          </div>
          <div>
            <div className="font-bold">Como usar — Manual de Vistorias</div>
            <div className="text-xs text-muted-foreground">
              Passo a passo para vistoriantes, analistas e administradores
            </div>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-6 pt-2 space-y-6 border-t bg-muted/20">
          {/* O que é */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              O que é
            </h3>
            <p className="text-sm leading-relaxed">
              O <strong>Relatório de Vistoria Cautelar (RVC)</strong> registra o
              estado de cada rua <strong>antes</strong> e <strong>depois</strong> da
              obra. Para cada ponto fotografado é necessário ter um par{" "}
              <strong>pré-obra</strong> e <strong>pós-obra</strong>, sempre no mesmo
              ângulo, com <strong>GPS, data, hora e endereço</strong> carimbados
              automaticamente na imagem.
            </p>
          </section>

          {/* Papéis */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users size={14} /> Quem faz o quê
            </h3>
            <ul className="text-sm space-y-2">
              <li className="flex gap-2">
                <span className="font-semibold min-w-28">Vistoriante:</span>
                <span>
                  vai a campo e tira as fotos pelo app. Só vê as ruas que foram
                  atribuídas a ele.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold min-w-28">Analista:</span>
                <span>
                  revisa, aprova ou rejeita as fotos no escritório antes de
                  entrarem no relatório.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold min-w-28">Administrador:</span>
                <span>
                  cadastra contratos, bairros e ruas, e atribui as ruas aos
                  vistoriantes. Também pode aprovar/rejeitar.
                </span>
              </li>
            </ul>
          </section>

          {/* Passo a passo vistoriante */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Camera size={14} /> Passo a passo — Vistoriante
            </h3>
            <ol className="text-sm space-y-2 list-decimal pl-5">
              <li>
                Abra o menu <strong>Vistorias</strong> e toque na aba{" "}
                <strong>Minhas vistorias</strong>. Você verá apenas as ruas
                atribuídas a você, agrupadas por contrato e bairro.
              </li>
              <li>
                Toque na <strong>rua</strong> que vai vistoriar.
              </li>
              <li>
                Escolha a fase: <strong>Pré-obra</strong> (antes) ou{" "}
                <strong>Pós-obra</strong> (depois).
              </li>
              <li>
                Toque em <strong>Tirar foto</strong>. Permita o acesso à{" "}
                <strong>câmera</strong> e à <strong>localização (GPS)</strong>{" "}
                quando o navegador pedir — sem isso o carimbo não funciona.
              </li>
              <li>
                Enquadre o ponto e bata a foto. O app gera automaticamente uma
                versão <strong>carimbada</strong> com endereço, data, hora e
                coordenadas.
              </li>
              <li>
                Para a foto de <strong>pós-obra</strong>, repita exatamente o
                mesmo ângulo da foto pré, no mesmo ponto da rua. O par fica
                ligado no relatório.
              </li>
              <li>
                Pronto! A foto é enviada com status <strong>Pendente</strong>{" "}
                até o analista revisar.
              </li>
            </ol>
          </section>

          {/* Aprovação */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <CheckCircle2 size={14} /> Aprovação — Analista / Admin
            </h3>
            <ol className="text-sm space-y-2 list-decimal pl-5">
              <li>
                Abra a rua e revise cada par <strong>Pré × Pós</strong>.
              </li>
              <li>
                Verifique se a foto está <strong>nítida</strong>, no{" "}
                <strong>ângulo certo</strong>, com o carimbo legível e GPS
                coerente.
              </li>
              <li>
                Clique em <strong>Aprovar</strong> para liberar a foto para o
                relatório, ou <strong>Rejeitar</strong> para pedir nova captura.
              </li>
              <li>
                Fotos rejeitadas devem ser refeitas pelo vistoriante e
                reenviadas.
              </li>
            </ol>
          </section>

          {/* Cadastros */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText size={14} /> Cadastros — Administrador
            </h3>
            <ol className="text-sm space-y-2 list-decimal pl-5">
              <li>
                Acesse a aba <strong>Cadastros</strong>.
              </li>
              <li>
                Cadastre o <strong>Contrato</strong> (número, regional, município,
                responsável técnico, período).
              </li>
              <li>
                Dentro do contrato, cadastre os <strong>Bairros</strong>.
              </li>
              <li>
                Dentro de cada bairro, cadastre as <strong>Ruas</strong>.
              </li>
              <li>
                Para cada rua, <strong>atribua o vistoriante</strong> responsável.
                Só assim ela aparece na lista dele.
              </li>
            </ol>
          </section>

          {/* Boas práticas */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShieldCheck size={14} /> Boas práticas na captura
            </h3>
            <ul className="text-sm space-y-1.5 list-disc pl-5">
              <li>Tire as fotos com boa iluminação, evite contraluz.</li>
              <li>
                Mantenha o celular na <strong>horizontal</strong> sempre que
                possível.
              </li>
              <li>
                Use pontos de referência fixos (postes, esquinas, números) para
                replicar o ângulo no pós-obra.
              </li>
              <li>
                Aguarde o GPS estabilizar antes de bater a foto — endereço errado
                invalida o registro.
              </li>
              <li>Não edite, recorte nem use filtros nas imagens.</li>
            </ul>
          </section>

          {/* Problemas comuns */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <AlertTriangle size={14} /> Problemas comuns
            </h3>
            <ul className="text-sm space-y-1.5 list-disc pl-5">
              <li>
                <strong>“Nenhuma rua atribuída”</strong>: peça ao administrador
                para te atribuir na aba Cadastros.
              </li>
              <li>
                <strong>Câmera não abre</strong>: verifique a permissão de câmera
                no navegador (cadeado na barra de endereço).
              </li>
              <li>
                <strong>Endereço em branco</strong>: ative o GPS / localização e
                tente novamente em área aberta.
              </li>
              <li>
                <strong>Foto rejeitada</strong>: leia a observação do analista,
                refaça no mesmo ponto e reenvie.
              </li>
            </ul>
          </section>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <MapPin size={12} /> Toda foto enviada fica registrada com autor, GPS,
            data e hora — não pode ser alterada depois.
          </div>
        </div>
      )}
    </div>
  );
}
