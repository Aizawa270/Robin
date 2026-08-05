const { EmbedBuilder } = require('discord.js');
const { canManageEconomy, resolveTargetUser } = require('../../handlers/economyHelpers');

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer) {
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }

    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

module.exports = {
  name: 'ecadd',
  aliases: [],
  description: 'Add Crowns to a user.',
  category: 'economy',
  usage: '$ecadd money <amount> <@user|id|username>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!canManageEconomy(client, message)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Access Denied',
            description: 'Only the bot owner or server owner can use this command.',
          }),
        ],
      });
    }

    if (!client.economy) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Economy Unavailable',
            description: 'The economy system is not initialized.',
          }),
        ],
      });
    }

    let amountRaw;
    let targetRaw;

    if ((args[0] || '').toLowerCase() === 'money') {
      amountRaw = args[1];
      targetRaw = args.slice(2).join(' ');
    } else {
      amountRaw = args[0];
      targetRaw = args.slice(1).join(' ');
    }

    const amount = parseInt(amountRaw, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Usage',
            description: 'Use: `$ecadd money <amount> <@user|id|username>`',
          }),
        ],
      });
    }

    const target =
      message.mentions.users.first() ||
      (targetRaw ? await resolveTargetUser(client, message, targetRaw) : null);

    if (!target) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'User Not Found',
            description: 'Give a valid user mention, ID, or exact username.',
          }),
        ],
      });
    }

    const result = client.economy.addCrowns(message.guild.id, target.id, amount, {
      type: 'admin_add',
      reason: `Added by ${message.author.tag}`,
      actorId: message.author.id,
    });

    if (!result) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Failed',
            description: 'Could not add Crowns.',
          }),
        ],
      });
    }

    const member =
      message.guild.members.cache.get(target.id) ||
      await message.guild.members.fetch(target.id).catch(() => null);

    const displayName = member?.displayName || target.username;

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Crowns Added',
          description:
            `Added **${formatNumber(amount)} Crowns** to **${displayName}**.\n\n` +
            `New Balance: **${formatNumber(result.balance)} Crowns**`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  },
};