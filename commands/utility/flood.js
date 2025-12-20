const { EmbedBuilder } = require('discord.js');

const OWNER_ID = '852839588689870879';
const MAX_FLOOD = 500; // Increased limit
const CHANNEL_BATCH_SIZE = 20; // Max batch for channels
const CHANNEL_BATCH_DELAY = 30; // Almost no delay
const DM_BATCH_SIZE = 10; // For DMs
const DM_BATCH_DELAY = 50; // Minimal for DMs

module.exports = {
  name: 'flood',
  description: 'Floods a channel, user DMs, or specific channel (owner only).',
  category: 'utility',
  hidden: true,
  usage: '$flood [@user|#channel|channelID] <amount> <text>',
  async execute(client, message, args) {

    // 🔒 Owner lock
    if (message.author.id !== OWNER_ID) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f472b6')
            .setDescription("You're not that guy 😹😹")
        ]
      });
    }

    if (!args.length) return message.reply('Usage: `$flood [@user|#channel|channelID] <amount> <text>`');

    let target = message.channel; // Default: current channel
    let isDM = false;
    let amount;
    let text;

    // Check first arg for user mention, channel mention, or channel ID
    const firstArg = args[0];
    
    // If @user mention → DM flood
    const userMention = message.mentions.users.first();
    if (userMention) {
      try {
        target = await userMention.createDM();
        isDM = true;
        args.shift(); // Remove user mention from args
      } catch (err) {
        return message.reply(`❌ Could not DM ${userMention.tag}. They might have DMs closed.`);
      }
    }
    // If #channel mention → flood that channel
    else if (message.mentions.channels.first()) {
      target = message.mentions.channels.first();
      args.shift(); // Remove channel mention from args
    }
    // If numeric ID (could be user or channel)
    else if (firstArg?.match(/^\d{17,20}$/)) {
      // Try to get channel first
      const channel = message.guild?.channels.cache.get(firstArg);
      if (channel && channel.isTextBased()) {
        target = channel;
        args.shift();
      } 
      // If not channel, try user
      else {
        const user = await client.users.fetch(firstArg).catch(() => null);
        if (user) {
          try {
            target = await user.createDM();
            isDM = true;
            args.shift();
          } catch (err) {
            return message.reply(`❌ Could not DM ${user.tag}. They might have DMs closed.`);
          }
        } else {
          return message.reply('❌ Could not find user or channel with that ID.');
        }
      }
    }

    // Get amount
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1) {
      return message.reply('Amount must be a number greater than 0.');
    }
    args.shift(); // Remove amount from args

    if (amount > MAX_FLOOD) {
      amount = MAX_FLOOD;
    }

    text = args.join(' ');
    if (!text) return message.reply('What am I supposed to send?');

    // Choose settings - ULTRA FAST
    const batchSize = isDM ? DM_BATCH_SIZE : CHANNEL_BATCH_SIZE;
    const batchDelay = isDM ? DM_BATCH_DELAY : CHANNEL_BATCH_DELAY;

    // ⚡ INSTANT FLOOD - NO COOLDOWN, NO DELAYS
    try {
      let sentCount = 0;
      let failedCount = 0;
      const startTime = Date.now();
      
      // Send initial "starting" message and delete it immediately
      const startTimeMsg = await message.reply(`⚡ **FLOODING ${amount} MESSAGES**...`);
      await startTimeMsg.delete().catch(() => {});

      // Ultra-fast flood loop
      for (let i = 0; i < amount; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, amount - i);
        const batchPromises = [];
        
        // Create batch promises
        for (let j = 0; j < currentBatchSize; j++) {
          batchPromises.push(
            target.send(text).catch(err => {
              failedCount++;
              return null;
            })
          );
        }
        
        // Send batch
        await Promise.allSettled(batchPromises);
        sentCount += currentBatchSize;
        
        // Tiny delay only if not last batch
        if (i + batchSize < amount) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      // Calculate stats
      const totalTime = (Date.now() - startTime) / 1000;
      const messagesPerSecond = totalTime > 0 ? Math.round(sentCount / totalTime) : 0;

      // Quick result embed
      const resultEmbed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle('⚡ FLOOD COMPLETE')
        .setDescription(`**Target:** ${isDM ? `${target.recipient?.tag || 'User'} (DMs)` : target.name ? `#${target.name}` : 'Channel'}`)
        .addFields(
          { name: 'Sent', value: `${sentCount}/${amount}`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Speed', value: `${messagesPerSecond}/sec`, inline: true },
          { name: 'Failed', value: `${failedCount}`, inline: true },
          { name: 'Batch Size', value: `${batchSize}`, inline: true }
        )
        .setFooter({ text: 'Owner command' })
        .setTimestamp();

      await message.reply({ embeds: [resultEmbed] }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });

      // Log
      console.log(`[Flood] ${message.author.tag} -> ${target.name || target.recipient?.tag || 'target'}: ${sentCount}/${amount} in ${totalTime.toFixed(2)}s (${messagesPerSecond}/sec)`);

    } catch (error) {
      console.error('[Flood] Error:', error);
      await message.reply(`💥 Flood failed: ${error.message}`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }
  },
};