const { default: Database } = require('better-sqlite3');

module.exports = {
  name: 'changeprefix',
  aliases: ['cp'],
  hidden: true, // won't show in help
  description: 'Change the bot prefix for this server.',
  usage: '$changeprefix <newPrefix>',
  category: 'utility',
  async execute(client, message, args) {
    // Only allow specific owners
    const allowed = ['YOUR_USER_ID', 'FRIEND_USER_ID']; // replace with actual Discord IDs
    if (!allowed.includes(message.author.id)) return;

    const newPrefix = args[0];
    if (!newPrefix) return message.reply('Provide a new prefix. Example: `$changeprefix !`');

    if (!client.prefixDB) {
      // Init prefix DB if not exists
      const path = require('path');
      const fs = require('fs');
      const DATA_DIR = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

      const Database = require('better-sqlite3');
      client.prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
      client.prefixDB.prepare('CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)').run();
    }

    client.prefixDB.prepare(`
      INSERT OR REPLACE INTO prefixes (guild_id, prefix)
      VALUES (?, ?)
    `).run(message.guild.id, newPrefix);

    message.reply(`Server prefix updated to: \`${newPrefix}\``);
  },
};