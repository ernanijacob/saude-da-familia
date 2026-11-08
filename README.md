# Saúde da Família

Aplicativo web responsivo e instalável (PWA) para organizar turnos, remédios e medições. Abre no navegador em Windows e Android e pode ser instalado pela opção do navegador. Funciona sem servidor e guarda os dados no armazenamento local do navegador.

## Executar no Windows

Abra o PowerShell nesta pasta e rode `.\start-server.ps1`. O servidor tenta a porta 8000 e, se estiver ocupada, escolhe a próxima porta disponível até 8010. Para parar, pressione Ctrl+C ou abra outra janela do PowerShell nesta pasta e execute `.\stop-server.ps1`. O iniciador usa componentes incluídos no Windows e não precisa de Node.js ou Python.

HTTPS é necessário para instalar o PWA em outros endereços; `localhost` é considerado seguro pelos navegadores. Não abra diretamente por `file://`, pois o armazenamento offline e o service worker dependem de HTTP.

## Recursos

- Cadastro local, perfis de administrador e usuário, entrada e redefinição local de senha.
- Calendário mensal com turnos diurno e noturno e exportação PNG.
- Cadastro de pessoas e remédios, acompanhamento de doses e medições de pressão e glicemia.
- Gráficos mensais, tema claro/escuro e exportação/importação JSON completa.
- Layout adaptável a celular e desktop; cache de arquivos para uso offline após a primeira abertura.

## Limites desta versão

Esta é uma versão funcional local, sem serviço de nuvem. Contas, autenticação, perfis e dados vivem somente neste navegador/dispositivo; redefinição de senha é local, não envia e-mail; permissões não substituem controle de acesso de servidor. Para sincronizar com segurança entre pessoas/dispositivos, publique com backend autenticado e banco compartilhado. Imagens compartilhadas e arquivos de backup podem conter informações de saúde.
