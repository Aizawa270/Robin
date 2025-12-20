const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

module.exports = {
  name: 'changeprefix',
  aliases: ['cp'],
  hidden: true, // won't show in help
  description: 'Change the bot prefix for this server.',
  usage: '$changeprefix <newPrefix>',
  category: 'utility',
  async execute(client, message, args) {
    // Only allow you and your friend
    const allowed = ['852839588689870879', '965303319784464454'];
    if (!allowed.includes(message.author.id)) return;

    if (!message.guild) return message.reply('This command only works in a server.');

    const newPrefix = args[0];
    if (!newPrefix) return message.reply('Provide a new prefix. Example: `$changeprefix !`');

    // Init prefix DB if not exists
    if (!client.prefixDB) {
      const DATA_DIR = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

      client.prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
      client.prefixDB.prepare('CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)').run();
    }

    // Update the prefix for this server
    client.prefixDB.prepare(`
      INSERT OR REPLACE INTO prefixes (guild_id, prefix)
      VALUES (?, ?)
    `).run(message.guild.id, newPrefix);

    message.reply(`Server prefix updated to: \`${newPrefix}\``);
  },
};