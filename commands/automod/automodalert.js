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
      if (!rows.length) return message.reply('No alert targets.');
      const users = [];
      const roles = [];
      for (const r of rows) {
        if (r.target_type === 'user') users.push(`<@${r.target_id}>`);
        else roles.push(`<@&${r.target_id}>`);
      }
      const embed = new EmbedBuilder()
        .setTitle('Automod Alert List')
        .setColor('#60a5fa')
        .setDescription([
          `**Roles:** ${roles.length ? roles.join(' ') : 'None'}`,
          `**Users:** ${users.length ? users.join(' ') : 'None'}`,
        ].join('\n\n'));
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

    if (sub === 'add') {
      client.automod.addAlertTarget(message.guild.id, type, id);
      return message.reply(`Added ${isRole ? `<@&${id}>` : `<@${id}>`} to automod alert list.`);
    } else {
      client.automod.removeAlertTarget(message.guild.id, type, id);
      return message.reply(`Removed ${isRole ? `<@&${id}>` : `<@${id}>`} from automod alert list.`);
    }
  },
};