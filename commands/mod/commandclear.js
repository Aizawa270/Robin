const { PermissionFlagsBits } = require('discord.js');

const AUTHORIZED_ROLES = [
  '1432015105045954651', // manager invis
  '1431651904269848667'  // director
];

module.exports = {
  name: 'commandclear',
  description: 'Delete the most recent messages sent by the bot',
  category: 'mod',
  usage: 'commandclear <amount>',
  async execute(client, message, args) {
    // Check for Administrator OR authorized role
    const hasAuthorizedRole = AUTHORIZED_ROLES.some(roleId => 
      message.member.roles.cache.has(roleId)
    );

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasAuthorizedRole) {
      return message.reply('You do not have permission to use this command.');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('I need Manage Messages permission.');
    }

    const amount = parseInt(args[0]);

    if (!amount || isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('Provide a number between 1 and 100.');
    }

    try {
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      const botMessages = fetched.filter(m => m.author.id === client.user.id);
      const toDelete = Array.from(botMessages.values()).slice(0, amount);

      if (toDelete.length === 0) {
        return message.reply('No bot messages found.');
      }

      let count = 0;
      for (const msg of toDelete) {
        await msg.delete().catch(() => {});
        count++;
      }

      const reply = await message.reply(`Deleted ${count} bot messages.`);
      setTimeout(() => reply.delete().catch(() => {}), 5000);

    } catch (err) {
      console.error('[CommandClear]', err);
      message.reply('Failed to delete messages.');
    }
  }
};
