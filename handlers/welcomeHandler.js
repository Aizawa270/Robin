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
  return String(text)
    .toUpperCase()
    .split('')
    .join(' ');
}

function ordinal(num) {
  const j = num % 10;
  const k = num % 100;

  if (j === 1 && k !== 11) return `${num}st`;
  if (j === 2 && k !== 12) return `${num}nd`;
  if (j === 3 && k !== 13) return `${num}rd`;

  return `${num}th`;
}

function channelMention(channelId, fallback) {
  return channelId ? `<#${channelId}>` : fallback;
}

/*
==================================================
MAIN WELCOME EMBED
==================================================
*/

function buildMainWelcomeEmbed(member, settings) {
  const guild = member.guild;

  const serverIcon = guild.iconURL({
    dynamic: true,
    size: 256,
  });

  const rules = channelMention(
    settings.rules_channel_id,
    '#rules'
  );

  const info = channelMention(
    settings.info_channel_id,
    '#info'
  );

  const chat = channelMention(
    settings.chat_channel_id,
    '#chat'
  );

  const embed = new EmbedBuilder()
    .setColor('#8b2e2e')
    .setThumbnail(
      serverIcon ||
      member.user.displayAvatarURL({
        dynamic: true,
        size: 256,
      })
    )
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

  // Bottom image
  if (settings.welcome_image_url) {
    embed.setImage(settings.welcome_image_url);
  }

  return embed;
}

/*
==================================================
CHAT WELCOME EMBED
==================================================
*/

function buildChatWelcomeEmbed(member) {
  const guild = member.guild;

  const userAvatar = member.user.displayAvatarURL({
    dynamic: true,
    size: 256,
  });

  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setAuthor({
      name: `${member.user.username} has entered ${guild.name}!`,
      iconURL: userAvatar,
    })
    .setTitle(`${guild.name} | Welcome`)
    .setDescription(
`Welcome to **${guild.name}**, ${member}!

You are our **${ordinal(guild.memberCount)}** member!

Feel free to explore the server and meet everyone.

Click the button below to get started.`
    )
    .setThumbnail(userAvatar)
    .setTimestamp();
}

/*
==================================================
CHAT WELCOME BUTTONS
==================================================
*/

function buildChatButtons(guild, settings) {
  const buttons = [];

  // Redirect button
  if (settings.redirect_channel_id) {
    const channel = guild.channels.cache.get(
      settings.redirect_channel_id
    );

    if (channel) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Go to Channel')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${guild.id}/${channel.id}`
          )
      );
    }
  }

  // Ping destination button
  if (settings.ping_channel_id) {
    const channel = guild.channels.cache.get(
      settings.ping_channel_id
    );

    if (channel) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Ping Channel')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${guild.id}/${channel.id}`
          )
      );
    }
  }

  if (!buttons.length) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      buttons.slice(0, 5)
    ),
  ];
}

/*
==================================================
WELCOME EVENT
==================================================
*/

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      const guild = member.guild;

      const settings = getSettings(guild.id);

      /*
      ==============================================
      MAIN WELCOME
      ==============================================
      */

      if (settings.welcome_channel_id) {
        const welcomeChannel = guild.channels.cache.get(
          settings.welcome_channel_id
        );

        if (welcomeChannel) {
          const embed = buildMainWelcomeEmbed(
            member,
            settings
          );

          await welcomeChannel.send({
            embeds: [embed],
          });
        }
      }

      /*
      ==============================================
      CHAT WELCOME
      ==============================================
      */

      if (settings.welcome_chat_channel_id) {
        const chatChannel = guild.channels.cache.get(
          settings.welcome_chat_channel_id
        );

        if (chatChannel) {
          const embed = buildChatWelcomeEmbed(member);

          const components = buildChatButtons(
            guild,
            settings
          );

          /*
          This is the actual user ping.

          The main aesthetic welcome does NOT ping them.
          The chat welcome DOES ping them.
          */

          await chatChannel.send({
            content: `<@${member.id}>`,
            allowedMentions: {
              users: [member.id],
            },
            embeds: [embed],
            components,
          });
        }
      }

      console.log(
        `[Welcome] Sent welcome for ${member.user.tag} in ${guild.name}`
      );

    } catch (error) {
      console.error(
        '[Welcome] Failed to send welcome:',
        error
      );
    }
  });

  console.log(
    '🎉 Configurable welcome system initialized'
  );
};