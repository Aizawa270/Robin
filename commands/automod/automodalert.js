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
        // ✅ USE message.createEmbed()
        const embed = message.createEmbed({
          title: '📋 Automod Alert List',
          description: 'No alert targets configured.',
          footer: { text: 'Use $automodalert add to add targets' }
        });
        return message.reply({ embeds: [embed] });
      }

      const users = [];
      const roles = [];
      for (const r of rows) {
        if (r.target_type === 'user') users.push(`<@${r.target_id}>`);
        else roles.push(`<@&${r.target_id}>`);
      }

      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: '📋 Automod Alert List',
        fields: [
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
        ],
        footer: { text: `Total: ${rows.length} targets` }
      });

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

      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: '✅ Alert Target Added',
        fields: [
          { name: 'Type', value: isRole ? 'Role' : 'User', inline: true },
          { name: 'Target', value: isRole ? `\`@${name}\`` : `\`${name}\``, inline: true },
          { name: 'ID', value: `\`${id}\``, inline: true }
        ],
        description: `**${isRole ? 'Role' : 'User'}** will now be mentioned in automod alerts.`,
        footer: { text: `Added by ${message.author.tag}` }
      });

      // Add thumbnail for user
      if (!isRole) {
        embed.setThumbnail(target.displayAvatarURL({ size: 1024 }));
      }

      return message.reply({ embeds: [embed] });

    } else { // remove
      client.automod.removeAlertTarget(message.guild.id, type, id);

      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: '❌ Alert Target Removed',
        fields: [
          { name: 'Type', value: isRole ? 'Role' : 'User', inline: true },
          { name: 'Target', value: isRole ? `\`@${name}\`` : `\`${name}\``, inline: true },
          { name: 'ID', value: `\`${id}\``, inline: true }
        ],
        description: `**${isRole ? 'Role' : 'User'}** will no longer be mentioned in automod alerts.`,
        footer: { text: `Removed by ${message.author.tag}` }
      });

      // Add thumbnail for user
      if (!isRole) {
        embed.setThumbnail(target.displayAvatarURL({ size: 1024 }));
      }

      return message.reply({ embeds: [embed] });
    }
  },
};