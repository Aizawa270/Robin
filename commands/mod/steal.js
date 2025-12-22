const { EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'steal',
  aliases: ['stealemoji', 'stealsticker'],
  description: 'Steal an emoji or sticker from other servers. Reply to a sticker message or provide emoji.',
  category: 'admin',
  usage: '!steal <emoji> [name] OR reply to sticker message with !steal',
  async execute(client, message, args) {
    // Use dynamic prefix but default to !
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
    const botPerms = message.guild.members.me.permissions;
    if (!botPerms.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return message.reply('I need **Manage Emojis and Stickers** permission to steal.');
    }

    // ===== CHECK IF REPLYING TO STICKER =====
    let stickerFromReply = null;
    if (message.reference) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMsg.stickers.size > 0) {
          stickerFromReply = repliedMsg.stickers.first();
        }
      } catch (error) {
        console.log('Could not fetch replied message:', error.message);
      }
    }

    // If no args and not replying to sticker, show help
    if (!args[0] && !stickerFromReply) {
      const helpEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Steal Command')
        .setDescription(`Steal emojis or stickers from other servers.`)
        .addFields(
          { 
            name: 'Steal Emoji', 
            value: `\`!steal <:emoji:1234567890> [custom-name]\``, 
            inline: false 
          },
          { 
            name: 'Steal Sticker (Reply)', 
            value: `Reply to a sticker message with \`!steal [custom-name]\``, 
            inline: false 
          },
          { 
            name: 'Steal Sticker (URL)', 
            value: `\`!steal <sticker-url> [custom-name]\``, 
            inline: false 
          },
          { 
            name: 'Examples', 
            value: 
              `\`!steal 🍎\`\n` +
              `\`!steal :pepe: pepe_cool\`\n` +
              `Reply to sticker: \`!steal my_sticker\``, 
            inline: false 
          }
        )
        .setFooter({ text: 'Note: Max 50 emojis & 60 stickers per server' });

      return message.reply({ embeds: [helpEmbed] });
    }

    try {
      // ===== STEAL EMOJI =====
      const emojiMatch = args[0]?.match(/<?(a)?:?(\w{2,32}):(\d{17,20})>?/);

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
          .setTitle('✅ Emoji Stolen Successfully')
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

      // ===== STEAL STICKER (from reply or args) =====
      let sticker = stickerFromReply;
      let stickerId = null;

      // If not from reply, check args for sticker URL
      if (!sticker && args[0]) {
        const urlMatch = args[0].match(/https:\/\/cdn\.discordapp\.com\/stickers\/(\d{17,20})/);
        if (urlMatch) {
          stickerId = urlMatch[1];
          try {
            sticker = await client.fetchSticker(stickerId);
          } catch {}
        }
      }

      if (sticker) {
        // Custom name (first arg if replying, second arg if from URL)
        let customName = 'stolen_sticker';
        if (stickerFromReply) {
          customName = args[0] || `sticker_${Date.now()}`;
        } else if (args[1]) {
          customName = args[1];
        } else if (sticker.name) {
          customName = sticker.name.replace(/[^a-zA-Z0-9_ ]/g, '_');
        }

        // Validate name
        if (!/^[a-zA-Z0-9_ ]{2,32}$/.test(customName)) {
          return message.reply('Sticker name must be 2-32 characters (letters, numbers, underscores, spaces).');
        }

        // Check sticker limit
        const stickers = await message.guild.stickers.fetch();
        if (stickers.size >= 60) {
          // Fallback: Send sticker as image for download
          const fallbackEmbed = new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('⚠️ Sticker Limit Reached')
            .setDescription(`This server has reached 60 stickers. Here's the sticker image for manual download:`)
            .setImage(sticker.url)
            .addFields(
              { name: 'Sticker Name', value: sticker.name || 'Unknown', inline: true },
              { name: 'Format', value: sticker.format || 'Unknown', inline: true },
              { name: 'ID', value: `\`${sticker.id}\``, inline: true }
            )
            .setFooter({ text: `Requested by ${message.author.tag} | Save image and upload manually` })
            .setTimestamp();

          return message.reply({ embeds: [fallbackEmbed] });
        }

        try {
          // Download sticker
          const response = await fetch(sticker.url);
          if (!response.ok) throw new Error('Failed to download sticker');
          
          const buffer = await response.arrayBuffer();
          const fileExtension = sticker.format === 'APNG' ? 'png' : 
                                sticker.format === 'LOTTIE' ? 'json' : 'png';

          // Create sticker
          const createdSticker = await message.guild.stickers.create({
            file: new AttachmentBuilder(Buffer.from(buffer), { 
              name: `${customName}.${fileExtension}` 
            }),
            name: customName,
            tags: sticker.tags?.join(', ') || 'stolen',
            description: `Stolen by ${message.author.tag}`,
            reason: `Stolen by ${message.author.tag}`
          });

          const embed = new EmbedBuilder()
            .setColor('#22c55e')
            .setTitle('✅ Sticker Stolen Successfully')
            .setDescription(`Added sticker to the server.`)
            .addFields(
              { name: 'Name', value: `\`${createdSticker.name}\``, inline: true },
              { name: 'ID', value: `\`${createdSticker.id}\``, inline: true },
              { name: 'Format', value: createdSticker.format, inline: true },
              { name: 'Tags', value: createdSticker.tags || 'None', inline: false },
              { name: 'Usage', value: `Type \`:${createdSticker.name}:\` in chat`, inline: false }
            )
            .setImage(sticker.url)
            .setFooter({ text: `Stolen by ${message.author.tag}` })
            .setTimestamp();

          return message.reply({ embeds: [embed] });

        } catch (stickerError) {
          console.error('Sticker creation error:', stickerError);
          
          // Fallback: Send sticker as image
          const fallbackEmbed = new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('⚠️ Sticker Upload Failed')
            .setDescription(`Could not add sticker to server. Here's the image for manual download:`)
            .setImage(sticker.url)
            .addFields(
              { name: 'Name', value: sticker.name || 'Unknown', inline: true },
              { name: 'Format', value: sticker.format || 'Unknown', inline: true },
              { name: 'Error', value: stickerError.message.substring(0, 100), inline: false }
            )
            .setFooter({ text: `Requested by ${message.author.tag} | Save image and upload manually` })
            .setTimestamp();

          return message.reply({ embeds: [fallbackEmbed] });
        }
      }

      // ===== NO VALID EMOJI/STICKER FOUND =====
      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('❌ Invalid Input')
        .setDescription(`No valid emoji or sticker found.`)
        .addFields(
          { name: 'Usage Examples', value: 
            `\`!steal 🍎\` - Steal apple emoji\n` +
            `\`!steal :pepe: pepe_cool\` - Steal with custom name\n` +
            `Reply to sticker: \`!steal my_sticker\` - Steal replied sticker`, 
            inline: false 
          },
          { name: 'Note', value: `Make sure emojis are from servers the bot can access.`, inline: false }
        )
        .setFooter({ text: `Use ${prefix}steal for help` });

      return message.reply({ embeds: [errorEmbed] });

    } catch (error) {
      console.error('Steal command error:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('❌ Steal Failed')
        .setDescription('Could not steal the emoji/sticker.')
        .addFields(
          { name: 'Possible Reasons', value: 
            '• Invalid emoji/sticker\n' +
            '• Server emoji/sticker limit reached\n' +
            '• No permission to manage expressions\n' +
            '• Emoji from private/restricted server\n' +
            '• Bot cannot access external emoji', 
            inline: false 
          },
          { name: 'Error', value: `\`${error.message.substring(0, 100)}\``, inline: false }
        );

      return message.reply({ embeds: [errorEmbed] });
    }
  },
};