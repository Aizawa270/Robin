const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const {
  getSettings,
  setSetting,
} = require('../../handlers/welcomeStore');

/*
|--------------------------------------------------------------------------
| PERMISSION
|--------------------------------------------------------------------------
*/

function hasManageGuild(message) {
  return (
    message.member?.permissions?.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    message.member?.permissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

/*
|--------------------------------------------------------------------------
| CHANNEL RESOLVER
|--------------------------------------------------------------------------
*/

function resolveTextChannel(message, input) {
  if (!input) return null;

  // Try channel mention first
  const mention =
    message.mentions?.channels?.first();

  if (
    mention &&
    (
      mention.type === ChannelType.GuildText ||
      mention.type === ChannelType.GuildAnnouncement
    )
  ) {
    return mention;
  }

  // Remove # < >
  const raw =
    input
      .replace(/[<#>]/g, '')
      .trim();

  if (!raw) return null;

  // Channel ID
  const byId =
    message.guild.channels.cache.get(raw);

  if (
    byId &&
    (
      byId.type === ChannelType.GuildText ||
      byId.type === ChannelType.GuildAnnouncement
    )
  ) {
    return byId;
  }

  // Channel name
  const byName =
    message.guild.channels.cache.find(
      channel =>
        (
          channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement
        ) &&
        channel.name.toLowerCase() ===
        raw.toLowerCase()
    );

  return byName || null;
}

/*
|--------------------------------------------------------------------------
| HELP EMBED
|--------------------------------------------------------------------------
*/

function buildHelpEmbed(prefix) {
  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle('Welcome System Help')
    .setDescription(
      [
        `**${prefix}welcomeset #channel**`,
        `Sets the channel where the main aesthetic welcome embed gets sent.`,

        `**${prefix}welcomeset rules #channel**`,
        `Sets the rules channel shown inside the main welcome embed.`,

        `**${prefix}welcomeset info #channel**`,
        `Sets the info channel shown inside the main welcome embed.`,

        `**${prefix}welcomeset chat #channel**`,
        `Sets the chat channel shown inside the main welcome embed.`,

        `**${prefix}welcomeset off**`,
        `Disables the main welcome embed.`,

        `**${prefix}welcomeimageset**`,
        `Attach an image to set the bottom welcome image.`,

        `**${prefix}welcomeimageset remove**`,
        `Removes the bottom welcome image.`,

        `**${prefix}welcomechatset #channel**`,
        `Sets the chat welcome channel.`,

        `**${prefix}welcomechatset redirect roles #channel**`,
        `Sets the Roles button.`,

        `**${prefix}welcomechatset redirect intro #channel**`,
        `Sets the Intro button.`,

        `**${prefix}welcomechatset redirect commands #channel**`,
        `Sets the Commands button.`,

        `**${prefix}welcomechatset redirect giveaways #channel**`,
        `Sets the Giveaways button.`,

        `**${prefix}welcomechatset redirect vc #channel**`,
        `Sets the VC button.`,

        `**${prefix}welcomechatset ping #channel**`,
        `Sets the Ping button.`,

        `**${prefix}welcomechatset off**`,
        `Disables the chat welcome embed.`,

        `**${prefix}welcomeconfig**`,
        `Shows the current welcome setup.`,

        `**${prefix}welcomehelp**`,
        `Shows this help menu.`,
      ].join('\n\n')
    )
    .setFooter({
      text: 'Manage Server permission required for setup commands',
    });
}

/*
|--------------------------------------------------------------------------
| CONFIG EMBED
|--------------------------------------------------------------------------
*/

function buildConfigEmbed(
  guild,
  settings,
  prefix
) {
  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle(
      `Welcome Config for ${guild.name}`
    )
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

        `**Chat Channel:** ${
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

        `**Redirect - Roles:** ${
          settings.redirect_roles_channel_id
            ? `<#${settings.redirect_roles_channel_id}>`
            : '`Not set`'
        }`,

        `**Redirect - Intro:** ${
          settings.redirect_intro_channel_id
            ? `<#${settings.redirect_intro_channel_id}>`
            : '`Not set`'
        }`,

        `**Redirect - Commands:** ${
          settings.redirect_commands_channel_id
            ? `<#${settings.redirect_commands_channel_id}>`
            : '`Not set`'
        }`,

        `**Redirect - Giveaways:** ${
          settings.redirect_giveaways_channel_id
            ? `<#${settings.redirect_giveaways_channel_id}>`
            : '`Not set`'
        }`,

        `**Redirect - VC:** ${
          settings.redirect_vc_channel_id
            ? `<#${settings.redirect_vc_channel_id}>`
            : '`Not set`'
        }`,

        `**Ping Button:** ${
          settings.ping_channel_id
            ? `<#${settings.ping_channel_id}>`
            : '`Not set`'
        }`,
      ].join('\n')
    )
    .setFooter({
      text: `Use ${prefix}welcomehelp for setup instructions`,
    });
}

/*
|--------------------------------------------------------------------------
| COMMAND
|--------------------------------------------------------------------------
*/

module.exports = {
  name: 'welcome',

  aliases: [
    'welcomeset',
    'welcomeimageset',
    'welcomechatset',
    'welcomehelp',
    'welcomeconfig',
  ],

  description:
    'Configure the server welcome system.',

  async execute(
    client,
    message,
    args
  ) {
    if (!message.guild) {
      return message.reply(
        'This command can only be used inside a server.'
      );
    }

    const prefix =
      client.getPrefix(
        message.guild.id
      );

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT:
    | Get the exact command that was typed.
    |--------------------------------------------------------------------------
    */

    const content =
      message.content
        .trim()
        .split(/\s+/);

    let trigger =
      content[0]
        ?.toLowerCase();

    // Remove prefix
    if (
      trigger &&
      trigger.startsWith(prefix.toLowerCase())
    ) {
      trigger =
        trigger
          .slice(prefix.length)
          .toLowerCase();
    }

    const settings =
      getSettings(
        message.guild.id
      );

    /*
    |--------------------------------------------------------------------------
    | WELCOMEHELP ONLY SHOWS HELP
    |--------------------------------------------------------------------------
    */

    if (
      trigger === 'welcomehelp'
    ) {
      return message.reply({
        embeds: [
          buildHelpEmbed(prefix),
        ],
      });
    }

    /*
    |--------------------------------------------------------------------------
    | WELCOMECONFIG
    |--------------------------------------------------------------------------
    */

    if (
      trigger === 'welcomeconfig'
    ) {
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
    |--------------------------------------------------------------------------
    | PERMISSION CHECK
    |--------------------------------------------------------------------------
    */

    if (!hasManageGuild(message)) {
      return message.reply(
        '❌ You need **Manage Server** permission to configure welcome settings.'
      );
    }

    /*
    |--------------------------------------------------------------------------
    | WELCOME
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | $welcome #channel
    | NOW SETS THE MAIN WELCOME CHANNEL.
    |
    | It does NOT show the help menu anymore.
    |
    */

    if (
      trigger === 'welcome'
    ) {
      const channel =
        resolveTextChannel(
          message,
          args[0]
        );

      if (!channel) {
        return message.reply(
          `❌ Please provide a valid text channel.\n\nExample:\n\`${prefix}welcome #welcome\`\n\nUse \`${prefix}welcomehelp\` for all commands.`
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
    |--------------------------------------------------------------------------
    | WELCOMESET
    |--------------------------------------------------------------------------
    */

    if (
      trigger === 'welcomeset'
    ) {
      if (!args[0]) {
        return message.reply(
          `Usage:\n\`${prefix}welcomeset #channel\`\n\`${prefix}welcomeset rules #channel\`\n\`${prefix}welcomeset info #channel\`\n\`${prefix}welcomeset chat #channel\`\n\`${prefix}welcomeset off\``
        );
      }

      const mode =
        args[0].toLowerCase();

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
        const channel =
          resolveTextChannel(
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

      const channel =
        resolveTextChannel(
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
    |--------------------------------------------------------------------------
    | WELCOME IMAGE
    |--------------------------------------------------------------------------
    */

    if (
      trigger === 'welcomeimageset'
    ) {
      const mode =
        (
          args[0] || ''
        ).toLowerCase();

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
          `❌ Attach an image to the command or provide a direct image URL.\n\nExample:\n\`${prefix}welcomeimageset\` + attach your image`
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
    |--------------------------------------------------------------------------
    | CHAT WELCOME
    |--------------------------------------------------------------------------
    */

    if (
      trigger === 'welcomechatset'
    ) {
      if (!args[0]) {
        return message.reply(
          `Usage:\n\`${prefix}welcomechatset #channel\`\n\`${prefix}welcomechatset redirect roles #channel\`\n\`${prefix}welcomechatset ping #channel\`\n\`${prefix}welcomechatset off\``
        );
      }

      const mode =
        args[0].toLowerCase();

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

      if (
        mode === 'redirect'
      ) {
        const key =
          (
            args[1] || ''
          ).toLowerCase();

        const channel =
          resolveTextChannel(
            message,
            args[2]
          );

        if (
          !key ||
          !channel
        ) {
          return message.reply(
            `❌ Usage:\n\`${prefix}welcomechatset redirect roles #channel\`\n\`${prefix}welcomechatset redirect intro #channel\`\n\`${prefix}welcomechatset redirect commands #channel\`\n\`${prefix}welcomechatset redirect giveaways #channel\`\n\`${prefix}welcomechatset redirect vc #channel\``
          );
        }

        const map = {
          roles:
            'redirect_roles_channel_id',

          intro:
            'redirect_intro_channel_id',

          commands:
            'redirect_commands_channel_id',

          giveaways:
            'redirect_giveaways_channel_id',

          vc:
            'redirect_vc_channel_id',
        };

        const column =
          map[key];

        if (!column) {
          return message.reply(
            '❌ Valid redirect keys are: roles, intro, commands, giveaways, vc.'
          );
        }

        setSetting(
          message.guild.id,
          column,
          channel.id
        );

        return message.reply(
          `✅ Chat welcome redirect **${key}** set to ${channel}.`
        );
      }

      if (
        mode === 'ping'
      ) {
        const channel =
          resolveTextChannel(
            message,
            args[1]
          );

        if (!channel) {
          return message.reply(
            '❌ Please provide a valid text channel for ping.'
          );
        }

        setSetting(
          message.guild.id,
          'ping_channel_id',
          channel.id
        );

        return message.reply(
          `✅ Chat welcome ping button set to ${channel}.`
        );
      }

      const channel =
        resolveTextChannel(
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
    |--------------------------------------------------------------------------
    | UNKNOWN
    |--------------------------------------------------------------------------
    */

    return message.reply(
      `❌ Unknown welcome command. Use \`${prefix}welcomehelp\` for the setup commands.`
    );
  },
};