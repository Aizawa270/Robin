const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const {
  getSettings,
} = require('./welcomeStore');

function spaced(text) {
  return String(text).toUpperCase().split('').join(' ');
}

function ordinal(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return `${num}st`;
  if (j === 2 && k !== 12) return `${num}nd`;
  if (j === 3 && k !== 13) return `${num}rd`;
  return `${num}th`;
}

function buildMainWelcomeEmbed(member, settings) {
  const guild = member.guild;
  const serverIcon = guild.iconURL({ dynamic: true, size: 256 });

  const rules = settings.rules_channel_id ? `<#${settings.rules_channel_id}>` : '#rules';
  const info = settings.info_channel_id ? `<#${settings.info_channel_id}>` : '#info';
  const chat = settings.chat_channel_id ? `<#${settings.chat_channel_id}>` : '#chat';

  const embed = new EmbedBuilder()
    .setColor('#8b2e2e')
    .setThumbnail(serverIcon || member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription(
`╭━━━━━⚚━━━━━∙⋆⋅⋆∙━━━━━⚚━━━━━╮
ㅤㅤㅤㅤㅤ𝓦𝓮𝓵𝓬𝓸𝓶𝓮 𝓣𝓸
ㅤㅤㅤㅤㅤ『 ${spaced(guild.name)} 』

ㅤ☈ Make sure to read the
⁠✧┇${rules}

ㅤ☈ Read The following for info
⁠✦┇${info}

ㅤ☈ Feel free to speak in
⁠✧┇${chat}

╰━━━━━⚚━━━━━∙⋆⋅⋆∙━━━━━⚚━━━━━╯

You are the **${ordinal(guild.memberCount)}** member of the server!`
    )
    .setTimestamp();

  if (settings.welcome_image_url) {
    embed.setImage(settings.welcome_image_url);
  }

  return embed;
}

function buildChatWelcomeEmbed(member) {
  const guild = member.guild;
  const memberAvatar = member.user.displayAvatarURL({ dynamic: true, size: 256 });

  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setAuthor({
      name: `${member.user.username} has entered ${guild.name}!`,
      iconURL: memberAvatar,
    })
    .setTitle(`${guild.name} | Welcome`)
    .setDescription(
      `Welcome to **${guild.name}**, ${member}!\n\n` +
      `You are our **${ordinal(guild.memberCount)}** member!\n\n` +
      `Today at **${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())}**\n\n` +
      `Click the buttons below to get started.`
    )
    .setThumbnail(memberAvatar)
    .setTimestamp();
}

function buildButtons(guild, settings) {
  const buttons = [];

  const pushButton = (label, channelId) => {
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    buttons.push(
      new ButtonBuilder()
        .setLabel(label)
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${channel.id}`)
    );
  };

  pushButton('Roles', settings.redirect_roles_channel_id);
  pushButton('Intro', settings.redirect_intro_channel_id);
  pushButton('Commands', settings.redirect_commands_channel_id);
  pushButton('Giveaways', settings.redirect_giveaways_channel_id);
  pushButton('VC', settings.redirect_vc_channel_id);
  pushButton('Ping', settings.ping_channel_id);

  if (!buttons.length) return [];

  return [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
}

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      const settings = getSettings(member.guild.id);
      if (!settings) return;

      const guild = member.guild;

      if (settings.welcome_channel_id) {
        const welcomeChannel = guild.channels.cache.get(settings.welcome_channel_id);
        if (welcomeChannel) {
          const embed = buildMainWelcomeEmbed(member, settings);
          await welcomeChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }

      if (settings.welcome_chat_channel_id) {
        const chatChannel = guild.channels.cache.get(settings.welcome_chat_channel_id);
        if (chatChannel) {
          const embed = buildChatWelcomeEmbed(member, settings);
          const components = buildButtons(guild, settings);

          await chatChannel.send({
            content: `${member}`,
            allowedMentions: { users: [member.id] },
            embeds: [embed],
            components,
          }).catch(() => {});
        }
      }

      console.log(`[Welcome] Sent for ${member.user.tag} in ${guild.name}`);
    } catch (error) {
      console.error('[Welcome] Error:', error);
    }
  });

  console.log('🎉 Configurable welcome system initialized');
};