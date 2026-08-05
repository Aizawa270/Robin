const { EmbedBuilder } = require('discord.js');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  return embed;
}

function footerText(client) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${client.user?.username || 'Bot'} | Today at ${time}`;
}

module.exports = {
  name: 'echelp',
  aliases: [],
  description: 'Show economy commands.',
  category: 'economy',
  usage: '$echelp',

  async execute(client, message) {
    if (!message.guild) return;

    const embed = buildEmbed(message, {
      title: 'Economy Help',
      description:
        '**Balance**\n' +
        '`balance [@user|id|username]`\n\n' +
        '**Leaderboard**\n' +
        '`eclb` or `ecleaderboard`\n\n' +
        '**Admin**\n' +
        '`ecadd money <amount> <@user|id|username>`\n' +
        '`ecremove money <amount> <@user|id|username>`\n\n' +
        '**Gambling**\n' +
        '`coinflip <amount> <h/t>`\n' +
        '`dice <amount> <number1> <number2>`\n' +
        '`blackjack <amount>`\n\n' +
        '**Steal**\n' +
        '`ecsteal <@user|id|username>`\n\n' +
        '**Passive Income**\n' +
        '30 Crowns every 60 seconds from valid messages.\n\n' +
        '**Notes**\n' +
        'Weekly and monthly message leaderboard payouts reset automatically.',
      footer: footerText(client),
    });

    return message.reply({ embeds: [embed] });
  },
};