const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'steal',
  aliases: ['stealemoji'],
  description: 'Steal an emoji from other servers.',
  category: 'admin',
  usage: '$steal <emoji> [name] OR reply to a message with $steal',
  async execute(client, message, args) {
    // Admin check
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need **Administrator** permissions to use this command.');
    }

    // Bot permission check
    const botPerms = message.guild.members.me.permissions;
    if (!botPerms.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return message.reply('I need **Manage Emojis and Stickers** permission to steal emojis.');
    }

    // Check if replying to a message
    let targetEmoji = null;
    let emojiFromReply = null;
    
    if (message.reference) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        // Extract emojis from the replied message content
        const emojiMatch = repliedMsg.content?.match(/<?(a)?:?(\w{2,32}):(\d{17,20})>?/);
        
        if (emojiMatch) {
          emojiFromReply = {
            animated: emojiMatch[1] === 'a',
            name: emojiMatch[2],
            id: emojiMatch[3],
            full: emojiMatch[0]
          };
        }
      } catch (error) {
        console.log('Could not fetch replied message:', error.message);
      }
    }

    // Check for emoji in args (if not from reply)
    if (!emojiFromReply && args[0]) {
      const emojiMatch = args[0].match(/<?(a)?:?(\w{2,32}):(\d{17,20})>?/);
      if (emojiMatch) {
        targetEmoji = {
          animated: emojiMatch[1] === 'a',
          name: emojiMatch[2],
          id: emojiMatch[3],
          full: emojiMatch[0]
        };
      }
    }

    // If no emoji found, show simple help
    if (!emojiFromReply && !targetEmoji) {
      // Simple reply without embed to avoid help command
      return message.reply(`Usage: \`${message.prefix}steal <emoji> [name]\` or reply to a message with \`${message.prefix}steal\``);
    }

    // Use emoji from reply if available, otherwise from args
    const emoji = emojiFromReply || targetEmoji;
    
    if (!emoji) {
      return message.reply('No valid emoji found. Make sure the emoji is from another server.');
    }

    // Custom name (optional second argument)
    const customName = args[1] || emoji.name;

    // Validate custom name
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(customName)) {
      return message.reply('Custom name must be 2-32 characters (letters, numbers, underscores only).');
    }

    try {
      // Check if server has space for new emojis
      const emojiCount = await message.guild.emojis.fetch();
      if (emojiCount.size >= 50) {
        return message.reply('This server has reached the maximum limit of 50 emojis.');
      }

      // Download and create emoji
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;

      const createdEmoji = await message.guild.emojis.create({
        attachment: emojiUrl,
        name: customName,
        reason: `Stolen by ${message.author.tag}`
      });

      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: '✅ Emoji Stolen Successfully',
        description: `Added ${createdEmoji} to the server.`,
        fields: [
          { name: 'Name', value: `\`${createdEmoji.name}\``, inline: true },
          { name: 'ID', value: `\`${createdEmoji.id}\``, inline: true },
          { name: 'Animated', value: createdEmoji.animated ? 'Yes' : 'No', inline: true },
          { name: 'Usage', value: `\`${createdEmoji}\` or \`:${createdEmoji.name}:\``, inline: false }
        ],
        thumbnail: emojiUrl,
        footer: { text: `Stolen by ${message.author.tag}` }
      });

      return message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Steal command error:', error);
      
      if (error.code === 50035) { // Discord API error for invalid emoji
        return message.reply('Invalid emoji or emoji is from a server I cannot access.');
      }
      
      return message.reply(`Failed to steal emoji: ${error.message}`);
    }
  },
};