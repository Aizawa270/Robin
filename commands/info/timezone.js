const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'timezones.sqlite');
const db = new Database(dbPath);

module.exports = {
  name: 'timezone',
  aliases: ['tz'],
  description: 'Check the current time in your set timezone.',
  category: 'utility',
  usage: '$timezone [@user]',
  async execute(client, message, args) {
    // Determine target user
    let targetUser = message.author;
    let targetMention = '';

    if (args[0]) {
      const mentionedUser = message.mentions.users.first();
      if (mentionedUser) {
        targetUser = mentionedUser;
        targetMention = ` for ${targetUser.tag}`;
      } else {
        try {
          const user = await client.users.fetch(args[0]);
          targetUser = user;
          targetMention = ` for ${targetUser.tag}`;
        } catch {}
      }
    }

    // Get timezone from database
    const row = db.prepare('SELECT timezone FROM user_timezones WHERE user_id = ?').get(targetUser.id);

    if (!row) {
      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setDescription(targetUser.id === message.author.id 
          ? `You haven't set your timezone yet.\nUse \`$settimezone <timezone>\` to set it.` 
          : `${targetUser.tag} hasn't set their timezone yet.`);

      return message.reply({ embeds: [embed] });
    }

    const timezone = row.timezone;
    const now = new Date();

    // Format in 12-hour
    const time12hr = now.toLocaleString('en-US', { 
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`Current Time${targetMention}`)
      .setDescription(`**${time12hr}**`)
      .setFooter({ text: `Timezone: ${timezone}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};