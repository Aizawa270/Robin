// commands/automod/automodalert.js
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
    if (!message.member.permissions.has('Administrator')) return message.reply('Admins only.');

    const sub = (args.shift() || '').toLowerCase();
    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply('Usage: `$automodalert add|remove|list [@user|@role|id]`');
    }

    if (sub === 'list') {
      const rows = client.automod.listAlertTargets(message.guild.id);
      if (!rows.length) {
        const embed = new EmbedBuilder()
          .setTitle('📋 Automod Alert List')
          .setColor('#60a5fa')
          .setDescription('No alert targets configured.')
          .setFooter({ text: 'Use $automodalert add to add targets' });
        return message.reply({ embeds: [embed] });
      }
      
      const users = [];
      const roles = [];
      for (const r of rows) {
        if (r.target_type === 'user') users.push(`<@${r.target_id}>`);
        else roles.push(`<@&${r.target_id}>`);
      }
      
      const embed = new EmbedBuilder()
        .setTitle('📋 Automod Alert List')
        .setColor('#60a5fa')
        .addFields(
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
        )
        .setFooter({ text: `Total: ${rows.length} targets` });
      
      return message.reply({ embeds: [embed] });
    }

    // add/remove require a target
    const target = message.mentions.users.first() || message.mentions.roles.first() ||
      (args[0] && (await client.users.fetch(args[0]).catch(() => null))) ||
      (args[0] && message.guild.roles.cache.get(args[0]));

    if (!target) return message.reply('Provide a user or role mention or ID.');

    const isRole = target?.id && target?.constructor && target.constructor.name === 'Role';
    const type = isRole ? 'role' : 'user';
    const id = target.id;
    const name = isRole ? target.name : target.tag;

    if (sub === 'add') {
      client.automod.addAlertTarget(message.guild.id, type, id);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Alert Target Added')
        .setColor('#22c55e')
        .addFields(
          { name: 'Type', value: isRole ? 'Role' : 'User', inline: true },
          { name: 'Target', value: isRole ? `\`@${name}\`` : `\`${name}\``, inline: true },
          { name: 'ID', value: `\`${id}\``, inline: true }
        )
        .setDescription(`**${isRole ? 'Role' : 'User'}** will now be mentioned in automod alerts.`)
        .setFooter({ text: `Added by ${message.author.tag}` })
        .setTimestamp();
      
      // Add thumbnail for user
      if (!isRole) {
        embed.setThumbnail(target.displayAvatarURL({ size: 1024 }));
      }
      
      return message.reply({ embeds: [embed] });
      
    } else { // remove
      client.automod.removeAlertTarget(message.guild.id, type, id);
      
      const embed = new EmbedBuilder()
        .setTitle('❌ Alert Target Removed')
        .setColor('#ef4444')
        .addFields(
          { name: 'Type', value: isRole ? 'Role' : 'User', inline: true },
          { name: 'Target', value: isRole ? `\`@${name}\`` : `\`${name}\``, inline: true },
          { name: 'ID', value: `\`${id}\``, inline: true }
        )
        .setDescription(`**${isRole ? 'Role' : 'User'}** will no longer be mentioned in automod alerts.`)
        .setFooter({ text: `Removed by ${message.author.tag}` })
        .setTimestamp();
      
      // Add thumbnail for user
      if (!isRole) {
        embed.setThumbnail(target.displayAvatarURL({ size: 1024 }));
      }
      
      return message.reply({ embeds: [embed] });
    }
  },
};