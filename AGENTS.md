# Regras do Projeto — Saúde da Família

## Versionamento do Aplicativo

- **Regra obrigatória:** incremente a informação da versão do aplicativo **a cada commit**.
- **Onde atualizar:** constante `APP_VERSION` na primeira linha do arquivo `app.js` (exibida em *Configurações > Sobre o aplicativo*).
- **Formato sequencial:** siga a numeração sequencial `MAJOR.MINOR`, incrementando o número após o ponto de `1` em `1` a cada commit:
  - Exemplo: `"1.0"` → `"1.1"` → `"1.2"` → `"1.3"` → ... → `"1.9"` → `"1.10"` → `"1.11"`.
  - Caso `APP_VERSION` esteja no formato `"1.0.0"`, no próximo commit atualize para `"1.1"` e siga a sequência a partir daí.
- **Service Worker (`sw.js`):** sempre que houver alteração em arquivos cacheados (`index.html`, `styles.css`, `app.js`, etc.), incremente também o sufixo da constante `CACHE` em `sw.js` (ex.: `saude-familia-v39` → `saude-familia-v40`) para evitar cache antigo no PWA.

## Mensagem de Commit

- **Sugestão obrigatória:** após realizar alterações no código, apresente ao usuário uma sugestão de mensagem resumida para o commit descrevendo o que foi alterado (ex.: `feat: ajusta filtro de medições` ou `fix: corrige sincronização de doses`).
