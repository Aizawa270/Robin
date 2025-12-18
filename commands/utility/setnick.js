const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'setnick',
  description: 'Change the nickname of a user.',
  category: 'mod',
  usage: '$setnick <@user|userID> <new nickname>',
  aliases: ['nick'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');

    // Permission check
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return message.reply('You need the "Manage Nicknames" permission to use this command.');
    }

    const targetUser = message.mentions.members.first() || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
    if (!targetUser) return message.reply('Please specify a valid user by mention or ID.');

    const newNick = args.slice(1).join(' ');
    if (!newNick) return message.reply('Please provide a new nickname.');

    // Prevent changing bot's nickname if higher role
    if (!targetUser.manageable) {
      return message.reply('I cannot change the nickname of this user (role hierarchy).');
    }

    try {
      await targetUser.setNickname(newNick, `Changed by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor(colors.roleinfo || '#00ffff')
        .setTitle('Nickname Changed')
        .setDescription(`**${targetUser.user.tag}** has had their nickname changed to **${newNick}**.`)
        .setThumbnail(targetUser.user.displayAvatarURL({ size: 1024 }))
        .setTimestamp()
        .setFooter({ text: `Changed by ${message.author.tag}` });

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('SetNick error:', err);
      message.reply('There was an error trying to change that nickname.');
    }
  },
};