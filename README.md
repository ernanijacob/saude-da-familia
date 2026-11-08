# Saúde da Família

Aplicativo web responsivo e instalável (PWA) para organizar turnos, remédios e medições. A autenticação e a sincronização familiar usam Supabase Auth e Postgres. Cada familiar cria sua própria conta; o administrador compartilha um código para associar as contas ao mesmo espaço familiar.

## Configurar Supabase

Siga o guia completo em [SUPABASE.md](SUPABASE.md): crie um projeto Supabase, execute `supabase-schema.sql` no SQL Editor e informe a URL e a chave publicável em `supabase-config.js`. Nunca coloque uma chave `service_role` no app.

O administrador inicial é a primeira pessoa que cria um espaço sem código de convite. Os próximos familiares devem criar suas contas usando o código exibido em **Configurações → Espaço familiar**. O Supabase Auth gerencia senhas e redefinição por e-mail. Os registros da família ficam no banco remoto e são protegidos por políticas de acesso por família.

## Executar no Windows

Depois de configurar o Supabase, abra o PowerShell nesta pasta e rode `.\start-server.ps1`. O servidor tenta a porta 8000 e, se estiver ocupada, escolhe a próxima porta disponível até 8010. Para parar, pressione Ctrl+C ou abra outra janela do PowerShell nesta pasta e execute `.\stop-server.ps1`. O iniciador usa componentes incluídos no Windows e não precisa de Node.js ou Python.

Para publicar na internet, conecte o repositório GitHub a um host de site estático, como Cloudflare Pages ou Netlify, e cadastre o domínio de produção em Supabase → Authentication → URL Configuration. O site precisa usar HTTPS para instalação PWA e autenticação funcionar corretamente.

## Recursos

- Cadastro, login e redefinição de senha por e-mail via Supabase Auth.
- Perfis de administrador e usuário, com membros associados a um espaço familiar por código.
- Calendário mensal com turnos diurno e noturno e exportação PNG.
- Cadastro de pessoas e remédios, acompanhamento de doses e medições de pressão e glicemia.
- Gráficos mensais, tema claro/escuro e exportação/importação JSON completa.
- Sincronização dos registros da família em tempo real entre dispositivos autenticados.
- Layout adaptável a celular e desktop; arquivos da interface podem ficar em cache, mas login, banco e sincronização precisam de internet.

## Dados antigos do navegador

O login local antigo não é convertido em uma conta Supabase, e senhas locais não são migradas. Antes de trocar de versão, exporte os dados usando o app antigo. Depois de configurar o Supabase, entre na nova versão e importe o arquivo em **Configurações → Backup da família**. O backup não transfere contas nem senhas: cada pessoa precisa criar sua conta Supabase.

Backups e imagens podem conter informações de saúde. Guarde-os com cuidado.
