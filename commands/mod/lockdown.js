const { PermissionFlagsBits, ChannelType } = require('discord.js');

const AUTHORIZED_ROLES = ['1431651904269848667']; // director

function parseDuration(input) {
  if (!input) return null;
  const match = input.match(/^(\d+)(s|m|h)$/);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];

  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  return null;
}

module.exports = {
  name: 'lockdown',
  description: 'Lock a channel so only admins can speak',
  category: 'mod',
  usage: '!lockdown [channel|id] [duration]',
  aliases: [],

  async execute(client, message, args) {
    if (!message.guild) return;

    // Check for Administrator OR authorized role
    const hasAuthorizedRole = AUTHORIZED_ROLES.some(roleId => 
      message.member.roles.cache.has(roleId)
    );

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasAuthorizedRole) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    let channel =
      message.mentions.channels.first() ||
      (args[0] && /^\d+$/.test(args[0])
        ? message.guild.channels.cache.get(args[0])
        : message.channel);

    if (!channel || channel.type !== ChannelType.GuildText) {
      return message.reply('❌ Invalid channel.');
    }

    const durationArg = args.find(a => /[smh]$/.test(a));
    const duration = parseDuration(durationArg);

    await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false,
    });

    await message.reply(`🔒 **${channel.name}** is now locked.`);

    if (duration) {
      setTimeout(async () => {
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: null,
        }).catch(() => {});

        channel.send('🔓 **Lockdown lifted.**').catch(() => {});
      }, duration);
    }
  },
};
