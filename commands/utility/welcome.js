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
==================================================
PERMISSION CHECK
==================================================
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
==================================================
CHANNEL RESOLVER
==================================================
*/

function resolveTextChannel(message, input) {
  if (!input || !message.guild) {
    return null;
  }

  // First try a channel mention
  const mentionedChannel =
    message.mentions?.channels?.first();

  if (
    mentionedChannel &&
    (
      mentionedChannel.type === ChannelType.GuildText ||
      mentionedChannel.type === ChannelType.GuildAnnouncement
    )
  ) {
    return mentionedChannel;
  }

  // Remove Discord mention formatting
  const raw = String(input)
    .replace(/[<#>]/g, '')
    .trim();

  if (!raw) {
    return null;
  }

  // Try channel ID
  const byId = message.guild.channels.cache.get(raw);

  if (
    byId &&
    (
      byId.type === ChannelType.GuildText ||
      byId.type === ChannelType.GuildAnnouncement
    )
  ) {
    return byId;
  }

  // Try channel name
  const byName = message.guild.channels.cache.find(
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
==================================================
HELP EMBED
==================================================
*/

function buildHelpEmbed(prefix) {
  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle('Welcome System')
    .setDescription(
`Configure your server's welcome system.

━━━━━━━━━━━━━━━━━━━━

**MAIN WELCOME**

\`${prefix}welcomeset #channel\`

Sets where the main aesthetic welcome embed will be sent.

The main welcome contains:
• Server icon
• Server name
• Rules channel
• Info channel
• Chat channel
• Configured bottom image

━━━━━━━━━━━━━━━━━━━━

**MAIN WELCOME CHANNELS**

\`${prefix}welcomeset rules #channel\`

Sets the clickable Rules channel.

\`${prefix}welcomeset info #channel\`

Sets the clickable Info channel.

\`${prefix}welcomeset chat #channel\`

Sets the clickable Chat channel.

━━━━━━━━━━━━━━━━━━━━

**WELCOME IMAGE**

\`${prefix}welcomeimageset\`

Attach an image to the command to set the bottom image of the main welcome embed.

\`${prefix}welcomeimageset remove\`

Removes the bottom image.

━━━━━━━━━━━━━━━━━━━━

**CHAT WELCOME**

\`${prefix}welcomechatset #channel\`

Sets where the second welcome embed will be sent.

This welcome:
• Actually pings the new member
• Shows their avatar
• Shows the server name
• Uses the red welcome theme

━━━━━━━━━━━━━━━━━━━━

**CHAT REDIRECT**

\`${prefix}welcomechatset redirect #channel\`

Sets the channel opened by the **Go to Channel** button.

━━━━━━━━━━━━━━━━━━━━

**PING CHANNEL**

\`${prefix}welcomechatset ping #channel\`

Sets the channel opened by the **Ping Channel** button.

━━━━━━━━━━━━━━━━━━━━

**DISABLE**

\`${prefix}welcomeset off\`

Disables the main welcome.

\`${prefix}welcomechatset off\`

Disables the chat welcome.

━━━━━━━━━━━━━━━━━━━━

**VIEW CONFIG**

\`${prefix}welcomeconfig\`

Shows your current welcome configuration.

━━━━━━━━━━━━━━━━━━━━

**PERMISSIONS**

You need **Manage Server** or **Administrator** to configure the welcome system.`
    )
    .setFooter({
      text: 'Welcome System',
    });
}

/*
==================================================
CONFIG EMBED
==================================================
*/

function buildConfigEmbed(
  guild,
  settings,
  prefix
) {
  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle(
      `Welcome Config | ${guild.name}`
    )
    .setDescription(
`**Main Welcome**
${settings.welcome_channel_id
  ? `<#${settings.welcome_channel_id}>`
  : '`Not configured`'}

**Rules**
${settings.rules_channel_id
  ? `<#${settings.rules_channel_id}>`
  : '`Not configured`'}

**Info**
${settings.info_channel_id
  ? `<#${settings.info_channel_id}>`
  : '`Not configured`'}

**Chat shown inside Main Welcome**
${settings.chat_channel_id
  ? `<#${settings.chat_channel_id}>`
  : '`Not configured`'}

**Bottom Welcome Image**
${settings.welcome_image_url
  ? '`Configured`'
  : '`Not configured`'}

**Chat Welcome**
${settings.welcome_chat_channel_id
  ? `<#${settings.welcome_chat_channel_id}>`
  : '`Not configured`'}

**Redirect Button**
${settings.redirect_channel_id
  ? `<#${settings.redirect_channel_id}>`
  : '`Not configured`'}

**Ping Button**
${settings.ping_channel_id
  ? `<#${settings.ping_channel_id}>`
  : '`Not configured`'}`
    )
    .setFooter({
      text: `Use ${prefix}welcomehelp for help`,
    });
}

/*
==================================================
COMMAND
==================================================
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

  category: 'Utility',

  description:
    'Configure the server welcome system.',

  async execute(client, message, args) {

    /*
    ==============================================
    SERVER ONLY
    ==============================================
    */

    if (!message.guild) {
      return message.reply(
        '❌ This command can only be used inside a server.'
      );
    }

    const guildId = message.guild.id;

    const prefix =
      client.getPrefix(guildId);

    /*
    ==============================================
    DETECT WHICH ALIAS WAS USED
    ==============================================
    */

    const rawContent =
      message.content.trim();

    const contentWithoutPrefix =
      rawContent.startsWith(prefix)
        ? rawContent.slice(prefix.length).trim()
        : rawContent;

    const trigger =
      contentWithoutPrefix
        .split(/\s+/)[0]
        .toLowerCase();

    /*
    ==============================================
    HELP
    ==============================================
    */

    if (
      trigger === 'welcomehelp' ||
      trigger === 'welcome'
    ) {
      return message.reply({
        embeds: [
          buildHelpEmbed(prefix),
        ],
      });
    }

    /*
    ==============================================
    CONFIG
    ==============================================
    */

    if (trigger === 'welcomeconfig') {
      const settings =
        getSettings(guildId);

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
    ==============================================
    PERMISSION
    ==============================================
    */

    if (!hasManageGuild(message)) {
      return message.reply(
        '❌ You need **Manage Server** permission to configure the welcome system.'
      );
    }

    /*
    ==============================================
    MAIN WELCOME SETUP
    ==============================================
    */

    if (trigger === 'welcomeset') {

      if (!args[0]) {
        return message.reply(
`Usage:

\`${prefix}welcomeset #channel\`
Set the main welcome channel.

\`${prefix}welcomeset rules #channel\`
Set the Rules channel.

\`${prefix}welcomeset info #channel\`
Set the Info channel.

\`${prefix}welcomeset chat #channel\`
Set the Chat channel.

\`${prefix}welcomeset off\`
Disable the main welcome.`
        );
      }

      const mode =
        args[0].toLowerCase();

      /*
      Disable
      */

      if (mode === 'off') {

        setSetting(
          guildId,
          'welcome_channel_id',
          null
        );

        return message.reply(
          '✅ Main welcome embed disabled.'
        );
      }

      /*
      Rules / Info / Chat
      */

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
          rules:
            'rules_channel_id',

          info:
            'info_channel_id',

          chat:
            'chat_channel_id',
        };

        setSetting(
          guildId,
          map[mode],
          channel.id
        );

        return message.reply(
          `✅ Main welcome **${mode}** channel set to ${channel}.`
        );
      }

      /*
      Main welcome channel
      */

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
        guildId,
        'welcome_channel_id',
        channel.id
      );

      return message.reply(
        `✅ Main welcome embed will now be sent in ${channel}.`
      );
    }

    /*
    ==============================================
    WELCOME IMAGE
    ==============================================
    */

    if (
      trigger === 'welcomeimageset'
    ) {

      const mode =
        (args[0] || '').toLowerCase();

      /*
      Remove image
      */

      if (
        mode === 'remove' ||
        mode === 'off'
      ) {

        setSetting(
          guildId,
          'welcome_image_url',
          null
        );

        return message.reply(
          '✅ Bottom welcome image removed.'
        );
      }

      /*
      Attachment
      */

      const attachment =
        message.attachments.first();

      if (
        attachment &&
        !attachment.contentType?.startsWith('image/')
      ) {
        return message.reply(
          '❌ The attached file must be an image.'
        );
      }

      const imageUrl =
        attachment?.url ||
        args[0];

      if (!imageUrl) {
        return message.reply(
`❌ Attach an image to the command.

Example:

\`${prefix}welcomeimageset\`

Then attach your welcome image to the same message.`
        );
      }

      setSetting(
        guildId,
        'welcome_image_url',
        imageUrl
      );

      return message.reply(
        '✅ Bottom welcome image updated.'
      );
    }

    /*
    ==============================================
    CHAT WELCOME SETUP
    ==============================================
    */

    if (
      trigger === 'welcomechatset'
    ) {

      if (!args[0]) {
        return message.reply(
`Usage:

\`${prefix}welcomechatset #channel\`
Set the chat welcome channel.

\`${prefix}welcomechatset redirect #channel\`
Set the redirect button channel.

\`${prefix}welcomechatset ping #channel\`
Set the ping button channel.

\`${prefix}welcomechatset off\`
Disable the chat welcome.`
        );
      }

      const mode =
        args[0].toLowerCase();

      /*
      Disable
      */

      if (mode === 'off') {

        setSetting(
          guildId,
          'welcome_chat_channel_id',
          null
        );

        return message.reply(
          '✅ Chat welcome embed disabled.'
        );
      }

      /*
      Redirect
      */

      if (
        mode === 'redirect'
      ) {

        const channel =
          resolveTextChannel(
            message,
            args[1]
          );

        if (!channel) {
          return message.reply(
            `❌ Usage: \`${prefix}welcomechatset redirect #channel\``
          );
        }

        setSetting(
          guildId,
          'redirect_channel_id',
          channel.id
        );

        return message.reply(
          `✅ Chat welcome redirect set to ${channel}.`
        );
      }

      /*
      Ping
      */

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
            `❌ Usage: \`${prefix}welcomechatset ping #channel\``
          );
        }

        setSetting(
          guildId,
          'ping_channel_id',
          channel.id
        );

        return message.reply(
          `✅ Chat welcome ping channel set to ${channel}.`
        );
      }

      /*
      Chat welcome channel
      */

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
        guildId,
        'welcome_chat_channel_id',
        channel.id
      );

      return message.reply(
        `✅ Chat welcome embed will now be sent in ${channel}.`
      );
    }

    /*
    ==============================================
    FALLBACK
    ==============================================
    */

    return message.reply({
      embeds: [
        buildHelpEmbed(prefix),
      ],
    });
  },
};