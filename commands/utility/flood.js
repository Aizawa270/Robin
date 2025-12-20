const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Floods channels with maximum speed using 10 webhooks - owner only.',
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

    // 🚀 MAXIMUM SPEED START
    const startTime = Date.now();

    try {
      let sent = 0;
      let failed = 0;

      // 🔥 CHANNEL FLOOD WITH 10 WEBHOOKS (NO INTERVALS)
      if (!isDM) {
        console.log(`[Flood] Creating 10 webhooks for maximum speed...`);
        
        // Create all 10 webhooks in parallel immediately
        const webhookPromises = [];
        for (let w = 0; w < 10; w++) {
          webhookPromises.push(
            target.createWebhook({
              name: `Flood${w + 1}`,
              avatar: client.user.displayAvatarURL(),
              reason: 'Maximum speed flood'
            }).catch(err => {
              console.log(`[Flood] Webhook ${w + 1} failed: ${err.message}`);
              return null;
            })
          );
        }
        
        const webhooks = (await Promise.all(webhookPromises)).filter(w => w !== null);
        
        if (webhooks.length === 0) {
          throw new Error('Failed to create any webhooks');
        }
        
        console.log(`[Flood] ${webhooks.length} webhooks ready. Starting continuous flood...`);

        // 🔥 CONTINUOUS FLOOD - NO DELAYS, NO INTERVALS
        const MESSAGES_PER_WEBHOOK = 999999; // Basically unlimited per webhook
        let completed = false;
        
        // Create a flood function for each webhook that runs independently
        const floodPromises = webhooks.map((webhook, index) => {
          return (async () => {
            let localSent = 0;
            const webhookId = index + 1;
            
            while (!completed && sent < amount) {
              // Try to send multiple messages at once
              const batchPromises = [];
              const batchSize = 5; // Send 5 messages per batch per webhook
              
              for (let i = 0; i < batchSize; i++) {
                if (sent >= amount || completed) break;
                
                batchPromises.push(
                  webhook.send({
                    content: text,
                    username: `Flood${webhookId}`,
                    avatarURL: client.user.displayAvatarURL()
                  }).then(() => {
                    sent++;
                    localSent++;
                  }).catch(err => {
                    failed++;
                    // If webhook is deleted or rate limited, stop this webhook
                    if (err.code === 10015 || err.code === 429) {
                      console.log(`[Flood] Webhook ${webhookId} failed, removing from rotation`);
                      completed = true; // Stop all webhooks if one fails badly
                      throw err;
                    }
                  })
                );
              }
              
              // Send batch without waiting - fire and forget
              try {
                await Promise.allSettled(batchPromises);
              } catch (batchErr) {
                // If batch fails, this webhook is likely dead
                break;
              }
              
              // NO DELAY - CONTINUOUS FLOOD
              // Just continue immediately to next batch
            }
            
            return localSent;
          })();
        });

        // Wait for all webhooks to finish or amount to be reached
        try {
          const results = await Promise.allSettled(floodPromises);
          
          // Sum up all messages sent
          for (const result of results) {
            if (result.status === 'fulfilled') {
              // Already counted in sent counter
            }
          }
        } catch (globalErr) {
          console.log(`[Flood] Global error: ${globalErr.message}`);
        }
        
        completed = true;

        // Cleanup webhooks
        console.log(`[Flood] Cleaning up ${webhooks.length} webhooks...`);
        const cleanupPromises = webhooks.map(webhook => 
          webhook.delete().catch(() => {})
        );
        await Promise.allSettled(cleanupPromises);

      } else {
        // 📨 DM FLOOD - Still needs some delay due to Discord limits
        const DM_BATCH = 3;
        
        for (let i = 0; i < amount; i += DM_BATCH) {
          const batchSize = Math.min(DM_BATCH, amount - i);
          const promises = [];
          
          for (let j = 0; j < batchSize; j++) {
            promises.push(
              target.send(text).then(() => {
                sent++;
              }).catch(err => {
                failed++;
                return null;
              })
            );
          }
          
          await Promise.allSettled(promises);
          
          // Minimal delay for DMs only
          if (i + DM_BATCH < amount) {
            await new Promise(r => setTimeout(r, 50));
          }
        }
      }

      // 📊 RESULTS
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

      const resultEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('⚡ MAX SPEED FLOOD COMPLETE')
        .setDescription(`**Target:** ${isDM ? 'User DMs' : `#${target.name || 'Channel'}`}`)
        .addFields(
          { name: 'Sent', value: `${sent}/${amount}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Speed', value: `${speed}/sec`, inline: true },
          { name: 'Webhooks', value: isDM ? 'N/A' : '10x Parallel', inline: true },
          { name: 'Method', value: 'Continuous No-Delay', inline: true }
        )
        .setFooter({ text: 'Maximum speed achieved' })
        .setTimestamp();

      const resultMsg = await message.reply({ embeds: [resultEmbed] });
      
      // Auto-delete after 2 seconds
      setTimeout(() => {
        resultMsg.delete().catch(() => {});
      }, 2000);

      console.log(`[Flood] ${message.author.tag} -> ${isDM ? 'DM' : target.name || target.id}: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);

    } catch (error) {
      console.error('[Flood] Error:', error);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('💥 FLOOD FAILED')
            .setDescription(`**Error:** ${error.message}`)
        ]
      }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    }
  },
};