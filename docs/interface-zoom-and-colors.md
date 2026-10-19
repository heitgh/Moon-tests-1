# Moon Browser — zoom e wallpaper (0.1.2)

Nexus Inc. · 19/10/2026

- Ctrl++ ou Ctrl+= aumenta o **site ativo**; Ctrl+- diminui; Ctrl+0 restaura o site para 100%. Teclado numérico também funciona. Na Home interna esses comandos não redimensionam a UI.
- Ctrl + roda do mouse para cima aumenta a **UI**; para baixo diminui. O gesto nativo do Electron é tratado na janela e nas páginas sem alterar o zoom do site. O menu Visualizar também ajusta o site ativo.
- A barra de título nativa foi removida. Os controles de janela ficam nas guias. Arraste a região livre da linha das guias para mover a janela; os botões continuam interativos.
- Wallpaper contínuo até as guias, ativado por padrão inclusive em configurações antigas. Pode ser desativado em Aparência → Wallpaper. Mantém os filtros, posicionamento, fontes local/HTTPS validado, cor e gradiente.
- Configurações por workspace, preview/cancelamento e cores independentes permanecem disponíveis.

Validação local: TypeScript, lint, 59 testes unitários, 18 testes de integração e compilação passaram. A CI executa os testes Electron e o novo teste de regressão com página HTTP local para separar zoom do site e da interface.

A instalação do Windows permanece por usuário e há versão portátil. A sessão de desenvolvimento é Linux; o navegador instalado no Windows do usuário não foi controlado.
