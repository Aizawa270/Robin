const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'blacklistword',
  aliases: ['bwl'],
  description: 'Add/remove/list hard blacklist words (triggers automod).',
  category: 'automod',
  hidden: true,
  usage: '$blacklistword add|remove|list <word>',
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
      return message.reply('Usage: `$blacklistword add|remove|list <word>`');
    }

    // Get dynamic prefix
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (sub === 'list') {
      try {
        const words = client.automod.listHardWords(message.guild.id);
        
        const embed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('🔨 Hard Blacklist Words')
          .setDescription(words.length ? 
            `**Triggers automod (15m timeout):**\n\`\`\`\n${words.join(', ')}\n\`\`\`` : 
            'No hard blacklist words set.')
          .setFooter({ text: `Use ${prefix}blacklistword add <word> to add words` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('Error listing hard words:', error);
        return message.reply('Failed to list hard blacklist words.');
      }
    }

    const word = args.join(' ').trim();
    if (!word) return message.reply('Provide a word.');

    try {
      if (sub === 'add') {
        console.log(`[HardWord] Adding "${word}" to guild ${message.guild.id}`);
        const success = client.automod.addHardWord(message.guild.id, word);
        
        if (!success) {
          return message.reply('Failed to save word to database.');
        }

        // Verify word was added
        setTimeout(() => {
          try {
            const verifyWords = client.automod.listHardWords(message.guild.id);
            const wasAdded = verifyWords.some(w => w.toLowerCase() === word.toLowerCase());
            console.log(`[HardWord] Verification: "${word}" ${wasAdded ? 'WAS' : 'WAS NOT'} added to database`);
          } catch (verifyError) {
            console.error('[HardWord] Verification error:', verifyError);
          }
        }, 500);

        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('✅ Hard Word Added')
          .setDescription(`\`${word}\` will now trigger automod (15 minute timeout).`)
          .addFields(
            { name: 'Word', value: `\`${word}\``, inline: true },
            { name: 'Action', value: '15m timeout + alert', inline: true }
          )
          .setTimestamp()
          .setFooter({ text: `Added by ${message.author.tag}` });

        return message.reply({ embeds: [embed] });

      } else { // remove
        console.log(`[HardWord] Removing "${word}" from guild ${message.guild.id}`);
        const success = client.automod.removeHardWord(message.guild.id, word);
        
        if (!success) {
          return message.reply('Failed to remove word from database.');
        }

        const embed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('❌ Hard Word Removed')
          .setDescription(`\`${word}\` will no longer trigger automod.`)
          .addFields(
            { name: 'Word', value: `\`${word}\``, inline: true },
            { name: 'Action', value: 'Removed from blacklist', inline: true }
          )
          .setTimestamp()
          .setFooter({ text: `Removed by ${message.author.tag}` });

        return message.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error(`Error ${sub}ing hard word:`, error);
      return message.reply(`Failed to ${sub} hard blacklist word. Check console for details.`);
    }
  },
};