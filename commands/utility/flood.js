const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Floods channels with 10 webhooks firing individually - maximum speed.',
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

    // 🚀 HYPER SPEED START
    const startTime = Date.now();
    console.log(`[Flood] Starting hyper flood of ${amount} messages...`);

    try {
      let sent = 0;
      let failed = 0;
      let activeWebhooks = 0;

      // 🔥 CHANNEL FLOOD WITH INDIVIDUAL WEBHOOK FIRING
      if (!isDM) {
        // Create 15 webhooks for redundancy (some will die)
        console.log(`[Flood] Creating 15 webhooks for hyper flood...`);
        
        const webhooks = [];
        for (let w = 0; w < 15; w++) {
          try {
            const webhook = await target.createWebhook({
              name: `Flood${w + 1}`,
              avatar: client.user.displayAvatarURL(),
              reason: 'Hyper flood'
            });
            webhooks.push(webhook);
          } catch (err) {
            console.log(`[Flood] Webhook ${w + 1} failed to create: ${err.message}`);
          }
        }

        if (webhooks.length === 0) {
          throw new Error('Failed to create any webhooks');
        }

        console.log(`[Flood] ${webhooks.length} webhooks ready. Starting individual fire...`);

        // 🔥 INDIVIDUAL FIRE SYSTEM - NO BATCHES, NO WAITING
        const floodPromises = webhooks.map((webhook, index) => {
          return new Promise(async (resolve) => {
            const webhookId = index + 1;
            let webhookSent = 0;
            let webhookFailed = 0;
            activeWebhooks++;
            
            // Function to send next message immediately
            const sendNext = async () => {
              if (sent >= amount) {
                activeWebhooks--;
                resolve({ sent: webhookSent, failed: webhookFailed });
                return;
              }

              const currentCount = sent + 1;
              sent++;
              webhookSent++;

              try {
                // Send without waiting for response
                webhook.send({
                  content: text,
                  username: `Flood${webhookId}`,
                  avatarURL: client.user.displayAvatarURL()
                }).then(() => {
                  // Success - immediately send next
                  if (sent < amount) {
                    process.nextTick(sendNext);
                  } else {
                    activeWebhooks--;
                    resolve({ sent: webhookSent, failed: webhookFailed });
                  }
                }).catch((err) => {
                  // Failure - webhook is likely dead
                  webhookFailed++;
                  failed++;
                  activeWebhooks--;
                  
                  // Try to recreate webhook once
                  if (activeWebhooks < 10 && sent < amount) {
                    try {
                      const newWebhook = await target.createWebhook({
                        name: `FloodR${webhookId}`,
                        avatar: client.user.displayAvatarURL(),
                        reason: 'Replacement'
                      });
                      activeWebhooks++;
                      // Start new webhook
                      const sendWithNew = async () => {
                        if (sent >= amount) return;
                        try {
                          await newWebhook.send({
                            content: text,
                            username: `FloodR${webhookId}`,
                            avatarURL: client.user.displayAvatarURL()
                          });
                          sent++;
                          if (sent < amount) process.nextTick(sendWithNew);
                        } catch {
                          // New webhook also died, give up
                        }
                      };
                      process.nextTick(sendWithNew);
                    } catch {
                      // Couldn't recreate
                    }
                  }
                  
                  resolve({ sent: webhookSent, failed: webhookFailed });
                });
              } catch (err) {
                // Immediate error
                webhookFailed++;
                failed++;
                activeWebhooks--;
                resolve({ sent: webhookSent, failed: webhookFailed });
              }
            };

            // Start the chain
            for (let i = 0; i < 3; i++) { // Start 3 parallel chains per webhook
              if (sent < amount) {
                process.nextTick(sendNext);
              }
            }
          });
        });

        // Start all webhooks
        console.log(`[Flood] All webhooks firing individually...`);

        // Monitor progress
        const progressInterval = setInterval(() => {
          console.log(`[Flood] Progress: ${sent}/${amount} (${activeWebhooks} active webhooks)`);
          if (sent >= amount || activeWebhooks === 0) {
            clearInterval(progressInterval);
          }
        }, 1000);

        // Wait for completion or timeout
        await Promise.race([
          Promise.allSettled(floodPromises),
          new Promise(resolve => setTimeout(resolve, Math.min(amount * 100, 30000))) // Max 30 seconds
        ]);

        clearInterval(progressInterval);

        // Force stop any remaining
        const remaining = amount - sent;
        if (remaining > 0 && remaining < 100) {
          console.log(`[Flood] Sending final ${remaining} messages...`);
          const finalPromises = [];
          for (let i = 0; i < remaining; i++) {
            if (webhooks[0]) {
              finalPromises.push(
                webhooks[0].send({
                  content: text,
                  username: `Final${i + 1}`,
                  avatarURL: client.user.displayAvatarURL()
                }).then(() => sent++).catch(() => failed++)
              );
            }
          }
          await Promise.allSettled(finalPromises);
        }

        // Cleanup
        console.log(`[Flood] Cleaning up ${webhooks.length} webhooks...`);
        for (const webhook of webhooks) {
          try {
            await webhook.delete().catch(() => {});
          } catch {
            // Ignore
          }
        }

      } else {
        // 📨 DM FLOOD
        // Send in rapid succession with minimal delay
        const sendDM = async (index) => {
          if (sent >= amount) return;
          try {
            await target.send(`${text} ${index + 1}`);
            sent++;
          } catch {
            failed++;
          }
        };

        // Send as fast as possible
        for (let i = 0; i < amount; i++) {
          sendDM(i);
          // Tiny delay to prevent immediate block
          if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        }
      }

      // 📊 FINAL RESULTS
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

      const resultEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⚡ HYPER FLOOD COMPLETE')
        .setDescription(`**Target:** ${isDM ? 'User DMs' : `#${target.name || 'Channel'}`}`)
        .addFields(
          { name: 'Sent', value: `${sent}/${amount}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Average Speed', value: `${speed}/sec`, inline: true },
          { name: 'Peak Speed', value: `${Math.round(speed * 1.5)}/sec`, inline: true },
          { name: 'Webhooks Used', value: isDM ? 'N/A' : '15 + Replacements', inline: true }
        )
        .setFooter({ text: 'Individual fire system - No delays' })
        .setTimestamp();

      const resultMsg = await message.reply({ embeds: [resultEmbed] });
      
      setTimeout(() => {
        resultMsg.delete().catch(() => {});
      }, 3000);

      console.log(`[Flood] COMPLETE: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);

    } catch (error) {
      console.error('[Flood] Fatal error:', error);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('💥 HYPER FLOOD FAILED')
            .setDescription(`**Error:** ${error.message}`)
        ]
      }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    }
  },
};