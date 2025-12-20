const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'warnremove',
  description: 'Remove a specific warn from a user.',
  category: 'mod',
  usage: '$warnremove <@user|userID> <warnNumber>',
  aliases: ['wrnremove'],
  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You lack permissions.');
    }

    const targetArg = args.shift();
    const indexArg = args.shift();

    if (!targetArg || !indexArg)
      return message.reply('Usage: $warnremove <user> <number>');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const warnIndex = parseInt(indexArg) - 1;
    if (isNaN(warnIndex) || warnIndex < 0) return message.reply('Invalid warn number.');

    // Check if automod system is available
    if (!client.automod || !client.automod.listWarns) {
      return message.reply('Automod warn system is not available.');
    }

    const guildId = message.guild.id;
    
    try {
      const warns = client.automod.listWarns(guildId, targetUser.id);
      
      if (!warns || warns.length === 0) {
        return message.reply('This user has no warnings.');
      }
      
      if (warnIndex >= warns.length) {
        return message.reply(`Warn number ${warnIndex + 1} not found. User has ${warns.length} warning(s).`);
      }

      const warnToRemove = warns[warnIndex];
      
      // Access database directly
      const automodModule = require('../handlers/automodHandler');
      const db = automodModule.db;
      
      // Delete the warn
      const deleteStmt = db.prepare('DELETE FROM automod_warns WHERE guild_id = ? AND user_id = ? AND id = ?');
      const result = deleteStmt.run(guildId, targetUser.id, warnToRemove.id);
      
      if (result.changes > 0) {
        // Get new count
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM automod_warns WHERE guild_id = ? AND user_id = ?');
        const newCount = countStmt.get(guildId, targetUser.id).count;
        
        // Update warn count
        const updateStmt = db.prepare(`
          INSERT OR REPLACE INTO automod_warn_counts (guild_id, user_id, count) 
          VALUES (?, ?, ?)
        `);
        updateStmt.run(guildId, targetUser.id, newCount);
        
        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('✅ Warn Removed')
          .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: false },
            { name: 'Removed by', value: `<@${message.author.id}>`, inline: false },
            { name: 'Removed Reason', value: warnToRemove.reason || 'No reason', inline: false },
            { name: 'Remaining Warns', value: `${newCount}`, inline: false }
          )
          .setTimestamp();
        
        await message.reply({ embeds: [embed] });
      } else {
        await message.reply('❌ Failed to remove warn.');
      }
      
    } catch (error) {
      console.error('Warnremove error:', error);
      return message.reply(`❌ Error: ${error.message}`);
    }
  },
};