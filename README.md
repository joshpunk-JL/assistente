# Assistente

App pessoal (Hoje, Compromissos, Agenda, Tarefas, Notas, Finanças). Página estática: **não contém dados nem token**.
Os dados ficam no repositório privado `assistente-dados` (arquivo `dados.json`), lidos e gravados pelo navegador via API do GitHub com um token que fica só no aparelho (localStorage).

## Token (uma vez por aparelho)
GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token:
repositório somente `assistente-dados`, permissão *Contents: Read and write*, com validade. Cole na tela de entrada do app.
