## Entendimento da demanda (reunião + anexo 3)

A Macro Ambiental precisa entregar à AEGEA o **Relatório de Vistoria Cautelar (RVC) — Pré e Pós-obra**. Hoje o vistoriante usa um app externo (Coletor) que carimba data/hora/endereço na foto; o escritório depois passa quase uma semana montando manualmente um Word/PDF de até ~1000 páginas, comparando lado a lado "antes" e "depois". Os problemas centrais:

1. Vistoriante **não tem referência da foto do pré-obra** quando volta pro pós, e acaba tirando em ângulo/local diferente.
2. Montar o relatório no Word é manual: print do app, colar pré ao lado do pós, repetir por casa/rua/bairro.
3. Não há rastreabilidade dos metadados (EXIF, GPS, hora) no sistema.

O modelo (CT 018/2025 — Brisamar) mostra o formato final: cabeçalho AEGEA, capa do bairro, mapa da rua, e em cada página um par **PRÉ / PÓS** com o carimbo "31 de mai. de 2025, 09:27:11 — Avenida Francisco Assumpção de Carvalho, 1390 — Jd Guadalajara — Vila Velha ES — 29108-021 — Brasil".

Hierarquia de dados confirmada: **Contrato → Bairro → Rua → (Trecho da rua + Casas numeradas com lado E/D)**. Pré-obra exige fotos da rua **e** de cada casa; pós-obra exige só a rua.

---

## Escopo do que vou construir

Um novo módulo dentro do sistema atual (TanStack Start + Supabase), com duas faces:

- **App de campo** (`/painel/vistorias` em layout mobile-first, instalável como PWA) — usado pelo vistoriante no celular.
- **Painel de escritório** (mesmas rotas, layout desktop) — usado pelos 6-7 analistas para revisar, aprovar e exportar.

Tudo dentro do projeto existente, mesma auth, mesmo header. Sem mexer no fluxo WhatsApp já existente.

### 1. App de campo (mobile)

- Login pelo Supabase já existente.
- Tela "Minhas vistorias" lista os trabalhos atribuídos (Contrato → Bairro → Rua).
- Dentro da rua, dois modos: **Pré-obra** e **Pós-obra**.
- **Captura de foto**:
  - Abre `<input type="file" capture="environment">` (câmera nativa do celular).
  - Lê `navigator.geolocation` no mesmo instante → grava lat/long.
  - Faz reverse geocoding (Nominatim/OpenStreetMap, gratuito) → endereço formatado igual ao modelo AEGEA.
  - Renderiza um **carimbo overlay** em canvas (data/hora/endereço) e salva a foto já carimbada no Storage, além de guardar a original + metadados separados.
  - Tipo de foto: `rua` ou `casa` (com nº e lado E/D).
- **Modo Pós-obra com referência**:
  - Lista cada foto pré-obra da rua como "alvo".
  - Ao tocar em uma, exibe a foto pré-obra **fantasma (semi-transparente)** sobre a câmera ao vivo, ajudando a alinhar o ângulo.
  - Mostra também a distância em metros entre a posição atual do GPS e a posição da foto pré, alertando se >15 m.
  - Salva o pós-obra **vinculado** à foto pré correspondente (par 1:1).
- **Offline-first**: fila local (IndexedDB) com upload em background quando voltar a ter sinal.

### 2. Painel de escritório (desktop)

- Lista de contratos / bairros / ruas com progresso (% pré, % pós, % pares aprovados).
- Visualizador lado-a-lado de cada par pré/pós, com botões Aprovar / Rejeitar / Pedir refoto.
- (Já preparado p/ IA futura) campo `similaridade_angulo` reservado no schema, mas a IA fica fora deste plano.
- Botão **Gerar relatório RVC** que monta o PDF no mesmo layout do anexo 3 (capa do contrato, capa do bairro, mapa da rua, páginas pré/pós com carimbo, paginação "Relatório de Vistoria Cautelar – Revisão 02 X/Y").

### 3. Banco de dados (novas tabelas)

