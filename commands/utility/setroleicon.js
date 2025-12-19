const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'setroleicon',
  description: 'Set an icon for a role using an attached image.',
  category: 'utility',
  usage: '$setroleicon <role> (attach image)',
  aliases: ['sri'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) 
      return message.reply('You need the **Manage Roles** permission.');

    // Get role from mention or ID
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Please mention a valid role or provide its ID.');

    // Get the attached image
    const attachment = message.attachments.first();
    if (!attachment) return message.reply('Please attach an image to set as the role icon.');

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif'].includes(attachment.contentType)) {
      return message.reply('Invalid file type. Only PNG, JPG, and GIF are allowed.');
    }

    try {
      await role.setIcon(attachment.url, `Updated by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor(role.hexColor || '#ffffff')
        .setDescription(`✅ Role **${role.name}** icon has been updated successfully.`);

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('SetRoleIcon error:', err);
      return message.reply('Failed to set role icon. Make sure my role is **higher than the role you want to modify**.');
    }
  },
};