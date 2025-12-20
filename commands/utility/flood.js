const { EmbedBuilder } = require('discord.js');

const OWNER_ID = '852839588689870879';
const MAX_FLOOD = 250; // Slightly reduced from 300 for safety
const BATCH_SIZE = 10; // Optimal balance between speed and safety
const BATCH_DELAY = 100; // Safe delay to avoid rate limits
const DM_BATCH_SIZE = 6; // Conservative for DMs
const DM_BATCH_DELAY = 150;

// Rate limit protection
let lastFloodTime = 0;
const FLOOD_COOLDOWN = 30000; // 30 seconds between uses

module.exports = {
  name: 'flood',
  description: 'Floods a channel or a user\'s DMs (owner only).',
  category: 'utility',
  hidden: true,
  usage: '$flood [@user|id] <amount> <text>',
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

    // ⚠️ Rate limit cooldown check
    const now = Date.now();
    const timeSinceLastFlood = now - lastFloodTime;
    if (timeSinceLastFlood < FLOOD_COOLDOWN) {
      const waitTime = Math.ceil((FLOOD_COOLDOWN - timeSinceLastFlood) / 1000);
      return message.reply(`⏳ Please wait ${waitTime} seconds before flooding again.`);
    }
    lastFloodTime = now;

    if (!args.length) return message.reply('Give me something to work with.');

    let target = message.channel;
    let isDM = false;
    let amount;
    let text;

    // If first arg is user mention or ID → DM flood
    const user =
      message.mentions.users.first() ||
      (args[0]?.match(/^\d{17,20}$/)
        ? await client.users.fetch(args[0]).catch(() => null)
        : null);

    if (user) {
      try {
        target = await user.createDM();
        isDM = true;
      } catch (err) {
        return message.reply(`❌ Could not DM ${user.tag}. They might have DMs closed.`);
      }
      args.shift();
    }

    amount = parseInt(args.shift());
    if (isNaN(amount) || amount < 1) {
      return message.reply('Amount must be a number greater than 0.');
    }

    if (amount > MAX_FLOOD) {
      await message.reply(`⚠️ Max is ${MAX_FLOOD}. Setting to ${MAX_FLOOD}...`);
      amount = MAX_FLOOD;
    }

    text = args.join(' ');
    if (!text) return message.reply('What am I supposed to send?');

    // Dynamic batching based on amount
    let batchSize, batchDelay;
    if (isDM) {
      batchSize = DM_BATCH_SIZE;
      batchDelay = DM_BATCH_DELAY;
    } else {
      // Smart scaling: larger batches for smaller amounts, smaller for larger
      if (amount <= 50) {
        batchSize = 12;
        batchDelay = 80;
      } else if (amount <= 150) {
        batchSize = 10;
        batchDelay = 100;
      } else {
        batchSize = 8;
        batchDelay = 120;
      }
    }
    
    // Show start message with stats
    const startMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#00ff88')
          .setTitle('⚡ ULTIMATE FLOOD ACTIVATED')
          .setDescription(`**Target:** ${user ? `${user.tag} (DMs)` : 'This Channel'}`)
          .addFields(
            { name: 'Amount', value: `${amount} messages`, inline: true },
            { name: 'Batch Size', value: `${batchSize}`, inline: true },
            { name: 'Delay', value: `${batchDelay}ms`, inline: true },
            { name: 'Estimated Time', value: `${Math.ceil(amount / batchSize) * (batchDelay / 1000)}s`, inline: true }
          )
          .setFooter({ text: 'Starting flood...' })
      ]
    });

    // ⚡ SMART FLOOD ENGINE
    try {
      let sentCount = 0;
      let failedCount = 0;
      const startTime = Date.now();
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;
      
      // Create message array for consistent content
      const messagesToFlood = Array(Math.min(amount, MAX_FLOOD)).fill(text);
      
      for (let batchStart = 0; batchStart < messagesToFlood.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, messagesToFlood.length);
        const currentBatch = messagesToFlood.slice(batchStart, batchEnd);
        
        try {
          // Send batch with Promise.all for speed
          const batchPromises = currentBatch.map(msg => 
            target.send(msg).catch(err => {
              console.error(`[Flood] Message ${batchStart + 1} failed:`, err.message);
              return null;
            })
          );
          
          const results = await Promise.allSettled(batchPromises);
          const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
          sentCount += successful;
          failedCount += (currentBatch.length - successful);
          
          if (successful === 0) {
            consecutiveErrors++;
            if (consecutiveErrors >= maxConsecutiveErrors) {
              throw new Error(`Too many consecutive errors (${consecutiveErrors})`);
            }
          } else {
            consecutiveErrors = 0;
          }
          
        } catch (batchError) {
          console.error('[Flood] Batch failed:', batchError.message);
          failedCount += currentBatch.length;
          consecutiveErrors++;
          
          if (consecutiveErrors >= maxConsecutiveErrors) {
            break;
          }
        }
        
        // Update progress every few batches
        if (batchStart % (batchSize * 3) === 0 && sentCount < amount) {
          try {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = Math.round(sentCount / elapsed);
            const progress = Math.round((sentCount / amount) * 100);
            
            await startMsg.edit({
              embeds: [
                new EmbedBuilder()
                  .setColor('#00ff88')
                  .setTitle('⚡ FLOOD IN PROGRESS')
                  .setDescription(`**Progress:** ${sentCount}/${amount} messages`)
                  .addFields(
                    { name: 'Speed', value: `${rate} msg/sec`, inline: true },
                    { name: 'Progress', value: `${progress}%`, inline: true },
                    { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
                    { name: 'Failed', value: `${failedCount}`, inline: true },
                    { name: 'Next Batch', value: `${Math.min(batchSize, amount - sentCount)}`, inline: true }
                  )
              ]
            });
          } catch {}
        }
        
        // Smart delay - increase if we're getting errors
        if (sentCount < amount) {
          const dynamicDelay = consecutiveErrors > 0 ? batchDelay * 2 : batchDelay;
          await new Promise(resolve => setTimeout(resolve, dynamicDelay));
        }
      }
      
      // Calculate final stats
      const totalTime = (Date.now() - startTime) / 1000;
      const messagesPerSecond = totalTime > 0 ? Math.round(sentCount / totalTime) : 0;
      const efficiency = ((sentCount / amount) * 100).toFixed(1);
      
      // Final embed
      const resultEmbed = new EmbedBuilder()
        .setColor(sentCount === amount ? '#00ff88' : failedCount > 0 ? '#ffaa00' : '#ff5555')
        .setTitle(sentCount === amount ? '✅ FLOOD COMPLETE' : '⚠️ FLOOD PARTIALLY COMPLETE')
        .setDescription(`**Target:** ${user ? `${user.tag} (DMs)` : 'Channel'}`)
        .addFields(
          { name: 'Sent/Total', value: `${sentCount}/${amount}`, inline: true },
          { name: 'Success Rate', value: `${efficiency}%`, inline: true },
          { name: 'Failed', value: `${failedCount}`, inline: true },
          { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Avg Speed', value: `${messagesPerSecond} msg/sec`, inline: true },
          { name: 'Cooldown', value: '30s', inline: true }
        )
        .setFooter({ text: `Command used at ${new Date().toLocaleTimeString()}` })
        .setTimestamp();
      
      await startMsg.edit({ embeds: [resultEmbed] });
      
      // Log the flood
      console.log(`[Flood] ${message.author.tag} -> ${user ? user.tag : 'channel'}: ${sentCount}/${amount} in ${totalTime.toFixed(2)}s (${messagesPerSecond}/sec)`);
      
    } catch (error) {
      console.error('[Flood] Critical error:', error);
      try {
        await startMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('#ff5555')
              .setTitle('💥 FLOOD TERMINATED')
              .setDescription(`**Error:** ${error.message}\n\nFlood has been stopped.`)
              .setFooter({ text: 'Check console for details' })
          ]
        });
      } catch {}
    }
  },
};