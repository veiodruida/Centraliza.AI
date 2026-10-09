# Centraliza.ai v0.4.1 — UI 100% Responsiva

Esta versão torna o dashboard **à prova de redimensionamentos, tamanhos de janela e resoluções**: qualquer página agora se adapta desde 360px (telemóvel) até 2560px (monitores grandes), sem conteúdo cortado.

## ✨ Destaques
- **Números grandes nunca mais cortados**: na página Hardware (e Centralização), os valores de VRAM/RAM/armazenamento usam tipografia fluida (`clamp()`) — encolhem para caber no card em janelas estreitas e crescem em monitores grandes, sempre visíveis por inteiro.
- **Layout raiz dinâmico**: altura `100dvh` (correta em browsers mobile), sidebar com largura adaptativa (`lg:64 · xl:72 · 2xl:80`), `min-width:0` no conteúdo principal para nunca estourar.
- **Hub de Modelos reordenado**: a barra de filtros/pesquisa/ordenação só fica em linha a partir de ecrãs `2xl`; abaixo disso empilha com `flex-wrap` — o overflow da barra de filtros em 1280px foi eliminado.
- **Chat (ModelTester)**: sidebar mais estreita em `lg` e header do chat sem overflow a 1024px; nome do modelo com `title` (tooltip) quando truncado.
- **Headers e cards resilientes**: secções de modelos, badges, botões (`btn-premium` sem `min-width` rígido), modal de eliminação (largura limitada + scroll) e tooltips de ajuda (nunca saem do viewport) — todos com wrap/ellipsis corretos.

## 🛠️ Correções e melhorias
- Grades de estatísticas do Hardware empilham em coluna única no intervalo `xl` (1280–1535px) para os números manterem tamanho legível.
- Título do card "Explorar & Orquestrar" do Dashboard com tipografia fluida — deixou de estourar entre 1280px e 1920px.
- Caminhos de ficheiro na Centralização com largura mínima legível (o badge de origem quebra para a linha seguinte).
- Testes automatizados de regressão visual (Playwright) adicionados em `scripts/` (`resp-scan`, `resp-verify`, `resp-resize`, `resp-debug`, `final-shots`).

## 🧪 Testes
- **Validação Playwright**: 9 páginas × 13 viewports (360×640, 414×896, 500×700, 640×480, 768×1024, 820×1180, 1024×768, 1100×700, 1280×800, 1366×768, 1440×900, 1920×1080, 2560×1440) — **zero** overflow horizontal, **zero** número cortado, **zero** texto cortado sem tooltip.
- **Redimensionamento ao vivo**: arrastar a janela 1920→360→1920 em todas as páginas — limpo.
- 8 testes unitários do frontend + 6 do servidor; build `tsc + vite` sem erros.

---
*Centraliza.ai — O seu orquestrador de IA Local.*
