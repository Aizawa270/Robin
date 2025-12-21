const { EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'steal',
  aliases: ['stealemoji', 'stealsticker'],
  description: 'Steal an emoji or sticker and add it to your server (Admin only).',
  category: 'admin',
  usage: '$steal <emoji/sticker> [name]',
  async execute(client, message, args) {
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';
    
    // Admin check
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Permission Denied')
        .setDescription(`${message.author.tag}, you need **Administrator** permissions to use this command.`)
        .setFooter({ text: 'Admin-only command' });
      
      return message.reply({ embeds: [embed] });
    }
    
    // Bot permission check
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return message.reply('I need **Manage Emojis and Stickers** permission to steal.');
    }
    
    if (!args[0]) {
      const helpEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Steal Command')
        .setDescription(`Steal emojis or stickers from other servers.`)
        .addFields(
          { 
            name: 'Steal Emoji', 
            value: `\`${prefix}steal <:emoji:1234567890> [custom-name]\``, 
            inline: false 
          },
          { 
            name: 'Steal Sticker', 
            value: `\`${prefix}steal <sticker> [custom-name]\``, 
            inline: false 
          },
          { 
            name: 'Examples', 
            value: 
              `\`${prefix}steal 🍎\`\n` +
              `\`${prefix}steal :pepe: pepe_cool\`\n` +
              `\`${prefix}steal <sticker> my_sticker\``, 
            inline: false 
          }
        )
        .setFooter({ text: 'Note: Max 50 emojis & 60 stickers per server' });
      
      return message.reply({ embeds: [helpEmbed] });
    }
    
    try {
      // ===== STEAL EMOJI =====
      const emojiMatch = args[0].match(/<?(a)?:?(\w{2,32}):(\d{17,20})>?/);
      
      if (emojiMatch) {
        const animated = emojiMatch[1] === 'a';
        const emojiName = emojiMatch[2];
        const emojiId = emojiMatch[3];
        
        // Custom name (optional second argument)
        const customName = args[1] || emojiName;
        
        if (!/^[a-zA-Z0-9_]{2,32}$/.test(customName)) {
          return message.reply('Custom name must be 2-32 characters (letters, numbers, underscores only).');
        }
        
        // Check if server has space for new emojis
        const emojiCount = await message.guild.emojis.fetch();
        if (emojiCount.size >= 50) {
          return message.reply('This server has reached the maximum limit of 50 emojis.');
        }
        
        // Download and create emoji
        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}`;
        
        const createdEmoji = await message.guild.emojis.create({
          attachment: emojiUrl,
          name: customName,
          reason: `Stolen by ${message.author.tag}`
        });
        
        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('Emoji Stolen Successfully')
          .setDescription(`Added ${createdEmoji} to the server.`)
          .addFields(
            { name: 'Name', value: `\`${createdEmoji.name}\``, inline: true },
            { name: 'ID', value: `\`${createdEmoji.id}\``, inline: true },
            { name: 'Animated', value: createdEmoji.animated ? 'Yes' : 'No', inline: true },
            { name: 'Usage', value: `\`${createdEmoji}\` or \`:${createdEmoji.name}:\``, inline: false }
          )
          .setThumbnail(emojiUrl)
          .setFooter({ text: `Stolen by ${message.author.tag}` })
          .setTimestamp();
        
        return message.reply({ embeds: [embed] });
      }
      
      // ===== STEAL STICKER =====
      const stickerMatch = message.content.match(/https:\/\/cdn\.discordapp\.com\/stickers\/(\d{17,20})/);
      let stickerId = stickerMatch ? stickerMatch[1] : null;
      
      // Also check for sticker mentions in new Discord format
      if (!stickerId && message.reference) {
        try {
          const referencedMsg = await message.channel.messages.fetch(message.reference.messageId);
          if (referencedMsg.stickers.size > 0) {
            stickerId = referencedMsg.stickers.first().id;
          }
        } catch {}
      }
      
      if (stickerId) {
        // Custom name (optional second argument)
        const customName = args[1] || `sticker_${Date.now()}`;
        
        if (!/^[a-zA-Z0-9_ ]{2,32}$/.test(customName)) {
          return message.reply('Sticker name must be 2-32 characters (letters, numbers, underscores, spaces).');
        }
        
        // Check sticker limit
        const stickers = await message.guild.stickers.fetch();
        if (stickers.size >= 60) {
          return message.reply('This server has reached the maximum limit of 60 stickers.');
        }
        
        // Fetch sticker info
        const sticker = await client.fetchSticker(stickerId).catch(() => null);
        if (!sticker) {
          return message.reply('Could not fetch sticker. Make sure the sticker exists.');
        }
        
        // Download sticker
        const response = await fetch(sticker.url);
        const buffer = await response.arrayBuffer();
        
        // Create sticker
        const createdSticker = await message.guild.stickers.create({
          file: new AttachmentBuilder(Buffer.from(buffer), { name: `${customName}.${sticker.format === 'APNG' ? 'png' : sticker.format.toLowerCase()}` }),
          name: customName,
          tags: sticker.tags?.join(', ') || 'stolen',
          description: `Stolen by ${message.author.tag}`,
          reason: `Stolen by ${message.author.tag}`
        });
        
        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('Sticker Stolen Successfully')
          .setDescription(`Added sticker to the server.`)
          .addFields(
            { name: 'Name', value: `\`${createdSticker.name}\``, inline: true },
            { name: 'ID', value: `\`${createdSticker.id}\``, inline: true },
            { name: 'Format', value: createdSticker.format, inline: true },
            { name: 'Usage', value: `Type \`:${createdSticker.name}:\` in chat`, inline: false }
          )
          .setImage(sticker.url)
          .setFooter({ text: `Stolen by ${message.author.tag}` })
          .setTimestamp();
        
        return message.reply({ embeds: [embed] });
      }
      
      // ===== NO VALID EMOJI/STICKER FOUND =====
      return message.reply(`No valid emoji or sticker found. Usage: \`${prefix}steal <emoji/sticker> [name]\``);
      
    } catch (error) {
      console.error('Steal command error:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Steal Failed')
        .setDescription('Could not steal the emoji/sticker.')
        .addFields(
          { name: 'Possible Reasons', value: 
            '• Invalid emoji/sticker\n' +
            '• Server emoji/sticker limit reached\n' +
            '• No permission to manage expressions\n' +
            '• Emoji from private/restricted server', 
            inline: false 
          }
        );
      
      return message.reply({ embeds: [errorEmbed] });
    }
  },
};