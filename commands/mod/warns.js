const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'warns',
  aliases: ['warnings'],
  description: 'Shows all warns for a user.',
  category: 'mod',
  usage: '$warns <@user|userID>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    const perms = message.member.permissions;
    if (
      !perms.has(PermissionFlagsBits.ModerateMembers) &&
      !perms.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('No perms.');
    }

    const targetArg = args[0];
    if (!targetArg) return message.reply('Provide a user.');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    // ===== GET ALL WARNS (AUTOMOD + FILE) =====
    let allWarnings = [];
    let totalCount = 0;
    
    try {
      // 1. Get automod warnings from SQLite
      if (client.automod && typeof client.automod.listWarns === 'function') {
        const automodWarns = client.automod.listWarns(message.guild.id, targetUser.id) || [];
        automodWarns.forEach(warn => {
          allWarnings.push({
            reason: warn.reason || 'No reason provided',
            moderator: warn.moderator_id ? `<@${warn.moderator_id}>` : 'System (Automod)',
            timestamp: warn.timestamp,
            source: 'automod'
          });
        });
      }
      
      // 2. Get file warnings (legacy)
      const fs = require('fs');
      const path = require('path');
      const WARN_FILE = path.join(__dirname, '../../warns.json');
      
      if (fs.existsSync(WARN_FILE)) {
        try {
          const warns = JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
          const userWarns = warns[targetUser.id] || [];
          
          userWarns.forEach(w => {
            let modPing = 'Unknown';
            if (w.moderator && w.moderator.includes('(')) {
              const id = w.moderator.match(/\((\d+)\)/)?.[1];
              if (id) modPing = `<@${id}>`;
            }
            
            allWarnings.push({
              reason: w.reason || 'No reason provided',
              moderator: modPing,
              timestamp: w.timestamp,
              source: 'file'
            });
          });
        } catch (fileErr) {
          console.log('File warn load error:', fileErr.message);
        }
      }
      
      totalCount = allWarnings.length;
      
      // Sort by timestamp (newest first)
      allWarnings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
    } catch (err) {
      console.error('warns error:', err);
      return message.reply('Error loading warnings.');
    }

    // ===== SHOW RESULTS =====
    if (totalCount === 0) {
      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('✅ No Warnings')
        .setDescription(`**${targetUser.tag}** has no warnings.`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .setFooter({ 
          text: `Requested by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ size: 64 })
        })
        .setTimestamp();
      
      return message.reply({ embeds: [embed] });
    }

    // ===== BUILD EMBED WITH WARNINGS =====
    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle(`⚠️ ${targetUser.tag}'s Warnings`)
      .setDescription(`Total warnings: **${totalCount}**`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setFooter({ 
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL({ size: 64 })
      })
      .setTimestamp();

    // Add up to 5 most recent warnings
    const recentWarns = allWarnings.slice(0, 5);
    
    for (let i = 0; i < recentWarns.length; i++) {
      const warn = recentWarns[i];
      const date = warn.timestamp 
        ? `<t:${Math.floor(new Date(warn.timestamp).getTime() / 1000)}:R>`
        : 'Unknown time';
      
      embed.addFields({
        name: `Warning ${i + 1}`,
        value: `**Reason:** ${warn.reason}\n**By:** ${warn.moderator}\n**When:** ${date}`,
        inline: false
      });
    }

    // Add note if there are more warnings
    if (totalCount > 5) {
      embed.addFields({
        name: '📝 Note',
        value: `Showing 5 most recent warnings out of ${totalCount} total.`,
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });
  },
};