# Eventos de Axé

Plataforma única para gestão de eventos, RSVP, contas, convites e permissões.

## Navegação

- `/` — página inicial;
- `#/login` — login;
- `#/admin` — painel da administradora global;
- `#/eventos` — eventos disponíveis para a conta;
- `#/evento/<slug>` — dashboard temático do evento;
- `/eventos/<slug>/` — página pública de cada evento.

As telas internas são carregadas pelo único `index.html`. Os subdiretórios em `eventos/` são mini projetos públicos, com identidade própria e um dashboard do mesmo evento.

## Publicação

1. Publique `backend/Codigo.gs` como Web App no Google Apps Script.
2. Execute `configureEventosDeAxe(ID_DA_PLANILHA, URL_PUBLICA_DO_SITE)`.
3. Atualize `assets/js/config.js` com a URL `/exec` da implantação.
4. Publique esta pasta no GitHub Pages.

Ao alterar o backend, crie uma nova versão da implantação do Apps Script. Ao alterar páginas, CSS ou JS, envie as alterações ao repositório GitHub.
