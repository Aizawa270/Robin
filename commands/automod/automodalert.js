const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'automodalert',
  aliases: ['aal'],
  description: 'Manage automod alert list: add/remove/list (roles or users).',
  category: 'automod',
  hidden: true,
  usage: '$automodalert <add|remove|list> <@user|@role|id>',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('Admins only.');
    }

    // Check if automod is initialized
    if (!client.automod) {
      return message.reply('Automod system not initialized. Please restart the bot.');
    }

    const sub = (args.shift() || '').toLowerCase();
    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply('Usage: `$automodalert add|remove|list [@user|@role|id]`');
    }

    // Get dynamic prefix
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (sub === 'list') {
      try {
        const rows = client.automod.listAlertTargets(message.guild.id);
        
        const embed = new EmbedBuilder()
          .setColor('#3b82f6')
          .setTitle('📋 Automod Alert List')
          .setTimestamp();

        if (!rows.length) {
          embed.setDescription('No alert targets configured.');
          embed.setFooter({ text: `Use ${prefix}automodalert add to add targets` });
        } else {
          const users = [];
          const roles = [];
          for (const r of rows) {
            if (r.target_type === 'user') users.push(`<@${r.target_id}>`);
            else roles.push(`<@&${r.target_id}>`);
          }

          embed.addFields(
            { 
              name: `👑 Roles (${roles.length})`, 
              value: roles.length ? roles.join(' ') : 'None', 
              inline: false 
            },
            { 
              name: `👤 Users (${users.length})`, 
              value: users.length ? users.join(' ') : 'None', 
              inline: false 
            }
          );
          embed.setFooter({ text: `Total: ${rows.length} targets` });
        }

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error listing alert targets:', error);
        return message.reply('Failed to list alert targets.');
      }
    }

    // add/remove require a target
    const target = message.mentions.users.first() || 
                   message.mentions.roles.first() ||
                   (args[0] && (await client.users.fetch(args[0]).catch(() => null))) ||
                   (args[0] && message.guild.roles.cache.get(args[0]));

    if (!target) {
      return message.reply('Provide a user or role mention or ID.');
    }

    const isRole = target?.constructor?.name === 'Role' || target?.id && message.guild.roles.cache.has(target.id);
    const type = isRole ? 'role' : 'user';
    const id = target.id;
    const name = isRole ? target.name : target.tag;

    try {
      if (sub === 'add') {
        const success = client.automod.addAlertTarget(message.guild.id, type, id);
        
        if (!success) {
          return message.reply('Failed to add alert target to database.');
        }

        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('✅ Alert Target Added')
          .addFields(
            { name: 'Type', value: isRole ? 'Role' : 'User', inline: true },
            { name: 'Target', value: isRole ? `@${name}` : name, inline: true },
            { name: 'ID', value: `\`${id}\``, inline: true }
          )
          .setDescription(`${isRole ? 'Role' : 'User'} will now be mentioned in automod alerts.`)
          .setTimestamp()
          .setFooter({ text: `Added by ${message.author.tag}` });

        if (!isRole) {
          embed.setThumbnail(target.displayAvatarURL({ size: 1024 }));
        }

        return message.reply({ embeds: [embed] });

      } else { // remove
        const success = client.automod.removeAlertTarget(message.guild.id, type, id);
        
        if (!success) {
          return message.reply('Failed to remove alert target from database.');
        }

        const embed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('❌ Alert Target Removed')
          .addFields(
            { name: 'Type', value: isRole ? 'Role' : 'User', inline: true },
            { name: 'Target', value: isRole ? `@${name}` : name, inline: true },
            { name: 'ID', value: `\`${id}\``, inline: true }
          )
          .setDescription(`${isRole ? 'Role' : 'User'} will no longer be mentioned in automod alerts.`)
          .setTimestamp()
          .setFooter({ text: `Removed by ${message.author.tag}` });

        if (!isRole) {
          embed.setThumbnail(target.displayAvatarURL({ size: 1024 }));
        }

        return message.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error(`Error ${sub}ing alert target:`, error);
      return message.reply(`Failed to ${sub} alert target. Check console for details.`);
    }
  },
};