- `contratos` (numero, descricao, regional, municipio, responsavel_tecnico, periodo, ativo)
- `bairros` (contrato_id, nome, mapa_url)
- `ruas` (bairro_id, nome, ordem)
- `vistorias_atribuicoes` (rua_id, vistoriante_id, fase: pre|pos)
- `vistoria_fotos` (rua_id, fase, tipo: rua|casa, numero_casa, lado: E|D, latitude, longitude, endereco_formatado, captured_at, storage_path_original, storage_path_carimbada, exif jsonb, par_pre_id nullable, status: pendente|aprovada|rejeitada, observacao)
- `vistoria_relatorios` (contrato_id, bairro_id, gerado_em, gerado_por, pdf_url, revisao)
- Roles novas: `vistoriante`, `analista` (na `app_role` existente), com policies RLS:
  - vistoriante: insere/lê fotos das ruas atribuídas a ele;
  - analista: lê tudo, aprova/rejeita;
  - admin: tudo.
- Bucket Storage novo: `vistorias-fotos` (privado), com policies por rua/role.

### 4. Geração do PDF (relatório RVC)

- Server function que monta o PDF usando `@react-pdf/renderer` (já compatível com workers).
- Template fiel ao anexo 3: cabeçalho com logo AEGEA + Ambiental Vila Velha, rodapé "Relatório de Vistoria Cautelar – Revisão 02 X/Y", capa do bairro, página de mapa da rua, e grid 2 colunas (PRÉ | PÓS) com 3 pares por página + carimbo embaixo de cada foto.
- Upload do PDF final no bucket `vistorias-relatorios` e link na lista do escritório.

### 5. Navegação / integração com o que já existe

- Novo item no header do `/painel`: **Vistorias** (visível pra `vistoriante`, `analista`, `admin`).
- `/painel/admin` ganha aba "Atribuir vistoriantes a ruas".
- Nada do fluxo WhatsApp/Encarregados é alterado.

---

## Detalhes técnicos

- **Stack**: TanStack Start (já em uso), createServerFn + requireSupabaseAuth para tudo que toca DB.
- **Câmera**: `<input type="file" accept="image/*" capture="environment">` (funciona em iOS Safari e Android Chrome sem app nativo). Carimbo aplicado em `<canvas>` antes do upload (texto branco com sombra preta, igual ao Coletor/anexo 3).
- **GPS**: `navigator.geolocation.getCurrentPosition` com `enableHighAccuracy: true, timeout 15s`. Se falhar, força usuário a digitar endereço manual antes de salvar.
- **Reverse geocoding**: Nominatim (gratuito, sem chave) chamado server-side via createServerFn pra respeitar rate-limit; cache por bbox de 10m por 24h.
- **PWA**: adiciona `manifest.webmanifest` + service worker (Workbox) só pra essa rota, pra permitir "Adicionar à tela inicial" e funcionar offline.
- **Fila offline**: IndexedDB via `idb` lib; sync ao detectar `online` event.
- **PDF**: `@react-pdf/renderer` renderizado em server function, streamado pro browser e salvo no Storage.
- **Permissões**: novas roles adicionadas ao enum `app_role` (`vistoriante`, `analista`), todas as tabelas novas com RLS scoped por `has_role` + atribuição.

```text
/painel
 ├─ /vistorias                 (lista de contratos/ruas do usuário)
 │   ├─ /:ruaId/pre            (captura pré-obra)
 │   ├─ /:ruaId/pos            (captura pós-obra com referência)
 │   └─ /:ruaId/revisar        (analista: aprova pares)
 ├─ /vistorias/relatorios      (gerar/baixar PDFs)
 └─ /admin/vistorias           (atribuir vistoriantes, criar contratos)
```

---

## Fora do escopo deste plano (próximas iterações)

- IA de similaridade de ângulo (80% compatível) — schema já preparado, mas implementação fica pra fase 2.
- Importação automática dos relatórios antigos do Coletor.
- App nativo (iOS/Android) — começamos com PWA, que cobre 100% do caso de uso descrito.

---

## Antes de começar a implementar, preciso confirmar 2 coisas:

1. **Cadastro inicial de contratos/bairros/ruas**: começo permitindo o admin cadastrar manualmente pelo painel.
2. usar só o logo da Macro Ambiental nesta primeira versão?