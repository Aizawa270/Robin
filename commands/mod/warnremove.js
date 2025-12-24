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

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (args.length < 2) {
      const embed = new EmbedBuilder()
        .setColor('#fde047')
        .setTitle('Warnremove Command Usage')
        .setDescription(
          '**Usage:**\n' +
          `\`${prefix}warnremove <@user|userID> <warnNumber> [reason]\`\n\n` +
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
    if (isNaN(warnIndex) || warnIndex < 0) return message.reply('Invalid warn number. Must be 1 or higher.');

    const guildId = message.guild.id;
    const userId = targetUser.id;

    try {
      console.log(`[Warnremove] Removing warn #${warnNumArg} from ${userId} in guild ${guildId}`);

      if (!client.automodDB) return message.reply('Database not available. Please restart the bot.');

      const sqliteWarns = client.automodDB.prepare(`
        SELECT id, reason, moderator_id, timestamp 
        FROM automod_warns 
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
      `).all(guildId, userId);

      const jsonWarns = fs.existsSync(WARN_FILE) ? JSON.parse(fs.readFileSync(WARN_FILE, 'utf8')) : {};
      const userJsonWarns = jsonWarns[userId] || [];

      const totalWarns = sqliteWarns.length + userJsonWarns.length;
      if (totalWarns === 0) return message.reply('This user has no warnings.');
      if (warnIndex >= totalWarns) return message.reply(`Warn #${warnNumArg} not found. User has only ${totalWarns} warning(s).`);

      let removedReason = 'Unknown reason';
      let removedModerator = 'Unknown';

      // Remove from SQLite
      if (warnIndex < sqliteWarns.length) {
        const warnToRemove = sqliteWarns[warnIndex];
        removedReason = warnToRemove.reason || 'No reason';
        try {
          const mod = await client.users.fetch(warnToRemove.moderator_id).catch(() => null);
          removedModerator = mod ? mod.tag : `ID: ${warnToRemove.moderator_id}`;
        } catch { removedModerator = `ID: ${warnToRemove.moderator_id}`; }

        client.automodDB.prepare(`DELETE FROM automod_warns WHERE id = ?`).run(warnToRemove.id);
        const newSqliteCount = sqliteWarns.length - 1;
        client.automodDB.prepare(`
          INSERT OR REPLACE INTO automod_warn_counts (guild_id, user_id, count)
          VALUES (?, ?, ?)
        `).run(guildId, userId, newSqliteCount);
      } else {
        // Remove from JSON
        const jsonIndex = warnIndex - sqliteWarns.length;
        if (jsonIndex < userJsonWarns.length) {
          const warnToRemove = userJsonWarns[jsonIndex];
          removedReason = warnToRemove.reason || 'No reason';
          removedModerator = warnToRemove.moderator || 'Unknown';
          userJsonWarns.splice(jsonIndex, 1);
          if (userJsonWarns.length === 0) delete jsonWarns[userId];
          else jsonWarns[userId] = userJsonWarns;
          fs.writeFileSync(WARN_FILE, JSON.stringify(jsonWarns, null, 2));
        }
      }

      const updatedSqliteWarns = client.automodDB.prepare(`
        SELECT COUNT(*) as count FROM automod_warns 
        WHERE guild_id = ? AND user_id = ?
      `).get(guildId, userId);
      const updatedJsonWarns = jsonWarns[userId] || [];
      const updatedTotalWarns = (updatedSqliteWarns?.count || 0) + updatedJsonWarns.length;

      // Log to modstats
      logModAction(
        client,
        guildId,
        message.author.id,
        userId,
        'warnremove',
        `Removed warn #${warnNumArg}: "${removedReason.substring(0, 100)}" | Reason: ${reason}`
      );

      // 🔹 Fixed embed to match warn embed style
      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('✅ Warn Removed')
        .setDescription(`A warning has been successfully removed from <@${targetUser.id}>.`)
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Warn #', value: warnNumArg, inline: true },
          { name: 'Removed by', value: `<@${message.author.id}>`, inline: true },
          { name: 'Original Reason', value: removedReason.length > 100 ? removedReason.substring(0, 97) + '...' : removedReason, inline: false },
          { name: 'Original Moderator', value: removedModerator, inline: true },
          { name: 'Removal Reason', value: reason, inline: false },
          { name: 'Remaining Warns', value: `${updatedTotalWarns}/5`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Use ${prefix}warns <user> to see remaining warnings` });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Warnremove command error:', error);
      await message.reply('Failed to remove warning. Check console for details.');
    }
  },
};