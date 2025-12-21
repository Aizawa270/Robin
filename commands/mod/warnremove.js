const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logModAction } = require('../../handlers/modstatsHelper');

const WARN_FILE = path.join(__dirname, '../../warns.json');

module.exports = {
  name: 'warnremove',
  description: 'Remove a specific warn from a user.',
  category: 'mod',
  usage: '$warnremove <@user|userID> <warnNumber> [reason]',
  aliases: ['wrnremove', 'removewarn', 'delwarn'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You need Moderate Members permission.');
    }

    if (args.length < 2) {
      const embed = new EmbedBuilder()
        .setColor('#fde047')
        .setTitle('Warnremove Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$warnremove <@user|userID> <warnNumber> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$warnremove @User 1 false positive`\n' +
          '`$warnremove 123456789012345678 2 apology accepted`\n\n' +
          '**Note:** Use `$warns <user>` to see warn numbers.'
        );
      return message.reply({ embeds: [embed] });
    }

    const targetArg = args.shift();
    const warnNumArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    const targetUser = message.mentions.users.first() || 
                      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const warnIndex = parseInt(warnNumArg) - 1;
    if (isNaN(warnIndex) || warnIndex < 0) {
      return message.reply('Invalid warn number. Must be 1 or higher.');
    }

    const guildId = message.guild.id;
    const userId = targetUser.id;

    try {
      // Get SQLite warns
      const sqliteWarns = client.automodDB.prepare(`
        SELECT id, reason, moderator_id, timestamp 
        FROM automod_warns 
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
      `).all(guildId, userId);

      // Get JSON warns
      const jsonWarns = fs.existsSync(WARN_FILE) ? JSON.parse(fs.readFileSync(WARN_FILE, 'utf8')) : {};
      const userJsonWarns = jsonWarns[userId] || [];

      const totalWarns = sqliteWarns.length + userJsonWarns.length;
      
      if (totalWarns === 0) {
        return message.reply('This user has no warnings.');
      }

      // Check if index is valid
      if (warnIndex >= totalWarns) {
        return message.reply(`Warn #${warnNumArg} not found. User has only ${totalWarns} warning(s).\nUse \`$warns ${targetUser.id}\` to see the list.`);
      }

      let removedReason = 'Unknown reason';
      let removedFrom = '';
      
      // Remove from SQLite if index is in SQLite range
      if (warnIndex < sqliteWarns.length) {
        const warnToRemove = sqliteWarns[warnIndex];
        removedReason = warnToRemove.reason || 'No reason';
        removedFrom = 'SQLite database';
        
        // Delete from SQLite
        client.automodDB.prepare(`DELETE FROM automod_warns WHERE id = ?`).run(warnToRemove.id);
        
        // Update SQLite count
        const newSqliteCount = sqliteWarns.length - 1;
        client.automodDB.prepare(`
          INSERT OR REPLACE INTO automod_warn_counts (guild_id, user_id, count)
          VALUES (?, ?, ?)
        `).run(guildId, userId, newSqliteCount);
        
      } else {
        // Remove from JSON (adjust index for JSON array)
        const jsonIndex = warnIndex - sqliteWarns.length;
        if (jsonIndex < userJsonWarns.length) {
          const warnToRemove = userJsonWarns[jsonIndex];
          removedReason = warnToRemove.reason || 'No reason';
          removedFrom = 'JSON file';
          
          // Remove from JSON array
          userJsonWarns.splice(jsonIndex, 1);
          jsonWarns[userId] = userJsonWarns;
          
          // If array is empty, delete the user entry
          if (userJsonWarns.length === 0) {
            delete jsonWarns[userId];
          }
          
          // Save JSON file
          fs.writeFileSync(WARN_FILE, JSON.stringify(jsonWarns, null, 2));
        }
      }

      // 🔹 Log to modstats
      const modstatsReason = `Removed warn #${warnNumArg}: ${removedReason} | Reason: ${reason}`;
      logModAction(client, guildId, message.author.id, userId, 'warnremove', modstatsReason);

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Warn Removed Successfully')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Removed from', value: removedFrom, inline: true },
          { name: 'Removed by', value: `<@${message.author.id}>`, inline: true },
          { name: 'Removed Warn Reason', value: removedReason.length > 200 ? removedReason.substring(0, 197) + '...' : removedReason, inline: false },
          { name: 'Removal Reason', value: reason.length > 200 ? reason.substring(0, 197) + '...' : reason, inline: false }
        )
        .setFooter({ text: `Warn #${warnNumArg} removed` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Warnremove command error:', error);
      await message.reply(`Error: ${error.message}`);
    }
  },
};