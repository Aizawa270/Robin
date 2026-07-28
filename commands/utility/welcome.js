const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const {
  getSettings,
  setSetting,
} = require('../../handlers/welcomeStore');

function hasManageGuild(message) {
  return (
    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    message.member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function isValidTextChannel(channel) {
  return (
    channel &&
    (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.GuildAnnouncement
    )
  );
}

/**
 * Gets every channel mentioned in the message.
 * Example:
 * $welcomechat redirect #roles #intro #commands
 */
function getMentionedChannels(message) {
  return message.mentions.channels
    .filter(channel => isValidTextChannel(channel))
    .map(channel => channel);
}

function resolveTextChannel(message, input) {
  if (!input) return null;

  // Channel mention
  const mention = message.mentions.channels.first();
  if (mention && isValidTextChannel(mention)) {
    return mention;
  }

  const raw = input.replace(/[<#>]/g, '').trim();
  if (!raw) return null;

  // Channel ID
  const byId = message.guild.channels.cache.get(raw);
  if (isValidTextChannel(byId)) {
    return byId;
  }

  // Channel name
  const byName = message.guild.channels.cache.find(channel =>
    isValidTextChannel(channel) &&
    channel.name.toLowerCase() === raw.toLowerCase()
  );

  return byName || null;
}

function buildHelpEmbed(prefix) {
  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle('Welcome System Help')
    .setDescription(
      [
        `**${prefix}welcomehelp**`,
        `Shows this help menu.`,

        `**${prefix}welcomeconfig**`,
        `Shows the current welcome configuration.`,

        `**${prefix}welcomeset #channel**`,
        `Sets the channel where the main aesthetic welcome embed is sent.`,

        `**${prefix}welcomeset rules #channel**`,
        `Sets the rules channel shown inside the main welcome embed.`,

        `**${prefix}welcomeset info #channel**`,
        `Sets the info channel shown inside the main welcome embed.`,

        `**${prefix}welcomeset chat #channel**`,
        `Sets the chat channel shown inside the main welcome embed.`,

        `**${prefix}welcomeset off**`,
        `Disables the main welcome embed.`,

        `**${prefix}welcomeimageset**`,
        `Attach an image to set the bottom image of the main welcome embed.`,

        `**${prefix}welcomeimageset remove**`,
        `Removes the bottom welcome image.`,

        `**${prefix}welcomechatset #channel**`,
        `Sets the channel where the separate chat welcome embed is sent.`,

        `**${prefix}welcomechat redirect #channel1 #channel2 #channel3**`,
        `Sets multiple redirect buttons at once. The channels will become buttons in the chat welcome embed.`,

        `**${prefix}welcomechat redirect off**`,
        `Removes all redirect buttons.`,

        `**${prefix}welcomechat ping #channel**`,
        `Sets the Ping button.`,

        `**${prefix}welcomechat off**`,
        `Disables the chat welcome embed.`,

      ].join('\n\n')
    )
    .setFooter({
      text: 'Manage Server permission required for setup commands',
    });
}

function buildConfigEmbed(guild, settings, prefix) {
  const redirects = [
    ['Roles', settings.redirect_roles_channel_id],
    ['Intro', settings.redirect_intro_channel_id],
    ['Commands', settings.redirect_commands_channel_id],
    ['Giveaways', settings.redirect_giveaways_channel_id],
    ['VC', settings.redirect_vc_channel_id],
  ]
    .filter(([, id]) => id)
    .map(([name, id]) => `${name}: <#${id}>`)
    .join('\n') || '`None`';

  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle(`Welcome Config for ${guild.name}`)
    .setDescription(
      [
        `**Main Welcome Channel:** ${
          settings.welcome_channel_id
            ? `<#${settings.welcome_channel_id}>`
            : '`Not set`'
        }`,

        `**Rules Channel:** ${
          settings.rules_channel_id
            ? `<#${settings.rules_channel_id}>`
            : '`Not set`'
        }`,

        `**Info Channel:** ${
          settings.info_channel_id
            ? `<#${settings.info_channel_id}>`
            : '`Not set`'
        }`,

        `**Chat Channel Shown in Main Embed:** ${
          settings.chat_channel_id
            ? `<#${settings.chat_channel_id}>`
            : '`Not set`'
        }`,

        `**Bottom Welcome Image:** ${
          settings.welcome_image_url
            ? '`Set`'
            : '`Not set`'
        }`,

        `**Chat Welcome Channel:** ${
          settings.welcome_chat_channel_id
            ? `<#${settings.welcome_chat_channel_id}>`
            : '`Not set`'
        }`,

        `**Redirect Buttons:**\n${redirects}`,

        `**Ping Button:** ${
          settings.ping_channel_id
            ? `<#${settings.ping_channel_id}>`
            : '`Not set`'
        }`,
      ].join('\n\n')
    )
    .setFooter({
      text: `Use ${prefix}welcomehelp for setup instructions`,
    });
}

module.exports = {
  name: 'welcome',

  // IMPORTANT:
  // DO NOT add welcomehelp, welcomeconfig, welcomeset, etc. here.
  // They are separate command aliases handled by commandHandler.
  aliases: [],

  description: 'Configure the server welcome system.',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply(
        '❌ This command can only be used inside a server.'
      );
    }

    const prefix = client.getPrefix(message.guild.id);

    // Get the actual command that was typed.
    const rawCommand = message.content
      .slice(prefix.length)
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();

    /*
    ============================================================
    HELP
    Only $welcomehelp shows help.
    $welcome does NOT show help.
    ============================================================
    */

    if (rawCommand === 'welcomehelp') {
      return message.reply({
        embeds: [buildHelpEmbed(prefix)],
      });
    }

    /*
    ============================================================
    CONFIG
    ============================================================
    */

    if (rawCommand === 'welcomeconfig') {
      const settings = getSettings(message.guild.id);

      return message.reply({
        embeds: [
          buildConfigEmbed(
            message.guild,
            settings,
            prefix
          ),
        ],
      });
    }

    /*
    ============================================================
    PERMISSION CHECK
    ============================================================
    */

    if (!hasManageGuild(message)) {
      return message.reply(
        '❌ You need **Manage Server** permission to configure the welcome system.'
      );
    }

    /*
    ============================================================
    MAIN WELCOME SETUP
    ============================================================
    */

    if (rawCommand === 'welcomeset') {
      if (!args[0]) {
        return message.reply(
          [
            `Usage:`,
            `\`${prefix}welcomeset #channel\``,
            `\`${prefix}welcomeset rules #channel\``,
            `\`${prefix}welcomeset info #channel\``,
            `\`${prefix}welcomeset chat #channel\``,
            `\`${prefix}welcomeset off\``,
          ].join('\n')
        );
      }

      const mode = args[0].toLowerCase();

      if (mode === 'off') {
        setSetting(
          message.guild.id,
          'welcome_channel_id',
          null
        );

        return message.reply(
          '✅ Main welcome embed disabled.'
        );
      }

      if (
        mode === 'rules' ||
        mode === 'info' ||
        mode === 'chat'
      ) {
        const channel = resolveTextChannel(
          message,
          args[1]
        );

        if (!channel) {
          return message.reply(
            '❌ Please provide a valid text channel.'
          );
        }

        const map = {
          rules: 'rules_channel_id',
          info: 'info_channel_id',
          chat: 'chat_channel_id',
        };

        setSetting(
          message.guild.id,
          map[mode],
          channel.id
        );

        return message.reply(
          `✅ Main welcome **${mode}** channel set to ${channel}.`
        );
      }

      const channel = resolveTextChannel(
        message,
        args[0]
      );

      if (!channel) {
        return message.reply(
          '❌ Please provide a valid text channel.'
        );
      }

      setSetting(
        message.guild.id,
        'welcome_channel_id',
        channel.id
      );

      return message.reply(
        `✅ Main welcome embed will now be sent in ${channel}.`
      );
    }

    /*
    ============================================================
    WELCOME IMAGE
    ============================================================
    */

    if (rawCommand === 'welcomeimageset') {
      const mode = (args[0] || '').toLowerCase();

      if (
        mode === 'remove' ||
        mode === 'off'
      ) {
        setSetting(
          message.guild.id,
          'welcome_image_url',
          null
        );

        return message.reply(
          '✅ Bottom welcome image removed.'
        );
      }

      const attachment =
        message.attachments.first();

      const imageUrl =
        attachment?.url ||
        args[0];

      if (!imageUrl) {
        return message.reply(
          [
            '❌ Attach an image to the command or provide a direct image URL.',
            '',
            `Example: \`${prefix}welcomeimageset\` + attach your image`,
          ].join('\n')
        );
      }

      setSetting(
        message.guild.id,
        'welcome_image_url',
        imageUrl
      );

      return message.reply(
        '✅ Bottom welcome image updated.'
      );
    }

    /*
    ============================================================
    CHAT WELCOME SETUP
    ============================================================
    */

    if (rawCommand === 'welcomechatset') {
      if (!args[0]) {
        return message.reply(
          [
            `Usage:`,
            `\`${prefix}welcomechatset #channel\``,
            `\`${prefix}welcomechatset off\``,
          ].join('\n')
        );
      }

      const mode = args[0].toLowerCase();

      if (mode === 'off') {
        setSetting(
          message.guild.id,
          'welcome_chat_channel_id',
          null
        );

        return message.reply(
          '✅ Chat welcome embed disabled.'
        );
      }

      const channel = resolveTextChannel(
        message,
        args[0]
      );

      if (!channel) {
        return message.reply(
          '❌ Please provide a valid text channel.'
        );
      }

      setSetting(
        message.guild.id,
        'welcome_chat_channel_id',
        channel.id
      );

      return message.reply(
        `✅ Chat welcome embed will now be sent in ${channel}.`
      );
    }

    /*
    ============================================================
    MULTI-REDIRECT SETUP
    ============================================================

    NEW COMMAND:

    $welcomechat redirect #roles #intro #commands

    The first channel becomes Roles.
    The second becomes Intro.
    The third becomes Commands.
    The fourth becomes Giveaways.
    The fifth becomes VC.

    You can provide 1-5 channels.
    ============================================================
    */

    if (rawCommand === 'welcomechat') {
      const mode = (args[0] || '').toLowerCase();

      if (mode === 'redirect') {

        // Reset all redirect buttons
        if (
          args[1]?.toLowerCase() === 'off'
        ) {
          const redirectColumns = [
            'redirect_roles_channel_id',
            'redirect_intro_channel_id',
            'redirect_commands_channel_id',
            'redirect_giveaways_channel_id',
            'redirect_vc_channel_id',
          ];

          for (const column of redirectColumns) {
            setSetting(
              message.guild.id,
              column,
              null
            );
          }

          return message.reply(
            '✅ All welcome redirect buttons have been removed.'
          );
        }

        /*
        Get all mentioned channels.

        Example:
        $welcomechat redirect #roles #intro #commands

        Discord message.mentions.channels will contain
        all three channels.
        */

        const channels =
          getMentionedChannels(message);

        if (!channels.length) {
          return message.reply(
            [
              '❌ Please mention at least one channel.',
              '',
              `Example: \`${prefix}welcomechat redirect #roles #intro #commands\``,
              '',
              'Maximum: 5 redirect channels.',
            ].join('\n')
          );
        }

        if (channels.length > 5) {
          return message.reply(
            '❌ You can set a maximum of **5 redirect channels**.'
          );
        }

        const redirectColumns = [
          'redirect_roles_channel_id',
          'redirect_intro_channel_id',
          'redirect_commands_channel_id',
          'redirect_giveaways_channel_id',
          'redirect_vc_channel_id',
        ];

        // Clear old redirects first
        for (const column of redirectColumns) {
          setSetting(
            message.guild.id,
            column,
            null
          );
        }

        // Save new redirects in order
        for (
          let i = 0;
          i < channels.length;
          i++
        ) {
          setSetting(
            message.guild.id,
            redirectColumns[i],
            channels[i].id
          );
        }

        return message.reply(
          [
            '✅ Welcome redirect buttons updated!',
            '',
            ...channels.map(
              (channel, index) =>
                `**${index + 1}.** ${channel}`
            ),
          ].join('\n')
        );
      }

      /*
      Ping button
      */

      if (mode === 'ping') {
        const channel = resolveTextChannel(
          message,
          args[1]
        );

        if (!channel) {
          return message.reply(
            '❌ Please provide a valid text channel for the Ping button.'
          );
        }

        setSetting(
          message.guild.id,
          'ping_channel_id',
          channel.id
        );

        return message.reply(
          `✅ Ping button set to ${channel}.`
        );
      }

      /*
      Disable chat welcome
      */

      if (mode === 'off') {
        setSetting(
          message.guild.id,
          'welcome_chat_channel_id',
          null
        );

        return message.reply(
          '✅ Chat welcome embed disabled.'
        );
      }

      return message.reply(
        [
          '❌ Unknown welcome chat command.',
          '',
          `Use \`${prefix}welcomehelp\` for the setup commands.`,
        ].join('\n')
      );
    }

    /*
    ============================================================
    $welcome
    ============================================================

    Intentionally does NOTHING useful.

    It is NOT an alias for welcomehelp.
    ============================================================
    */

    if (rawCommand === 'welcome') {
      return message.reply(
        `❌ Unknown welcome command. Use \`${prefix}welcomehelp\` for the setup commands.`
      );
    }

    return message.reply(
      `❌ Unknown welcome command. Use \`${prefix}welcomehelp\` for the setup commands.`
    );
  },
};