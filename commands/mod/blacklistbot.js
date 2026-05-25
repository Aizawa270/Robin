// commands/mod/blacklistbot.js
const { EmbedBuilder } = require('discord.js');

const OWNER_ID = '852839588689870879';

module.exports = {
  name: 'blacklistbot',
  aliases: ['bla', 'blr'],
  description: 'Blacklist or unblacklist a user from using the bot',
  category: 'mod',
  usage: 'blacklistbot <add|remove> <@user|user_id>',

  async execute(client, message, args) {
    // Owner only
    if (message.author.id !== OWNER_ID) return;

    // Resolve sub based on alias used or first arg
    let sub = args[0]?.toLowerCase();
    const invokedAs = message.content.trim().split(/\s+/)[0].replace(/^\$/, '').toLowerCase();

    if (invokedAs === 'bla') sub = 'add';
    if (invokedAs === 'blr') sub = 'remove';

    if (sub !== 'add' && sub !== 'remove') {
      const helpEmbed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('Blacklist Bot')
        .setDescription(
          '**Usage:**\n' +
          '`blacklistbot add <@user|id>` — Block user from bot\n' +
          '`blacklistbot remove <@user|id>` — Unblock user\n\n' +
          '**Aliases:** `bla` = add, `blr` = remove'
        );
      return message.reply({ embeds: [helpEmbed] });
    }

    // Resolve user
    const targetId =
      message.mentions.users.first()?.id ||
      (args[1]?.match(/^\d{17,20}$/) ? args[1] : null);

    if (!targetId) {
      const errEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Invalid User')
        .setDescription('Provide a valid ping or user ID.');
      return message.reply({ embeds: [errEmbed] });
    }

    if (targetId === OWNER_ID) {
      const errEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Nice try');
      return message.reply({ embeds: [errEmbed] });
    }

    let targetUser;
    try {
      targetUser = await client.users.fetch(targetId);
    } catch {
      const errEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ User Not Found')
        .setDescription(`Could not fetch user \`${targetId}\`.`);
      return message.reply({ embeds: [errEmbed] });
    }

    // Read current blacklist from DB
    const db = client.prefixlessDB; // reuse existing sqlite instance — or swap to a dedicated one
    // We'll store bot blacklist in its own table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS bot_blacklist (
        user_id TEXT PRIMARY KEY
      )
    `).run();

    if (sub === 'add') {
      const already = db.prepare('SELECT user_id FROM bot_blacklist WHERE user_id = ?').get(targetId);
      if (already) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Already Blacklisted')
          .setDescription(`**${targetUser.tag}** is already blacklisted from the bot.`);
        return message.reply({ embeds: [embed] });
      }

      db.prepare('INSERT INTO bot_blacklist (user_id) VALUES (?)').run(targetId);

      // Sync to memory set if it exists
      if (client.botBlacklist instanceof Set) {
        client.botBlacklist.add(targetId);
      } else {
        client.botBlacklist = new Set(
          db.prepare('SELECT user_id FROM bot_blacklist').all().map(r => r.user_id)
        );
      }

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setAuthor({ name: 'Vanessa', iconURL: client.user.displayAvatarURL() })
        .setTitle('🚫 User Blacklisted')
        .setDescription(
          `**${targetUser.tag}** has been restricted from using Vanessa.\n\n` +
          `> You're restricted from using Vanessa.`
        )
        .addFields({ name: 'User ID', value: `\`${targetId}\``, inline: true })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Action by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const exists = db.prepare('SELECT user_id FROM bot_blacklist WHERE user_id = ?').get(targetId);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Not Blacklisted')
          .setDescription(`**${targetUser.tag}** isn't blacklisted.`);
        return message.reply({ embeds: [embed] });
      }

      db.prepare('DELETE FROM bot_blacklist WHERE user_id = ?').run(targetId);

      if (client.botBlacklist instanceof Set) {
        client.botBlacklist.delete(targetId);
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setAuthor({ name: 'Vanessa', iconURL: client.user.displayAvatarURL() })
        .setTitle('✅ Blacklist Removed')
        .setDescription(`**${targetUser.tag}** can now use Vanessa again.`)
        .addFields({ name: 'User ID', value: `\`${targetId}\``, inline: true })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Action by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },
};
