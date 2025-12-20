const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Floods channels (5-webhook nuclear) or DMs - owner only.',
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

    // 🚀 NUCLEAR START
    const startTime = Date.now();
    
    try {
      let sent = 0;
      let failed = 0;

      // ⚡⚡⚡⚡⚡ 5-WEBHOOK NUCLEAR FLOOD (CHANNELS ONLY)
      if (!isDM) {
        try {
          // CREATE 5 WEBHOOKS FOR MAXIMUM PARALLELISM
          const webhooks = [];
          console.log(`[Flood] Creating 5 webhooks for nuclear flood...`);
          
          // Create all 5 webhooks in parallel
          const webhookPromises = [];
          for (let w = 0; w < 5; w++) {
            webhookPromises.push(
              target.createWebhook({
                name: `Nuke${w + 1}`,
                avatar: client.user.displayAvatarURL(),
                reason: 'Nuclear flood command'
              }).then(webhook => webhooks.push(webhook))
            );
          }
          await Promise.all(webhookPromises);
          
          console.log(`[Flood] 5 webhooks ready. Starting nuclear flood...`);

          // NUCLEAR SETTINGS
          const WEBHOOK_BATCH = 12; // 12 per webhook
          const TOTAL_PARALLEL = WEBHOOK_BATCH * webhooks.length; // 60 messages at once!
          
          // NUCLEAR LAUNCH SEQUENCE
          for (let i = 0; i < amount; i += TOTAL_PARALLEL) {
            const batchPromises = [];
            const toSend = Math.min(TOTAL_PARALLEL, amount - i);
            
            // Distribute across all 5 webhooks
            for (let j = 0; j < toSend; j++) {
              const webhookIndex = j % webhooks.length;
              batchPromises.push(
                webhooks[webhookIndex].send({
                  content: text,
                  username: `Nuke${i + j + 1}`,
                  avatarURL: client.user.displayAvatarURL()
                }).catch((err) => { 
                  failed++; 
                  // If rate limited, delete that webhook and continue
                  if (err.code === 429) {
                    webhooks[webhookIndex]?.delete().catch(() => {});
                    webhooks[webhookIndex] = null;
                  }
                  return null; 
                })
              );
            }
            
            // LAUNCH ALL 60 MESSAGES SIMULTANEOUSLY
            await Promise.allSettled(batchPromises);
            sent += toSend;
            
            // ALMOST ZERO DELAY: 5ms (NUCLEAR SPEED)
            if (i + TOTAL_PARALLEL < amount) {
              await new Promise(r => setTimeout(r, 5));
            }
            
            // Clean up dead webhooks
            const activeWebhooks = webhooks.filter(w => w !== null);
            if (activeWebhooks.length === 0) break;
          }

          // Clean up remaining webhooks
          console.log(`[Flood] Cleaning up ${webhooks.filter(w => w !== null).length} webhooks...`);
          await Promise.all(
            webhooks.filter(w => w !== null).map(w => 
              w.delete().catch(() => {})
            )
          );
          
        } catch (nukeError) {
          console.error('[Flood] Nuclear failed, falling back to single webhook:', nukeError);
          
          // Fallback to single webhook but still fast
          const webhook = await target.createWebhook({
            name: 'FallbackFlood',
            avatar: client.user.displayAvatarURL(),
            reason: 'Flood command fallback'
          });

          const WEBHOOK_BATCH = 25; // Huge batch as fallback
          
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
            
            if (i + WEBHOOK_BATCH < amount) {
              await new Promise(r => setTimeout(r, 10));
            }
          }

          await webhook.delete().catch(() => {});
        }
        
      } else {
        // 📨 DM FLOOD (OPTIMIZED BUT NOT NUCLEAR)
        // DMs can't use webhooks, so we optimize differently
        const DM_WAVE_SIZE = 10; // Increased wave size
        
        for (let wave = 0; wave < amount; wave += DM_WAVE_SIZE) {
          const waveSize = Math.min(DM_WAVE_SIZE, amount - wave);
          const wavePromises = Array(waveSize).fill().map((_, i) => 
            target.send(`${text} ${wave + i + 1}`).catch(() => { 
              failed++; 
              return null; 
            })
          );
          
          // Fire entire wave at once
          await Promise.allSettled(wavePromises);
          sent += waveSize;
          
          // Minimal delay for DMs
          if (wave + DM_WAVE_SIZE < amount) {
            await new Promise(r => setTimeout(r, 40));
          }
        }
      }

      // 📊 NUCLEAR RESULTS
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;

      const resultEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('☢️ NUCLEAR FLOOD COMPLETE')
        .setDescription(`**Target:** ${isDM ? 'User DMs' : `#${target.name || 'Channel'}`}`)
        .addFields(
          { name: 'Sent', value: `${sent}/${amount}`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Speed', value: `${speed}/sec`, inline: true },
          { name: 'Webhooks', value: isDM ? 'N/A' : '5x Parallel', inline: true },
          { name: 'Batch Size', value: isDM ? '10/wave' : '60/batch', inline: true },
          { name: 'Status', value: failed > 0 ? 'Partial' : 'Full', inline: true }
        )
        .setFooter({ text: '☢️ Nuclear mode activated' })
        .setTimestamp();

      await message.reply({ embeds: [resultEmbed] }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 2000);
      });

      console.log(`[NukeFlood] ${message.author.tag} -> ${isDM ? 'DM' : `#${target.name}`}: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);

    } catch (error) {
      console.error('[NukeFlood] Meltdown:', error);
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('💥 NUCLEAR MELTDOWN')
            .setDescription(`**Reactor overload:** ${error.message}\n\nCooling down required.`)
        ]
      }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    }
  },
};