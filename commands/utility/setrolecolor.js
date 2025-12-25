const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'setrolecolor',
  description: 'Set a hex color for a role.',
  category: 'utility',
  usage: '$setrolecolor <role> <#hex>',
  aliases: ['src'],
  async execute(client, message, args) {
    if (!message.guild)
      return message.reply('This command only works in servers.');

    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return message.reply('You need the **Manage Roles** permission.');

    // ─── ROLE ─────────────────────────────
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[0]);

    if (!role)
      return message.reply('Please mention a valid role or provide its ID.');

    // ─── HEX COLOR ─────────────────────────
    const hex = args.find(a => /^#?[0-9A-Fa-f]{6}$/.test(a));
    if (!hex)
      return message.reply('Please provide a valid hex color. Example: `#ff0000`');

    const formattedHex = hex.startsWith('#') ? hex : `#${hex}`;

    // ─── HIERARCHY CHECK ───────────────────
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('My role must be **higher** than the role you want to edit.');
    }

    try {
      await role.setColor(formattedHex, `Updated by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor(formattedHex)
        .setDescription(`✅ Role **${role.name}** color has been updated.`);

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('SetRoleColor error:', err);
      message.reply('Failed to set role color. Check role hierarchy and permissions.');
    }
  },
};