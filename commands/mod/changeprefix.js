module.exports = {
  name: 'changeprefix',
  aliases: ['cp'],
  hidden: true, // Won’t appear in help
  description: 'Change the bot prefix for this server.',
  category: 'utility',
  usage: '$changeprefix <newPrefix>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');
    if (!message.member.permissions.has('Administrator')) return message.reply('Only admins can change the prefix.');

    const newPrefix = args[0];
    if (!newPrefix) return message.reply('Please provide a new prefix.');

    client.prefixDB.prepare(`
      INSERT OR REPLACE INTO prefixes (guild_id, prefix)
      VALUES (?, ?)
    `).run(message.guild.id, newPrefix);

    return message.reply(`Prefix successfully changed to: \`${newPrefix}\``);
  },
};