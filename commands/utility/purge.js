const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'purge',
  description: 'Deletes messages (up to 300).',
  category: 'utility',
  usage: '$purge <amount>',
  async execute(client, message, args) {
    // ✅ DYNAMIC PREFIX
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';
    
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // ✅ EMBED FOR NON-ADMINS
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor('#ef4444') // Red color
        .setTitle('⛔ Permission Denied')
        .setDescription(`**${message.author.tag}**, you don't have permission to use this command.`)
        .addFields(
          { name: 'Required Permission', value: '`Administrator`', inline: true },
          { name: 'Your Role', value: message.member.roles.highest.name || 'No role', inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL({ size: 64 }))
        .setFooter({ text: 'Admin-only command' })
        .setTimestamp();
      
      return message.reply({ embeds: [embed] });
    }

    // Bot permission check
    if (!message.guild.members.me.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('I need **Manage Messages** permission.');
    }

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0) {
      return message.reply(`Please provide a valid number. Example: \`${prefix}purge 20\``);
    }

    if (amount > 300) {
      return message.reply(`I can only delete up to **300** messages. Use \`${prefix}purge 300\` or less.`);
    }

    // ... (your purge deletion logic here) ...

    const confirmation = await message.channel.send(`Deleted **${deletedCount}** messages.`);
    setTimeout(() => confirmation.delete().catch(() => {}), 3000);
  },
};