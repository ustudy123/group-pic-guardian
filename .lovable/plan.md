## Análise da reunião — Demanda

A Macro Ambiental (Artur + Isabela) descreveu o **Relatório de Vistoria Cautelar (RVC)** pré e pós-obra. Hoje usam um app externo (Coleton) só para foto com timestamp, exportam PDFs, abrem print por print no Word/Excel e montam manualmente o relatório (~1 semana, ~1.000 páginas por bairro).

**Pedidos da reunião:**

1. Vistoriante tira a foto **dentro do próprio sistema** (substituindo o Coleton), com carimbo automático de **data, hora e endereço** via GPS.
2. Organização por **contrato → bairro → rua**, com tipo (rua/casa), número da casa e lado (E/D) no pré-obra.
3. **Pré-obra:** fotos da rua + de cada casa. **Pós-obra:** só fotos da rua.
4. Na hora do pós, o vistoriante **vê a foto pré como referência** para repetir o mesmo ângulo.
5. **6 a 7 acessos do escritório** (analistas) + 4 vistoriantes de campo, com papéis distintos.
6. **Metadados salvos em banco** (data, hora, GPS, endereço) para permitir busca/filtro posterior.
7. **IA de conformidade** indicando ~80% de similaridade entre o par pré × pós.
8. **Checklist/resumo final** ao vistoriante: "tirei fotos de todas as casas e da rua, está tudo ok".
9. **Geração do PDF final** no formato do modelo (capa, sumário, objetivo, escopo, política, fotos pré × pós lado a lado por rua, conclusão).

---

## Diagnóstico — o que JÁ está implementado

Tudo o que segue está pronto no módulo `/painel/vistorias`:

- ✅ Tabelas `contratos`, `bairros`, `ruas`, `vistoria_atribuicoes`, `vistoria_fotos`, `vistoria_relatorios` com RLS por papel (admin / analista / vistoriante).
- ✅ Bucket privado `vistorias-fotos`.
- ✅ Cadastro de contrato → bairro → rua e atribuição do vistoriante (aba **Cadastros**).
- ✅ **Captura de foto pelo próprio sistema** (`FotoCaptura`), com:
  - GPS de alta acurácia + reverse geocoding (Nominatim).
  - Carimbo gráfico de data/hora/endereço sobre a imagem.
  - Upload de versão original + carimbada.
  - Metadados salvos no banco (`latitude`, `longitude`, `endereco_formatado`, `captured_at`, `exif`).
- ✅ **Pré-obra com tipo rua/casa, nº da casa e lado E/D**; pós-obra restrito a rua.
- ✅ **Referência visual da foto pré** durante a captura do pós (`refUrl` + `par_pre_id` ligando o par).
- ✅ Aprovação / rejeição por admin e analista; botões escondidos para vistoriante.
- ✅ Manual de uso integrado na tela.

---

## O que AINDA falta (pendências)

### 1. Geração do PDF final do RVC no formato do modelo  *(principal pendência)*
Hoje não existe rota para gerar o PDF. A tabela `vistoria_relatorios` existe mas está vazia. Precisamos:
- Botão **"Gerar relatório (PDF)"** por bairro (ou contrato) na aba Cadastros / detalhe do bairro, visível só para admin/analista.
- Server function que monta o PDF reproduzindo o modelo CT 018/BRISAMAR:
  - Capa com contrato, regional, município, responsável técnico, período, descrição.
  - Sumário, Objetivo, Escopo, Política da Qualidade, intro do Relatório Fotográfico.
  - Página separadora por bairro.
  - Por rua: bloco com nome + mapa, depois grade **Pré × Pós lado a lado** (apenas fotos com status `aprovada`).
  - Casas do pré-obra agrupadas com nº e lado.
  - Rodapé "Relatório de Vistoria Cautelar – Revisão 02" + paginação.
- Salvar PDF no bucket e registrar em `vistoria_relatorios`; listar/baixar versões anteriores.

### 2. Painel de progresso / checklist da rua para o vistoriante
Na lista "Minhas vistorias" hoje só aparece o nome da rua. Falta o resumo pedido pelo Artur:
- Por rua: contadores `pré rua / pré casas / pós rua` (capturadas vs aprovadas).
- Badge de status (Pendente / Em andamento / Concluída).
- Na tela da rua, lista de itens faltantes ("falta pós da foto X", "casa 1390 lado D sem foto").

### 3. Análise de IA de similaridade de ângulo (pré × pós)
Coluna `similaridade_angulo` já existe em `vistoria_fotos`, mas não é populada. Implementar:
- Após salvar uma foto de pós com `par_pre_id`, chamar um modelo de visão (via Lovable AI Gateway, Gemini) para retornar score 0–100.
- Mostrar badge na galeria: verde ≥80%, amarelo 60–80, vermelho <60.
- Permitir ao analista filtrar "pares com baixa similaridade".

### 4. Busca / filtro por metadados
Pedido do Alexandre na reunião ("dois cliques e aparece a foto de tal data/local"). Hoje não existe tela de busca. Criar visão **"Galeria de fotos"** para admin/analista com filtros por contrato, bairro, rua, intervalo de datas, status, fase, vistoriante.

### 5. Pequenos ajustes operacionais
- Mapa da rua: campo `bairros.mapa_url` existe mas não é exibido; mostrar no topo da página da rua e embutir no PDF.
- Dados do contrato (responsável técnico, CREA, período, escopo) já no schema; expor no formulário de cadastro de contrato e usar na capa do PDF.

---

## Plano de implementação proposto (em ordem de prioridade)

**Fase 1 — Conclusão funcional do fluxo (alta prioridade, maior valor)**
1. Painel de progresso por rua (checklist + contadores) na lista do vistoriante e no topo da rua.
2. Geração do PDF do RVC no formato do modelo + armazenamento e download em `vistoria_relatorios`.
3. Edição completa dos campos do contrato (resp. técnico, CREA, período, descrição, escopo) usados na capa do PDF.

**Fase 2 — Qualidade e produtividade do escritório**
4. Galeria/busca de fotos com filtros (admin/analista).
5. Exibição do mapa da rua (URL) na tela e no PDF.

**Fase 3 — IA**
6. Score de similaridade de ângulo pré × pós via Lovable AI Gateway, com badges e filtro de baixa similaridade.

---

## Detalhes técnicos

- **PDF:** usar `pdf-lib` (compatível com Cloudflare Workers, ao contrário de `puppeteer`/`sharp`); rodar em `createServerFn` para baixar as imagens do bucket via signed URL e compor as páginas. `jspdf` (já no projeto) também funciona, mas `pdf-lib` lida melhor com layouts multipágina e embed de JPEG.
- **Progresso:** estender `listMinhasRuas` para já retornar contadores por rua (1 query agregada em `vistoria_fotos`), evitando N+1 no front.
- **IA de similaridade:** chamar `google/gemini-2.5-flash` no Lovable AI Gateway com as duas imagens; gravar score em `similaridade_angulo` de forma assíncrona logo após o `saveFoto` do pós.
- **Busca:** rota `/painel/vistorias/galeria` (admin/analista), query parametrizada server-side.
- **Sem mudanças de schema obrigatórias** para Fase 1 e 2 — todas as colunas necessárias já existem.

Confirma se eu sigo nessa ordem (Fase 1 primeiro: progresso + PDF + campos do contrato) ou se prefere priorizar de outra forma.