const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'createrole',
  aliases: ['crole'],
  description: 'Create a role with a name and hex color.',
  category: 'mod',
  usage: '$createrole <name> <#hex>',
  async execute(client, message, args) {
    if (!message.guild) return;

    // Admin only
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only. Sit down.');
    }

    if (args.length < 2) {
      return message.reply(
        'Usage: `$createrole <name> <#hex>`\nExample: `$createrole Members #22c55e`'
      );
    }

    const hex = args[args.length - 1];
    const name = args.slice(0, -1).join(' ');

    // Validate hex
    if (!/^#([0-9A-Fa-f]{6})$/.test(hex)) {
      return message.reply('Invalid hex color. Example: `#22c55e`');
    }

    try {
      const role = await message.guild.roles.create({
        name,
        color: hex,
        permissions: [],
        mentionable: false,
        hoist: false,
        reason: `Role created by ${message.author.tag}`,
      });

      // Move role to bottom
      await role.setPosition(1);

      const embed = new EmbedBuilder()
        .setColor(hex)
        .setDescription(`**${role.name}** has been successfully created`)
        .setFooter({ text: `Role ID: ${role.id}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('CreateRole error:', err);
      message.reply('Something broke. Check bot permissions.');
    }
  },
};