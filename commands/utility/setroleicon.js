const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
  name: 'setroleicon',
  aliases: ['sri'],
  description: 'Set an icon for a role.',
  category: 'mod',
  usage: '$setroleicon <@role|roleID> <image>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Bot permission check ONLY
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('I need **Manage Roles** permission.');
    }

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[0]);

    if (!role) {
      return message.reply('Give a valid role mention or role ID.');
    }

    // Role hierarchy check (non-negotiable)
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('That role is higher than me. I can’t touch it.');
    }

    // Image source: attachment OR URL
    let imageURL =
      message.attachments.first()?.url ||
      args.find(a => a.startsWith('http'));

    if (!imageURL) {
      return message.reply('Attach an image or provide an image URL.');
    }

    try {
      const res = await fetch(imageURL);
      const buffer = await res.arrayBuffer();

      if (buffer.byteLength > 256 * 1024) {
        return message.reply('Image is too large. Max size is **256KB**.');
      }

      await role.edit({
        icon: Buffer.from(buffer),
        reason: `Role icon set by ${message.author.tag}`,
      });

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Role Icon Updated')
        .setDescription(
          `Icon successfully set for **${role.name}** by <@${message.author.id}>`
        )
        .setThumbnail(imageURL)
        .setTimestamp();

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('SetRoleIcon error:', err);
      message.reply('Failed to set role icon. Invalid image or Discord said no.');
    }
  },
};