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

function channelMention(channelId, fallback) {
  return channelId ? `<#${channelId}>` : fallback;
}

function titleFromChannelName(name) {
  return String(name || '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word =>
      word
        ? word[0].toUpperCase() + word.slice(1)
        : word
    )
    .join(' ');
}

/*
============================================================
NORMAL WELCOME EMBED
============================================================

- NO separate ping outside the embed.
- User is pinged INSIDE the embed at the very top.
- Server name is ALWAYS displayed as:

R A V I N E

============================================================
*/

function buildMainWelcomeEmbed(member, settings) {
  const guild = member.guild;

  const serverIcon = guild.iconURL({
    dynamic: true,
    size: 256,
  });

  const memberAvatar = member.user.displayAvatarURL({
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

  // Hardcoded exactly how you wanted it.
  const formattedGuildName = spaced('RAVINE');

  const embed = new EmbedBuilder()
    .setColor('#8b2e2e')

    // User shown at the top of the embed
    .setAuthor({
      name: member.user.username,
      iconURL: memberAvatar,
    })

    .setThumbnail(
      serverIcon || memberAvatar
    )

    .setDescription(
`<@${member.id}>

╭━━━━━⚚━━━━━∙⋆⋅⋆∙━━━━━⚚━━━━━╮
ㅤㅤㅤㅤㅤ𝓦𝓮𝓵𝓬𝓸𝓶𝓮 𝓣𝓸
ㅤㅤㅤㅤㅤ『 ${formattedGuildName} 』

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
    embed.setImage(
      settings.welcome_image_url
    );
  }

  return embed;
}

/*
============================================================
CHAT WELCOME EMBED
============================================================

The separate ping BEFORE the embed stays here.

============================================================
*/

function buildChatWelcomeEmbed(member) {
  const guild = member.guild;

  const memberAvatar = member.user.displayAvatarURL({
    dynamic: true,
    size: 256,
  });

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
      `Feel free to explore the server and meet everyone.\n\n` +
      `Click the buttons below to get started.`
    )

    .setThumbnail(memberAvatar)
    .setTimestamp();
}

/*
============================================================
WELCOME CHAT BUTTONS
============================================================

The new setup:

$welcomechat redirect #channel1 #channel2 #channel3

Maps them in order:

1 = Roles
2 = Intro
3 = Commands
4 = Giveaways
5 = VC

============================================================
*/

function buildButtons(guild, settings) {
  const buttons = [];

  const redirectChannels = [
    {
      label: 'Roles',
      id: settings.redirect_roles_channel_id,
    },
    {
      label: 'Intro',
      id: settings.redirect_intro_channel_id,
    },
    {
      label: 'Commands',
      id: settings.redirect_commands_channel_id,
    },
    {
      label: 'Giveaways',
      id: settings.redirect_giveaways_channel_id,
    },
    {
      label: 'VC',
      id: settings.redirect_vc_channel_id,
    },
  ];

  for (const redirect of redirectChannels) {
    if (!redirect.id) continue;

    const channel = guild.channels.cache.get(
      redirect.id
    );

    if (!channel) continue;

    buttons.push(
      new ButtonBuilder()
        .setLabel(redirect.label)
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${guild.id}/${channel.id}`
        )
    );
  }

  // Ping button
  if (settings.ping_channel_id) {
    const pingChannel = guild.channels.cache.get(
      settings.ping_channel_id
    );

    if (pingChannel) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Ping')
          .setStyle(ButtonStyle.Link)
          .setURL(
            `https://discord.com/channels/${guild.id}/${pingChannel.id}`
          )
      );
    }
  }

  if (!buttons.length) {
    return [];
  }

  /*
  Discord allows max 5 buttons per ActionRow.
  */

  const rows = [];

  for (
    let i = 0;
    i < buttons.length;
    i += 5
  ) {
    rows.push(
      new ActionRowBuilder()
        .addComponents(
          buttons.slice(i, i + 5)
        )
    );
  }

  return rows;
}

/*
============================================================
EVENT HANDLER
============================================================
*/

module.exports = (client) => {

  client.on(
    'guildMemberAdd',
    async (member) => {

      try {
        const settings = getSettings(
          member.guild.id
        );

        if (!settings) return;

        const guild = member.guild;

        /*
        ====================================================
        NORMAL WELCOME
        ====================================================

        IMPORTANT:
        There is NO content: member here.

        Therefore:
        ❌ No separate ping above the embed.

        The ping is INSIDE the embed description.
        ====================================================
        */

        if (settings.welcome_channel_id) {

          const welcomeChannel =
            guild.channels.cache.get(
              settings.welcome_channel_id
            );

          if (welcomeChannel) {

            const embed =
              buildMainWelcomeEmbed(
                member,
                settings
              );

            await welcomeChannel
              .send({
                embeds: [embed],
              })
              .catch((error) => {
                console.error(
                  '[Welcome] Failed to send main welcome:',
                  error
                );
              });
          }
        }

        /*
        ====================================================
        CHAT WELCOME
        ====================================================

        This one DOES ping the user separately.

        ====================================================
        */

        if (
          settings.welcome_chat_channel_id
        ) {

          const chatChannel =
            guild.channels.cache.get(
              settings.welcome_chat_channel_id
            );

          if (chatChannel) {

            const embed =
              buildChatWelcomeEmbed(
                member
              );

            const components =
              buildButtons(
                guild,
                settings
              );

            await chatChannel
              .send({
                content: `<@${member.id}>`,

                allowedMentions: {
                  users: [
                    member.id,
                  ],
                },

                embeds: [
                  embed,
                ],

                components,
              })
              .catch((error) => {
                console.error(
                  '[Welcome] Failed to send chat welcome:',
                  error
                );
              });
          }
        }

        console.log(
          `[Welcome] Sent for ${member.user.tag} in ${guild.name}`
        );

      } catch (error) {

        console.error(
          '[Welcome] Error:',
          error
        );

      }
    }
  );

  console.log(
    '🎉 Configurable welcome system initialized'
  );
};