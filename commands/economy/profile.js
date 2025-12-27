// commands/economy/profile.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'profile',
  description: 'Show economy profile.',
  category: 'economy',
  usage: '!profile [user]',
  aliases: ['prof'],
  async execute(client, message, args) {
    const target = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(()=>null) : null) || message.author;
    if (!target) return message.reply('User not found.');

    econ.ensureUser(target.id);
    const u = econ.getUser(target.id);

    const inv = JSON.parse(u.inventory || '[]');
    const embed = new EmbedBuilder()
      .setColor('#0ea5e9')
      .setTitle(`${target.tag} — Profile`)
      .addFields(
        { name: 'Wallet', value: `${u.wallet}`, inline: true },
        { name: 'Bank', value: `${u.bank}`, inline: true },
        { name: 'Faction', value: `${u.faction_id || 'None'}`, inline: true },
        { name: 'Inventory', value: `${inv.length} items`, inline: true }
      )
      .setThumbnail(target.displayAvatarURL({ size: 512 }));

    return message.reply({ embeds: [embed] });
  }
};