const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Floods channels with 20 webhooks - brute force until done.',
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

    // 🚀 BRUTE FORCE START
    const startTime = Date.now();
    console.log(`[Flood] Starting brute force flood of ${amount} messages...`);

    try {
      let sent = 0;
      let failed = 0;

      // 🔥 CHANNEL FLOOD - BRUTE FORCE MODE
      if (!isDM) {
        // Create as many webhooks as possible (try 20)
        console.log(`[Flood] Creating maximum webhooks...`);
        
        const webhooks = [];
        const createPromises = [];
        
        for (let w = 0; w < 20; w++) {
          createPromises.push(
            target.createWebhook({
              name: `Flood${w + 1}_${Date.now()}`,
              avatar: client.user.displayAvatarURL(),
              reason: 'Brute force flood'
            }).then(webhook => {
              webhooks.push(webhook);
              console.log(`[Flood] Webhook ${w + 1} created`);
            }).catch(err => {
              console.log(`[Flood] Webhook ${w + 1} failed: ${err.code || err.message}`);
            })
          );
        }
        
        await Promise.allSettled(createPromises);
        
        if (webhooks.length === 0) {
          throw new Error('Failed to create any webhooks');
        }
        
        console.log(`[Flood] ${webhooks.length} webhooks ready. Starting brute force...`);

        // 🔥 INFINITE SEND LOOP - NO STOPPING
        const sendLoop = async (webhook, webhookId) => {
          while (sent < amount) {
            try {
              // NO DELAY, NO WAITING - JUST SEND
              await webhook.send({
                content: text,
                username: `Flood${webhookId}`,
                avatarURL: client.user.displayAvatarURL()
              });
              
              sent++;
              
              // Update counter every 100 messages
              if (sent % 100 === 0) {
                console.log(`[Flood] Progress: ${sent}/${amount} (${webhooks.length} webhooks active)`);
              }
              
            } catch (err) {
              failed++;
              
              // If webhook is dead, remove it and break this loop
              if (err.code === 10015 || err.code === 429 || err.message.includes('rate limit')) {
                console.log(`[Flood] Webhook ${webhookId} died`);
                const index = webhooks.indexOf(webhook);
                if (index > -1) {
                  webhooks.splice(index, 1);
                }
                break;
              }
              
              // If unknown error, wait 100ms and continue
              await new Promise(r => setTimeout(r, 100));
            }
          }
        };

        // Start ALL webhooks simultaneously
        const floodPromises = [];
        webhooks.forEach((webhook, index) => {
          floodPromises.push(sendLoop(webhook, index + 1));
        });

        console.log(`[Flood] All ${webhooks.length} webhooks firing continuously...`);

        // Monitor and create NEW webhooks as old ones die
        const webhookManager = setInterval(async () => {
          if (sent >= amount) {
            clearInterval(webhookManager);
            return;
          }
          
          // If we're running low on webhooks, create more
          if (webhooks.length < 5) {
            console.log(`[Flood] Creating replacement webhooks (currently: ${webhooks.length})`);
            
            for (let w = 0; w < 10 - webhooks.length; w++) {
              try {
                const newWebhook = await target.createWebhook({
                  name: `FloodR${Date.now()}`,
                  avatar: client.user.displayAvatarURL(),
                  reason: 'Replacement'
                });
                
                webhooks.push(newWebhook);
                // Start this new webhook
                floodPromises.push(sendLoop(newWebhook, `R${w}`));
                console.log(`[Flood] Replacement webhook created`);
              } catch (err) {
                // Can't create more, that's fine
              }
            }
          }
        }, 2000); // Check every 2 seconds

        // Wait for completion or 5 minute timeout
        const timeout = Math.max(30000, amount * 200); // At least 30 seconds
        await Promise.race([
          Promise.allSettled(floodPromises),
          new Promise(resolve => setTimeout(resolve, timeout))
        ]);

        clearInterval(webhookManager);

        // FINAL PUSH - if we're close but not done
        if (sent < amount && amount - sent < 50) {
          console.log(`[Flood] Final push: ${amount - sent} messages remaining`);
          const finalPromises = [];
          for (let i = sent; i < amount; i++) {
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

        // Cleanup whatever webhooks are left
        console.log(`[Flood] Cleaning up ${webhooks.length} webhooks...`);
        for (const webhook of webhooks) {
          try {
            await webhook.delete().catch(() => {});
          } catch {
            // Ignore cleanup errors
          }
        }

      } else {
        // 📨 DM FLOOD - Just brute force it
        console.log(`[Flood] Starting DM brute force...`);
        
        while (sent < amount) {
          try {
            await target.send(text);
            sent++;
            
            // Minimal delay every 5 messages to not get instantly blocked
            if (sent % 5 === 0) {
              await new Promise(r => setTimeout(r, 50));
            }
          } catch (err) {
            failed++;
            // Wait 500ms on error then continue
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }

      // 📊 FINAL RESULTS
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

      const resultEmbed = new EmbedBuilder()
        .setColor(sent >= amount * 0.9 ? '#00ff00' : '#ffaa00')
        .setTitle(sent >= amount ? '✅ FLOOD COMPLETE' : '⚠️ FLOOD PARTIAL')
        .setDescription(`**Target:** ${isDM ? 'User DMs' : `#${target.name || 'Channel'}`}`)
        .addFields(
          { name: 'Success', value: `${sent}/${amount}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Completion', value: `${Math.round((sent / amount) * 100)}%`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
          { name: 'Status', value: sent >= amount ? 'Complete' : 'Partial', inline: true }
        )
        .setFooter({ text: 'Brute force mode - No stops until done' })
        .setTimestamp();

      const resultMsg = await message.reply({ embeds: [resultEmbed] });
      
      setTimeout(() => {
        resultMsg.delete().catch(() => {});
      }, 5000);

      console.log(`[Flood] FINAL: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);

    } catch (error) {
      console.error('[Flood] Fatal error:', error);
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