require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const playdl = require('play-dl');

playdl.setToken({
  spotify: {
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    refresh_token: ''
  }
});

(async () => {
  await playdl.setCookie('./cookies.txt');
})();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Registro do comando /play ao iniciar
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Toca uma música do YouTube ou Spotify')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Link ou nome da música')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Pula a música atual'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Para a música e limpa a fila'),
  new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa a música atual'),
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Retoma a música pausada'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume da música')
    .addIntegerOption(option =>
      option.setName('valor')
        .setDescription('Volume de 1 a 100')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Mostra a fila de músicas'),
  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Mostra a música atual')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Fila de músicas por guilda
const queue = new Map();

async function playSong(guildId, interaction) {
  const serverQueue = queue.get(guildId);
  if (!serverQueue || !serverQueue.songs.length) {
    serverQueue?.player?.stop();
    queue.delete(guildId);
    return;
  }
  const song = serverQueue.songs[0];
  let stream;
  try {
    if (song.type === 'yt') {
      stream = await playdl.stream(song.url, { quality: 2 });
    } else if (song.type === 'sp') {
      // Converter Spotify para YouTube
      const yt = await playdl.search(`${song.title} ${song.artist}`, { limit: 1 });
      if (!yt[0]) throw new Error('Não encontrado no YouTube');
      stream = await playdl.stream(yt[0].url, { quality: 2 });
      song.url = yt[0].url;
    }
  } catch (e) {
    await interaction.followUp('Erro ao obter stream de áudio. Pulando música.');
    serverQueue.songs.shift();
    return playSong(guildId, interaction);
  }
  const resource = createAudioResource(stream.stream, { inputType: stream.type });
  serverQueue.resource = resource;
  if (serverQueue.volume === undefined) serverQueue.volume = 0.5;
  resource.volume.setVolume(serverQueue.volume);
  serverQueue.player.play(resource);
  serverQueue.connection.subscribe(serverQueue.player);
  await interaction.followUp(`Tocando agora: ${song.title}`);
}

client.once('ready', async () => {
  console.log(`Bot online como ${client.user.tag}`);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Comando /play registrado globalmente.');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'play') {
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply('Você precisa estar em um canal de voz!');
    }
    await interaction.reply('Procurando música...');
    let songInfo, songType = 'yt', song = {};
    try {
      if (playdl.yt_validate(query) === 'video') {
        songInfo = await playdl.video_info(query);
        song = { title: songInfo.video_details.title, url: songInfo.video_details.url, type: 'yt' };
      } else if (playdl.sp_validate(query)) {
        songType = 'sp';
        const spData = await playdl.spotify(query);
        song = { title: spData.name, artist: spData.artists[0].name, url: query, type: 'sp' };
      } else {
        // Busca YouTube por nome
        const yt = await playdl.search(query, { limit: 1 });
        if (!yt[0]) throw new Error('Nenhum resultado encontrado');
        song = { title: yt[0].title, url: yt[0].url, type: 'yt' };
      }
    } catch (e) {
      return interaction.followUp('Erro ao buscar música: ' + e.message);
    }
    let serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) {
      // Criar fila e conectar
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator
      });
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      queue.set(interaction.guildId, {
        connection,
        player,
        songs: [song]
      });
      player.on(AudioPlayerStatus.Idle, () => {
        const q = queue.get(interaction.guildId);
        if (q) {
          q.songs.shift();
          playSong(interaction.guildId, interaction);
        }
      });
      playSong(interaction.guildId, interaction);
    } else {
      serverQueue.songs.push(song);
      interaction.followUp(`Adicionado à fila: ${song.title}`);
    }
  } else if (interaction.commandName === 'skip') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) return interaction.reply('Não há música tocando.');
    serverQueue.player.stop();
    interaction.reply('Música pulada!');
  } else if (interaction.commandName === 'stop') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) return interaction.reply('Não há música tocando.');
    serverQueue.songs = [];
    serverQueue.player.stop();
    serverQueue.connection.destroy();
    queue.delete(interaction.guildId);
    interaction.reply('Música parada e fila limpa!');
  } else if (interaction.commandName === 'pause') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) return interaction.reply('Não há música tocando.');
    const success = serverQueue.player.pause();
    if (success) {
      interaction.reply('Música pausada!');
    } else {
      interaction.reply('Não foi possível pausar.');
    }
  } else if (interaction.commandName === 'resume') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) return interaction.reply('Não há música tocando.');
    const success = serverQueue.player.unpause();
    if (success) {
      interaction.reply('Música retomada!');
    } else {
      interaction.reply('Não foi possível retomar.');
    }
  } else if (interaction.commandName === 'volume') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) return interaction.reply('Não há música tocando.');
    let valor = interaction.options.getInteger('valor');
    if (valor < 1) valor = 1;
    if (valor > 100) valor = 100;
    serverQueue.volume = valor / 100;
    if (serverQueue.resource) {
      serverQueue.resource.volume.setVolume(serverQueue.volume);
    }
    interaction.reply(`Volume ajustado para ${valor}%`);
  } else if (interaction.commandName === 'queue') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue || !serverQueue.songs.length) return interaction.reply('A fila está vazia.');
    const queueList = serverQueue.songs.map((s, i) => `${i === 0 ? '**Tocando agora:**' : `${i}.`} ${s.title}`).join('\n');
    interaction.reply(`Fila de músicas:\n${queueList}`);
  } else if (interaction.commandName === 'nowplaying') {
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue || !serverQueue.songs.length) return interaction.reply('Nenhuma música tocando.');
    const song = serverQueue.songs[0];
    interaction.reply(`Tocando agora: **${song.title}**`);
  }
});

client.login(process.env.DISCORD_TOKEN); 