const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'blacklistwordsoft',
  aliases: ['bwsoft'],
  description: 'Add/remove/list soft blacklist words (silent delete).',
  category: 'automod',
  hidden: true,
  usage: '$blacklistwordsoft add|remove|list <word>',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only.');
    }

    // Check if automod is initialized
    if (!client.automod) {
      return message.reply('Automod system not initialized. Please restart the bot.');
    }

    const sub = (args.shift() || '').toLowerCase();
    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply('Usage: `$blacklistwordsoft add|remove|list <word>`');
    }

    // Get dynamic prefix
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (sub === 'list') {
      try {
        const words = client.automod.listSoftWords(message.guild.id);
        
        const embed = new EmbedBuilder()
          .setColor('#f59e0b')
          .setTitle('🔇 Soft Blacklist Words')
          .setDescription(words.length ? 
            `**Silent deletion (no timeout):**\n\`\`\`\n${words.join(', ')}\n\`\`\`` : 
            'No soft blacklist words set.')
          .setFooter({ text: `Use ${prefix}blacklistwordsoft add <word> to add words` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error listing soft words:', error);
        return message.reply('Failed to list soft blacklist words.');
      }
    }

    const word = args.join(' ').trim();
    if (!word) return message.reply('Provide a word.');

    try {
      if (sub === 'add') {
        console.log(`[SoftWord] Adding "${word}" to guild ${message.guild.id}`);
        const success = client.automod.addSoftWord(message.guild.id, word);
        
        if (!success) {
          return message.reply('Failed to save word to database.');
        }

        // Verify word was added
        setTimeout(() => {
          try {
            const verifyWords = client.automod.listSoftWords(message.guild.id);
            const wasAdded = verifyWords.some(w => w.toLowerCase() === word.toLowerCase());
            console.log(`[SoftWord] Verification: "${word}" ${wasAdded ? 'WAS' : 'WAS NOT'} added to database`);
          } catch (verifyError) {
            console.error('[SoftWord] Verification error:', verifyError);
          }
        }, 500);

        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('✅ Soft Word Added')
          .setDescription(`\`${word}\` will now be silently deleted (no timeout).`)
          .addFields(
            { name: 'Word', value: `\`${word}\``, inline: true },
            { name: 'Action', value: 'Silent deletion', inline: true }
          )
          .setTimestamp()
          .setFooter({ text: `Added by ${message.author.tag}` });

        return message.reply({ embeds: [embed] });

      } else { // remove
        console.log(`[SoftWord] Removing "${word}" from guild ${message.guild.id}`);
        const success = client.automod.removeSoftWord(message.guild.id, word);
        
        if (!success) {
          return message.reply('Failed to remove word from database.');
        }

        const embed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('❌ Soft Word Removed')
          .setDescription(`\`${word}\` will no longer be silently deleted.`)
          .addFields(
            { name: 'Word', value: `\`${word}\``, inline: true },
            { name: 'Action', value: 'Removed from blacklist', inline: true }
          )
          .setTimestamp()
          .setFooter({ text: `Removed by ${message.author.tag}` });

        return message.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error(`Error ${sub}ing soft word:`, error);
      return message.reply(`Failed to ${sub} soft blacklist word. Check console for details.`);
    }
  },
};