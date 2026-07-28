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

function resolveTextChannel(message, input) {
  if (!input) return null;

  const mention = message.mentions?.channels?.first();
  if (mention) {
    if (
      mention.type === ChannelType.GuildText ||
      mention.type === ChannelType.GuildAnnouncement
    ) return mention;
  }

  const raw = input.replace(/[<#>]/g, '').trim();
  if (!raw) return null;

  const byId = message.guild.channels.cache.get(raw);
  if (
    byId &&
    (byId.type === ChannelType.GuildText || byId.type === ChannelType.GuildAnnouncement)
  ) return byId;

  const byName = message.guild.channels.cache.find(ch =>
    (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
    ch.name.toLowerCase() === raw.toLowerCase()
  );

  return byName || null;
}

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

        `**${prefix}welcomechatset redirect #channel1 #channel2 #channel3**`,
        `Sets multiple redirect channels at once. Those channels become buttons in the chat welcome.`,

        `**${prefix}welcomechatset redirect off**`,
        `Clears all redirect buttons.`,

        `**${prefix}welcomechatset ping #channel**`,
        `Sets the Ping button.`,

        `**${prefix}welcomechatset ping off**`,
        `Clears the Ping button.`,

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

function buildConfigEmbed(guild, settings, prefix) {
  let redirectList = '`Not set`';

  try {
    const ids = JSON.parse(settings.redirect_channel_ids || '[]');
    if (Array.isArray(ids) && ids.length) {
      redirectList = ids.map(id => `<#${id}>`).join(', ');
    }
  } catch {}

  return new EmbedBuilder()
    .setColor('#8b2e2e')
    .setTitle(`Welcome Config for ${guild.name}`)
    .setDescription(
      [
        `**Main Welcome Channel:** ${settings.welcome_channel_id ? `<#${settings.welcome_channel_id}>` : '`Not set`'}`,
        `**Rules Channel:** ${settings.rules_channel_id ? `<#${settings.rules_channel_id}>` : '`Not set`'}`,
        `**Info Channel:** ${settings.info_channel_id ? `<#${settings.info_channel_id}>` : '`Not set`'}`,
        `**Chat Channel:** ${settings.chat_channel_id ? `<#${settings.chat_channel_id}>` : '`Not set`'}`,
        `**Bottom Welcome Image:** ${settings.welcome_image_url ? '`Set`' : '`Not set`'}`,
        `**Chat Welcome Channel:** ${settings.welcome_chat_channel_id ? `<#${settings.welcome_chat_channel_id}>` : '`Not set`'}`,
        `**Redirect Channels:** ${redirectList}`,
        `**Ping Button:** ${settings.ping_channel_id ? `<#${settings.ping_channel_id}>` : '`Not set`'}`,
      ].join('\n')
    )
    .setFooter({
      text: `Use ${prefix}welcomehelp for setup instructions`,
    });
}

module.exports = {
  name: 'welcomeset',
  aliases: [
    'welcomehelp',
    'welcomeimageset',
    'welcomechatset',
    'welcomeconfig',
  ],
  description: 'Configure the server welcome system.',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used inside a server.');
    }

    const prefix = client.getPrefix(message.guild.id);
    const trigger = message.content.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
    const settings = getSettings(message.guild.id);

    if (trigger === 'welcomehelp') {
      return message.reply({ embeds: [buildHelpEmbed(prefix)] });
    }

    if (trigger === 'welcomeconfig') {
      return message.reply({
        embeds: [buildConfigEmbed(message.guild, settings, prefix)],
      });
    }

    if (!hasManageGuild(message)) {
      return message.reply('❌ You need **Manage Server** permission to configure welcome settings.');
    }

    // IMPORTANT: $welcome is NOT an alias and does nothing here.
    if (trigger === 'welcomeset') {
      if (!args[0]) {
        return message.reply(
          `Usage:\n` +
          `\`${prefix}welcomeset #channel\`\n` +
          `\`${prefix}welcomeset rules #channel\`\n` +
          `\`${prefix}welcomeset info #channel\`\n` +
          `\`${prefix}welcomeset chat #channel\`\n` +
          `\`${prefix}welcomeset off\``
        );
      }

      const mode = args[0].toLowerCase();

      if (mode === 'off') {
        setSetting(message.guild.id, 'welcome_channel_id', null);
        return message.reply('✅ Main welcome embed disabled.');
      }

      if (mode === 'rules' || mode === 'info' || mode === 'chat') {
        const channel = resolveTextChannel(message, args[1]);
        if (!channel) return message.reply('❌ Please provide a valid text channel.');

        const map = {
          rules: 'rules_channel_id',
          info: 'info_channel_id',
          chat: 'chat_channel_id',
        };

        setSetting(message.guild.id, map[mode], channel.id);
        return message.reply(`✅ Main welcome **${mode}** channel set to ${channel}.`);
      }

      const channel = resolveTextChannel(message, args[0]);
      if (!channel) return message.reply('❌ Please provide a valid text channel.');

      setSetting(message.guild.id, 'welcome_channel_id', channel.id);
      return message.reply(`✅ Main welcome embed will now be sent in ${channel}.`);
    }

    if (trigger === 'welcomeimageset') {
      const mode = (args[0] || '').toLowerCase();

      if (mode === 'remove' || mode === 'off') {
        setSetting(message.guild.id, 'welcome_image_url', null);
        return message.reply('✅ Bottom welcome image removed.');
      }

      const attachment = message.attachments.first();
      const imageUrl = attachment?.url || args[0];

      if (!imageUrl) {
        return message.reply(
          `❌ Attach an image to the command or provide a direct image URL.\n\nExample:\n\`${prefix}welcomeimageset\` + attach your image`
        );
      }

      setSetting(message.guild.id, 'welcome_image_url', imageUrl);
      return message.reply('✅ Bottom welcome image updated.');
    }

    if (trigger === 'welcomechatset') {
      if (!args[0]) {
        return message.reply(
          `Usage:\n` +
          `\`${prefix}welcomechatset #channel\`\n` +
          `\`${prefix}welcomechatset redirect #channel1 #channel2 #channel3\`\n` +
          `\`${prefix}welcomechatset redirect off\`\n` +
          `\`${prefix}welcomechatset ping #channel\`\n` +
          `\`${prefix}welcomechatset ping off\`\n` +
          `\`${prefix}welcomechatset off\``
        );
      }

      const mode = args[0].toLowerCase();

      if (mode === 'off') {
        setSetting(message.guild.id, 'welcome_chat_channel_id', null);
        return message.reply('✅ Chat welcome embed disabled.');
      }

      // Reset / set multiple redirect channels at once
      if (mode === 'redirect') {
        const sub = (args[1] || '').toLowerCase();

        if (sub === 'off' || sub === 'clear' || sub === 'remove') {
          setSetting(message.guild.id, 'redirect_channel_ids', JSON.stringify([]));
          return message.reply('✅ Redirect buttons cleared.');
        }

        const rawChannels = args.slice(1);
        if (!rawChannels.length) {
          return message.reply(
            `❌ Usage:\n\`${prefix}welcomechatset redirect #channel1 #channel2 #channel3\``
          );
        }

        const resolved = rawChannels
          .map(token => resolveTextChannel(message, token))
          .filter(Boolean);

        if (!resolved.length) {
          return message.reply('❌ I could not find any valid text channels in that command.');
        }

        const uniqueIds = [...new Set(resolved.map(ch => ch.id))];
        setSetting(message.guild.id, 'redirect_channel_ids', JSON.stringify(uniqueIds));

        return message.reply(
          `✅ Redirect buttons updated for ${uniqueIds.length} channel(s).`
        );
      }

      if (mode === 'ping') {
        const sub = (args[1] || '').toLowerCase();

        if (sub === 'off' || sub === 'clear' || sub === 'remove') {
          setSetting(message.guild.id, 'ping_channel_id', null);
          return message.reply('✅ Ping button cleared.');
        }

        const channel = resolveTextChannel(message, args[1]);
        if (!channel) {
          return message.reply('❌ Please provide a valid text channel for ping.');
        }

        setSetting(message.guild.id, 'ping_channel_id', channel.id);
        return message.reply(`✅ Chat welcome Ping button set to ${channel}.`);
      }

      const channel = resolveTextChannel(message, args[0]);
      if (!channel) {
        return message.reply('❌ Please provide a valid text channel.');
      }

      setSetting(message.guild.id, 'welcome_chat_channel_id', channel.id);
      return message.reply(`✅ Chat welcome embed will now be sent in ${channel}.`);
    }

    return message.reply(
      `❌ Unknown welcome command. Use \`${prefix}welcomehelp\` for the setup commands.`
    );
  },
};