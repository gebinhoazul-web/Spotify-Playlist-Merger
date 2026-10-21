# 🎧 Playlist Merger

Ferramenta web para **juntar várias playlists do Spotify em uma só**.
Antes de criar, você pode **desmarcar músicas** que não quer e **adicionar músicas extras** pela busca.

Roda direto no navegador (sem servidor, sem instalar nada). Funciona bem no GitHub Pages.

## Como funciona

1. Você faz login com o Spotify.
2. Marca as playlists que quer juntar.
3. O site mostra todas as músicas (sem duplicadas). Você desmarca as que não quer.
4. Busca e adiciona músicas extras, se quiser.
5. Dá um nome e clica em **Criar playlist**.

## Passo a passo para colocar no ar (sem programar)

### 1. Criar o repositório no GitHub
1. Entre em [github.com](https://github.com) e clique em **New repository** (botão verde, ou o "+" no canto superior).
2. Nome sugerido: `playlist-merger`. Marque **Public**. Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Arraste para lá os 4 arquivos: `index.html`, `style.css`, `app.js` e `README.md`.
5. Clique em **Commit changes**.

### 2. Ativar o GitHub Pages (para o site ficar online)
1. No repositório, vá em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**; em **Branch**, escolha `main` e a pasta `/ (root)`. Salve.
3. Espere cerca de 1 minuto. O endereço será algo como:
   `https://SEU-USUARIO.github.io/playlist-merger/`

### 3. Criar o app no Spotify
1. Acesse [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) e clique em **Create app**.
2. Preencha nome e descrição como quiser.
3. Em **Redirect URIs**, cole o endereço do seu site **exatamente igual** (com a barra no final), por exemplo:
   `https://SEU-USUARIO.github.io/playlist-merger/`
4. Em "Which API/SDKs are you planning to use?", marque **Web API**. Salve.
5. Abra **Settings** do app e copie o **Client ID**.
6. Ainda em Settings, na aba **User Management**, adicione o nome e o e-mail da sua conta Spotify (e de quem mais for usar).

### 4. Usar
Abra o endereço do seu site, cole o Client ID e clique em **Entrar com Spotify**. O Client ID fica salvo só no seu navegador.

## ⚠️ Limitações do Spotify (importante)

Desde fevereiro/março de 2026, o Spotify restringiu apps em **Development Mode** (o modo padrão de quem acabou de criar um app). Pelo que consegui apurar em documentação e discussões de desenvolvedores:

- A conta dona do app precisa ser **Spotify Premium**.
- Só quem está na lista de usuários do app consegue usar, e a lista é pequena (cerca de 5 pessoas).
- Playlists que não são suas (nem colaborativas) podem não devolver as músicas. Se isso acontecer, o site avisa. Uma saída é salvar/duplicar essa playlist na sua conta antes.
- Playlists geradas pelo Spotify (como "Descobertas da Semana") costumam não ser legíveis pela API.
- Há relatos de erro `403` ao criar playlists em apps nesse modo. Se acontecer com você, o Spotify pode estar bloqueando a ação para o seu app; vale perguntar na [comunidade de desenvolvedores do Spotify](https://community.spotify.com/t5/Spotify-for-Developers/bd-p/Spotify_Developer).
- As músicas são adicionadas em lotes pequenos (10 por vez), então playlists grandes levam um tempinho.

Essas regras mudam com frequência. Se algo quebrar, confira a [documentação oficial](https://developer.spotify.com/documentation/web-api).

## Ajustes simples

- Se aparecer erro ao adicionar músicas, abra `app.js` e diminua o número em `const ADD_CHUNK = 10;`.

## Privacidade

Nada é enviado para servidores meus ou de terceiros: o site conversa só com o Spotify, direto do seu navegador. O login usa o fluxo PKCE, então não há "client secret" no código.
