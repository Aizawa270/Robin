const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Fast webhook flood with Vanessa webhooks.',
  category: 'utility',
  hidden: true,
  usage: '$flood [channel/user] <amount> <text>',
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

    if (args.length < 2) return message.reply('Usage: `$flood [channel/user] <amount> <text>`\nExamples:\n`$flood #general 100 hello`\n`$flood @User 50 test`\n`$flood 100 spam` (current channel)');

    let targetChannel = message.channel;
    let targetUser = null;
    let targetDM = false;
    let amountIndex = 0;

    // Check if first arg is a channel mention or user mention
    if (args[0]) {
      // Check for channel mention (#channel)
      const channelMatch = args[0].match(/<#(\d+)>/);
      if (channelMatch) {
        const channelId = channelMatch[1];
        try {
          const channel = await message.guild.channels.fetch(channelId);
          if (channel && channel.isTextBased()) {
            targetChannel = channel;
            amountIndex = 1; // Move amount index
          } else {
            return message.reply('Invalid channel or channel is not text-based.');
          }
        } catch {
          return message.reply('Could not find that channel.');
        }
      } 
      // Check for user mention (@user)
      else if (args[0].match(/<@!?(\d+)>/)) {
        const userId = args[0].replace(/[<@!>]/g, '');
        try {
          targetUser = await client.users.fetch(userId);
          targetDM = true;
          amountIndex = 1; // Move amount index
        } catch {
          return message.reply('Could not find that user.');
        }
      }
      // Check for user ID
      else if (/^\d+$/.test(args[0])) {
        try {
          targetUser = await client.users.fetch(args[0]);
          targetDM = true;
          amountIndex = 1; // Move amount index
        } catch {
          // If it's a number but not a valid user, assume it's amount
        }
      }
    }

    // Get amount
    const amount = parseInt(args[amountIndex]);
    if (isNaN(amount) || amount < 1 || amount > 5000) {
      return message.reply('Amount must be 1-5000.');
    }

    // Get text (remaining args after amount)
    const textArgs = args.slice(amountIndex + 1);
    const text = textArgs.join(' ');
    if (!text) return message.reply('Need text to send.');

    // 🚀 START NOTIFICATION
    let targetDescription;
    if (targetDM) {
      targetDescription = `**Target:** ${targetUser.tag} (DM)`;
    } else {
      targetDescription = `**Target:** ${targetChannel}`;
    }

    const startEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('☢️ NUCLEAR FLOOD ACTIVATED')
      .setDescription(`${targetDescription}\n**Amount:** ${amount}\n**Text:** "${text}"`)
      .addFields(
        { name: 'Webhooks', value: '5x Vanessa', inline: true },
        { name: 'Method', value: 'Parallel Send', inline: true },
        { name: 'Status', value: 'Starting...', inline: true }
      )
      .setFooter({ text: 'Vanessa Flood System v3' })
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });
    const startTime = Date.now();

    try {
      // For DM floods, we send directly
      if (targetDM) {
        let sent = 0;
        let failed = 0;

        console.log(`[Flood] Starting DM flood to ${targetUser.tag}...`);

        // Update progress function for DM
        const updateProgress = async () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;

          const progressEmbed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('☢️ DM FLOOD IN PROGRESS')
            .setDescription(`**Target:** ${targetUser.tag}`)
            .addFields(
              { name: 'Sent', value: `${sent}/${amount}`, inline: true },
              { name: 'Failed', value: `${failed}`, inline: true },
              { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
              { name: 'Speed', value: `${speed}/sec`, inline: true },
              { name: 'Progress', value: `${Math.round((sent/amount)*100)}%`, inline: true }
            )
            .setFooter({ text: 'Vanessa Flood System • Working...' })
            .setTimestamp();

          try {
            await startMsg.edit({ embeds: [progressEmbed] });
          } catch {}
        };

        // DM flood loop
        for (let i = 0; i < amount; i++) {
          try {
            await targetUser.send(text);
            sent++;
            
            // Update progress every 25 messages
            if (sent % 25 === 0) {
              await updateProgress();
            }

            // Rate limiting protection for DMs
            if (sent % 5 === 0) {
              await new Promise(r => setTimeout(r, 100));
            }

          } catch (error) {
            failed++;
            console.log(`[Flood] DM failed: ${error.message}`);
            
            // If we can't DM (blocked or no mutual servers), stop
            if (error.code === 50007 || error.message.includes('Cannot send messages to this user')) {
              break;
            }
            
            // Rate limit - wait longer
            if (error.code === 40001 || error.code === 40002) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }

        // Final results for DM
        const totalTime = (Date.now() - startTime) / 1000;
        const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

        const resultEmbed = new EmbedBuilder()
          .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
          .setTitle(sent >= amount ? '✅ DM FLOOD COMPLETE' : '⚠️ DM FLOOD PARTIAL')
          .setDescription(`**Target:** ${targetUser.tag}`)
          .addFields(
            { name: 'Success', value: `${sent}/${amount}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
            { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
            { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true }
          )
          .setFooter({ text: 'Vanessa Flood System • Job Done' })
          .setTimestamp();

        await startMsg.edit({ embeds: [resultEmbed] });
        console.log(`[Flood] DM completed: ${sent}/${amount} to ${targetUser.tag}`);

      } else {
        // CHANNEL FLOOD (original webhook method)
        const webhooks = [];
        let sent = 0;
        let failed = 0;

        // 1. CREATE 5 VANESSA WEBHOOKS
        console.log(`[Flood] Creating 5 Vanessa webhooks in ${targetChannel.name}...`);
        for (let i = 0; i < 5; i++) {
          try {
            const webhook = await targetChannel.createWebhook({
              name: 'Vanessa',
              avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
              reason: 'Flood command'
            });
            webhooks.push(webhook);
            console.log(`[Flood] Webhook ${i+1} created`);
          } catch (err) {
            console.log(`[Flood] Failed to create webhook ${i+1}:`, err.message);
          }
        }

        if (webhooks.length === 0) {
          throw new Error('Could not create any webhooks');
        }

        console.log(`[Flood] ${webhooks.length} webhooks ready, starting flood...`);

        // 2. PROGRESS UPDATER
        const updateProgress = async () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;

          const progressEmbed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('☢️ FLOOD IN PROGRESS')
            .setDescription(`**Target:** ${targetChannel}`)
            .addFields(
              { name: 'Sent', value: `${sent}/${amount}`, inline: true },
              { name: 'Failed', value: `${failed}`, inline: true },
              { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
              { name: 'Speed', value: `${speed}/sec`, inline: true },
              { name: 'Webhooks', value: `${webhooks.length} active`, inline: true },
              { name: 'Progress', value: `${Math.round((sent/amount)*100)}%`, inline: true }
            )
            .setFooter({ text: 'Vanessa Flood System • Working...' })
            .setTimestamp();

          try {
            await startMsg.edit({ embeds: [progressEmbed] });
          } catch {}
        };

        // 3. FLOOD FUNCTION
        const floodWebhook = async (webhook, index) => {
          let localSent = 0;
          const maxPerWebhook = Math.ceil(amount / webhooks.length);

          while (sent < amount && localSent < maxPerWebhook) {
            try {
              await webhook.send({
                content: text,
                username: 'Vanessa',
                avatarURL: client.user.displayAvatarURL()
              });
              sent++;
              localSent++;

              // Update progress every 25 messages
              if (sent % 25 === 0) {
                await updateProgress();
              }

              // Small delay to prevent immediate rate limiting
              if (sent % 5 === 0) {
                await new Promise(r => setTimeout(r, 20));
              }

            } catch (err) {
              failed++;

              // If webhook is deleted, break this loop
              if (err.code === 10015 || err.code === 429) {
                console.log(`[Flood] Webhook ${index+1} died`);
                const webhookIndex = webhooks.indexOf(webhook);
                if (webhookIndex > -1) {
                  webhooks.splice(webhookIndex, 1);
                }
                break;
              }

              // Wait 100ms on other errors
              await new Promise(r => setTimeout(r, 100));
            }
          }

          return localSent;
        };

        // 4. RUN ALL WEBHOOKS
        const promises = webhooks.map((webhook, i) => floodWebhook(webhook, i));
        await Promise.allSettled(promises);

        // 5. FINAL CLEANUP
        console.log(`[Flood] Cleaning up ${webhooks.length} webhooks...`);
        for (const webhook of webhooks) {
          try {
            await webhook.delete();
          } catch {}
        }

        // 6. FINAL RESULTS
        const totalTime = (Date.now() - startTime) / 1000;
        const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

        const resultEmbed = new EmbedBuilder()
          .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
          .setTitle(sent >= amount ? '✅ FLOOD COMPLETE' : '⚠️ FLOOD PARTIAL')
          .setDescription(`**Target:** ${targetChannel}`)
          .addFields(
            { name: 'Success', value: `${sent}/${amount}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
            { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
            { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true },
            { name: 'Webhooks Used', value: '5x Vanessa', inline: true }
          )
          .setFooter({ text: 'Vanessa Flood System • Job Done' })
          .setTimestamp();

        await startMsg.edit({ embeds: [resultEmbed] });

        console.log(`[Flood] Channel completed: ${sent}/${amount} in ${targetChannel.name}`);
      }

    } catch (error) {
      console.error('[Flood] Error:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('💥 FLOOD FAILED')
        .setDescription(`**Error:** ${error.message}`)
        .setFooter({ text: 'Vanessa Flood System • Error' })
        .setTimestamp();

      await startMsg.edit({ embeds: [errorEmbed] });
    }
  },
};