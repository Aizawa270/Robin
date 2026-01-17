// commands/misc/watchword.js
const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
let watchwordDB;
try {
  const DATA_DIR = path.join(__dirname, '..', '..', 'data');
  watchwordDB = new Database(path.join(DATA_DIR, 'watchwords.sqlite'));
  watchwordDB.pragma('journal_mode = WAL');
  
  watchwordDB.prepare(`
    CREATE TABLE IF NOT EXISTS watchwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      word TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')*1000),
      UNIQUE(user_id, guild_id, word)
    )
  `).run();
} catch (err) {
  console.error('[Watchword] DB init failed:', err);
}

module.exports = {
  name: 'watchword',
  description: 'Get notified when specific words are mentioned',
  category: 'misc',
  usage: 'watchword <add/remove/list> [word]',
  aliases: ['ww', 'watch'],
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!watchwordDB) {
      return message.reply('Watchword system is unavailable.');
    }

    const subcommand = args[0]?.toLowerCase();

    // Delete user's command message for privacy
    try {
      await message.delete();
    } catch (e) {
      // Ignore if can't delete
    }

    if (!subcommand || !['add', 'remove', 'list'].includes(subcommand)) {
      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('👁️ Watchword System')
        .setDescription(
          'Get notified via DM when specific words are mentioned in chat!\n\n' +
          '**Commands:**\n' +
          '• `!watchword add <word>` - Add a word to watch\n' +
          '• `!watchword remove <word>` - Remove a word\n' +
          '• `!watchword list` - View your watchwords\n\n' +
          '**Example:**\n' +
          '`!watchword add Alex`\n' +
          '`!watchword remove Alex`\n\n' +
          '**Privacy:**\n' +
          'All commands are anonymous - your message will be deleted immediately.'
        )
        .setFooter({ text: 'Only you can see this • Max 10 words per server' });

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 15000);
      return;
    }

    // ADD WATCHWORD
    if (subcommand === 'add') {
      const word = args.slice(1).join(' ').toLowerCase().trim();

      if (!word) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription('❌ Please provide a word to watch!\n\n**Usage:** `!watchword add <word>`')
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }

      if (word.length > 50) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription('❌ Word must be 50 characters or less!')
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }

      // Check word limit (max 10 per user per server)
      const count = watchwordDB.prepare(
        'SELECT COUNT(*) as count FROM watchwords WHERE user_id = ? AND guild_id = ?'
      ).get(message.author.id, message.guild.id)?.count || 0;

      if (count >= 10) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription('❌ You can only have up to **10 watchwords** per server!\n\nUse `!watchword list` to see your current words.')
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }

      // Add word
      try {
        watchwordDB.prepare(
          'INSERT OR IGNORE INTO watchwords (user_id, guild_id, word) VALUES (?, ?, ?)'
        ).run(message.author.id, message.guild.id, word);

        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Watchword Added')
          .setDescription(
            `You will now receive a DM whenever **"${word}"** is mentioned in this server.\n\n` +
            `**What happens next?**\n` +
            `• When someone types this word, you'll get a DM\n` +
            `• The DM includes the full message and context\n` +
            `• Your watchword is completely anonymous\n\n` +
            `Use \`!watchword list\` to view all your watchwords.`
          )
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 15000);
      } catch (err) {
        console.error('[Watchword] Add error:', err);
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription('❌ Failed to add watchword. It may already exist.')
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
      }
      return;
    }

    // REMOVE WATCHWORD
    if (subcommand === 'remove') {
      const word = args.slice(1).join(' ').toLowerCase().trim();

      if (!word) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription('❌ Please provide a word to remove!\n\n**Usage:** `!watchword remove <word>`')
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }

      const result = watchwordDB.prepare(
        'DELETE FROM watchwords WHERE user_id = ? AND guild_id = ? AND word = ?'
      ).run(message.author.id, message.guild.id, word);

      if (result.changes > 0) {
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Watchword Removed')
          .setDescription(`You will no longer receive DMs for **"${word}"**.`)
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
      } else {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription(`❌ You don't have **"${word}"** in your watchlist.\n\nUse \`!watchword list\` to see your current words.`)
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 10000);
      }
      return;
    }

    // LIST WATCHWORDS
    if (subcommand === 'list') {
      const words = watchwordDB.prepare(
        'SELECT word FROM watchwords WHERE user_id = ? AND guild_id = ? ORDER BY created_at DESC'
      ).all(message.author.id, message.guild.id);

      if (words.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ec4899')
          .setTitle('👁️ Your Watchwords')
          .setDescription(
            'You have no watchwords set up in this server.\n\n' +
            '**Get started:**\n' +
            '`!watchword add <word>` to add your first watchword!'
          )
          .setFooter({ text: 'Only you can see this' });

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 15000);
        return;
      }

      const wordList = words.map((w, i) => `${i + 1}. **${w.word}**`).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('👁️ Your Watchwords')
        .setDescription(
          `You're watching **${words.length}** word${words.length === 1 ? '' : 's'} in this server:\n\n${wordList}\n\n` +
          `**Commands:**\n` +
          `• \`!watchword add <word>\` - Add a word\n` +
          `• \`!watchword remove <word>\` - Remove a word`
        )
        .setFooter({ text: `Only you can see this • ${words.length}/10 watchwords used` });

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 20000);
      return;
    }
  }
};

// Message listener to check for watchwords
if (watchwordDB) {
  module.exports.checkWatchwords = async (client, message) => {
    if (!message.guild || message.author.bot) return;
    if (!watchwordDB) return;

    const content = message.content.toLowerCase();
    if (!content) return;

    // Get all watchwords for this guild
    const watchwords = watchwordDB.prepare(
      'SELECT user_id, word FROM watchwords WHERE guild_id = ?'
    ).all(message.guild.id);

    for (const { user_id, word } of watchwords) {
      // Skip if it's the user's own message
      if (user_id === message.author.id) continue;

      // Check if word appears in message (whole word match)
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(message.content)) {
        try {
          const user = await client.users.fetch(user_id).catch(() => null);
          if (!user) continue;

          const embed = new EmbedBuilder()
            .setColor('#ec4899')
            .setTitle('👁️ Watchword Detected')
            .setDescription(
              `Your watchword **"${word}"** was mentioned in **${message.guild.name}**!`
            )
            .addFields(
              { name: '💬 Message', value: message.content.substring(0, 1024) || 'No content' },
              { name: '👤 Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
              { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
              { name: '🔗 Jump to Message', value: `[Click here](${message.url})` }
            )
            .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
            .setTimestamp()
            .setFooter({ text: `Server: ${message.guild.name}` });

          await user.send({ embeds: [embed] }).catch(() => {
            // User has DMs disabled or blocked bot
          });
        } catch (err) {
          console.error('[Watchword] DM send error:', err);
        }
      }
    }
  };
}
