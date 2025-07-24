# Bot de Música para Discord

## Como usar

1. Crie um arquivo `.env` na raiz do projeto com o conteúdo:
   ```
   DISCORD_TOKEN=SEU_TOKEN_AQUI
   ```
2. Instale as dependências:
   ```
   npm install
   ```
3. Inicie o bot:
   ```
   node index.js
   ```

## Comandos planejados
- `/play <link ou nome>`
- `/skip`
- `/pause`
- `/stop`
- `/volume <0-100>`
- `/queue`
- `/nowplaying`
- `/shuffle`

O bot suporta links e playlists do YouTube e Spotify. 