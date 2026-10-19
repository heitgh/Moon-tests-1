# Moon Browser — interface recuperável

Nexus Inc. · 19/10/2026

## Uso

- `Ctrl+-`: diminuir a interface.
- `Ctrl++` ou `Ctrl+=`: aumentar (também no teclado numérico).
- `Ctrl+0`: restaurar 100%. No macOS, usar Command.
- O menu **Visualizar** também permite aumentar, diminuir e restaurar.
- A escala nativa fica entre 50% e 200%. O zoom das páginas não é alterado por esses comandos.
- Em **Personalização → Essencial → Aparência rápida**, ajustar barra de guias, guia ativa, barra de navegação, fundo e texto dos atalhos. Confirmar em **Aplicar mudanças**. Os controles também aparecem no editor avançado; temas antigos recebem valores compatíveis.

## Windows e permissões

O instalador NSIS instala por usuário, sem elevação; há também um executável portátil. Não remove políticas da escola ou bloqueios de aplicações definidos pela organização. Não foi fornecida mensagem específica para os problemas de administração, portanto outras causas permanecem sem diagnóstico.

## Validação e limitações

TypeScript, lint, 56 testes unitários e 17 testes de integração passaram. Foram adicionadas regressões para aumento após redução, teclas de layouts diferentes, redirecionamento da página para a interface e migração de cores.

REA 6.7.0 foi instalado separadamente e executado contra uma cópia estável do código. A análise foi bloqueada pelo ambiente: o `ps` disponível falha com `fatal library error, lookup self`, impedindo a verificação de propriedade dos processos exigida pelo REA. Nenhuma análise nativa do Vivaldi foi concluída.

Este ambiente é Linux e não tem acesso ao atalho `C:\Users\aluno\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Vivaldi.lnk`. As mudanças são do Moon em `heitgh/Moon-tests-1`. Não modificam o Vivaldi nem seu repositório original. Não há validação visual ou execução manual do binário Windows nesta sessão.

O workflow **Windows download** gera NSIS e portátil e publica um pré-lançamento neste repositório apenas após os checks e o empacotamento concluírem. A existência do workflow não significa que o download já foi produzido; conferir seu resultado em Actions/Releases.
