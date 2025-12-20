const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Floods channels (webhook) or DMs (no slowdown) - owner only.',
  category: 'utility',
  hidden: true,
  usage: '$flood [@user|#channel|channelID] <amount> <text>',
  async execute(client, message, args) {
    if (!OWNER_IDS.includes(message.author.id)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f472b6')
            .setDescription("You're not that guy 😹😹")
        ]
      });
    }

    if (!args.length) return message.reply('Usage: `$flood [@user|#channel|channelID] <amount> <text>`');

    let target = message.channel;
    let isDM = false;
    let amount;
    let text;

    // 🎯 TARGET DETECTION
    const firstArg = args[0];
    const userMention = message.mentions.users.first();
    
    if (userMention) {
      try {
        target = await userMention.createDM();
        isDM = true;
        args.shift();
      } catch (err) {
        return message.reply(`❌ Could not DM ${userMention.tag}.`);
      }
    } else if (message.mentions.channels.first()) {
      target = message.mentions.channels.first();
      args.shift();
    } else if (firstArg?.match(/^\d{17,20}$/)) {
      const channel = message.guild?.channels.cache.get(firstArg);
      if (channel && channel.isTextBased()) {
        target = channel;
        args.shift();
      } else {
        const user = await client.users.fetch(firstArg).catch(() => null);
        if (user) {
          try {
            target = await user.createDM();
            isDM = true;
            args.shift();
          } catch (err) {
            return message.reply(`❌ Could not DM ${user.tag}.`);
          }
        }
      }
    }

    amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1) return message.reply('Amount must be a number greater than 0.');
    args.shift();

    text = args.join(' ');
    if (!text) return message.reply('What am I supposed to send?');

    // 🚀 INSTANT START - NO DELAY MESSAGE
    const startTime = Date.now();
    
    try {
      let sent = 0;
      let failed = 0;

      // ⚡⚡⚡ CHANNEL FLOOD (WEBHOOK - HYPER SPEED)
      if (!isDM) {
        try {
          // CREATE MULTIPLE WEBHOOKS FOR PARALLEL SENDING
          const webhooks = [];
          
          // Create 3 webhooks for parallel sending
          for (let w = 0; w < 3; w++) {
            const webhook = await target.createWebhook({
              name: `Flood${w + 1}`,
              avatar: client.user.displayAvatarURL(),
              reason: 'Flood command'
            });
            webhooks.push(webhook);
          }

          const WEBHOOK_BATCH = 10; // Per webhook
          const totalParallel = WEBHOOK_BATCH * webhooks.length; // 30 messages at once!
          
          for (let i = 0; i < amount; i += totalParallel) {
            const batchPromises = [];
            const toSend = Math.min(totalParallel, amount - i);
            
            // Distribute messages across all webhooks
            for (let j = 0; j < toSend; j++) {
              const webhookIndex = j % webhooks.length;
              batchPromises.push(
                webhooks[webhookIndex].send({
                  content: text,
                  username: `Flood ${i + j + 1}`,
                  avatarURL: client.user.displayAvatarURL()
                }).catch(() => { failed++; return null; })
              );
            }
            
            // FIRE ALL AT ONCE - NO WAITING
            await Promise.allSettled(batchPromises);
            sent += toSend;
            
            // MICRO DELAY: 10ms (BARE MINIMUM)
            if (i + totalParallel < amount) {
              await new Promise(r => setTimeout(r, 10));
            }
          }

          // Clean up all webhooks
          await Promise.all(webhooks.map(w => w.delete().catch(() => {})));
          
        } catch (webhookError) {
          // Fallback: SINGLE WEBHOOK MAX SPEED
          const webhook = await target.createWebhook({
            name: 'FloodWave',
            avatar: client.user.displayAvatarURL(),
            reason: 'Flood command'
          });

          const WEBHOOK_BATCH = 20; // HUGE BATCH
          
          for (let i = 0; i < amount; i += WEBHOOK_BATCH) {
            const batchSize = Math.min(WEBHOOK_BATCH, amount - i);
            const promises = Array(batchSize).fill().map((_, j) => 
              webhook.send({
                content: text,
                username: `Flood ${i + j + 1}`,
                avatarURL: client.user.displayAvatarURL()
              }).catch(() => { failed++; return null; })
            );
            
            await Promise.allSettled(promises);
            sent += batchSize;
            
            // TINY DELAY: 15ms
            if (i + WEBHOOK_BATCH < amount) {
              await new Promise(r => setTimeout(r, 15));
            }
          }

          await webhook.delete().catch(() => {});
        }
        
      } else {
        // 📨📨📨 DM FLOOD (ULTRA OPTIMIZED)
        // Strategy: Send in waves, no waiting for responses
        const DM_BATCH = 7; // Increased batch
        const promises = [];
        
        for (let i = 0; i < amount; i++) {
          // Queue message without waiting
          promises.push(
            target.send(text).catch(() => { failed++; return null; })
          );
          
          // Every 7 messages, process the batch
          if (promises.length >= DM_BATCH) {
            await Promise.allSettled(promises);
            sent += promises.length;
            promises.length = 0; // Clear array
            
            // MICRO DELAY: 60ms (optimized)
            if (i < amount - 1) {
              await new Promise(r => setTimeout(r, 60));
            }
          }
        }
        
        // Process any remaining promises
        if (promises.length > 0) {
          await Promise.allSettled(promises);
          sent += promises.length;
        }
      }

      // 📊 RESULTS
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

      const resultEmbed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle('⚡ FLOOD COMPLETE')
        .setDescription(`**Target:** ${isDM ? 'User DMs' : `#${target.name || 'Channel'}`}`)
        .addFields(
          { name: 'Sent', value: `${sent}/${amount}`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Speed', value: `${speed}/sec`, inline: true },
          { name: 'Method', value: isDM ? 'Direct' : 'Multi-Webhook', inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [resultEmbed] }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });

      console.log(`[Flood] ${message.author.tag} -> ${isDM ? 'DM' : `#${target.name}`}: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);

    } catch (error) {
      console.error('[Flood] Critical:', error);
      await message.reply(`💥 Flood failed: ${error.message}`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }
  },
};