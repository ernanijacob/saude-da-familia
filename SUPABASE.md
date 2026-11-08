# Configuração do Supabase

## 1. Criar o projeto

1. Crie um projeto no painel do Supabase e guarde com segurança a senha do banco.
2. Em **Project Settings → API**, copie a **Project URL** e a chave **publishable** (ou a chave `anon` legada).
3. Abra `supabase-config.js` e substitua os dois valores de exemplo. Essa chave pública pode ficar no frontend; não use a chave `service_role`.

## 2. Criar tabelas, funções e políticas

1. No painel, abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `supabase-schema.sql` e execute uma vez.
3. Confirme que a execução terminou sem erros e que as tabelas `families`, `family_members`, `profiles` e `family_data` foram criadas.

O script ativa RLS, limita cada espaço familiar aos próprios membros e mantém a alteração de perfis e dados administrativos em funções SQL verificadas no servidor. Não remova essas políticas.

## 3. Ajustar autenticação por e-mail

Em **Authentication → URL Configuration**, defina:

- **Site URL** para o endereço HTTPS onde o app será publicado (durante desenvolvimento, `http://localhost:8000`).
- **Redirect URLs** para o endereço do app, incluindo `http://localhost:8000/**` no desenvolvimento e `https://seu-dominio/**` em produção.

Em **Authentication → Providers → Email**, habilite e configure confirmação de e-mail. Em produção, configure um provedor SMTP próprio em **Project Settings → Authentication → SMTP Settings** para que os links de confirmação e recuperação cheguem de forma confiável.

## 4. Primeiro acesso e novos membros

1. Abra o app via HTTPS (ou `localhost`) e crie a primeira conta sem informar código. Essa conta cria o espaço familiar e recebe perfil de administrador.
2. Abra **Configurações → Espaço familiar** e copie o código de acesso.
3. Cada familiar cria uma conta com seu próprio e-mail e informa esse código. A conta entra como usuário.
4. O administrador pode alterar perfis em **Contas e permissões**.

O código de acesso concede entrada à família. Compartilhe-o apenas com pessoas autorizadas. A política do banco impede a leitura dos registros de outras famílias.

## 5. Dados locais da versão anterior

Antes de trocar a versão, exporte o backup completo no app local antigo. No novo app, já autenticado, use **Configurações → Backup da família → Importar backup**. O backup transfere os registros, mas não contas e senhas antigas; cada familiar deve cadastrar sua própria conta no Supabase.

## Limites e cuidados

- O frontend usa uma única linha JSON por família; os membros veem e editam os mesmos registros compartilhados.
- Dados de saúde são sensíveis. Restrinja quem pode entrar, não publique o código de convite e proteja os backups exportados.
- Este projeto não configura nem cria o projeto Supabase automaticamente. As etapas do painel acima são necessárias antes que o login e a sincronização funcionem.
