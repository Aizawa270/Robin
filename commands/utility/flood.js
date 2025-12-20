const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];
const MAX_CHANNEL_FLOOD = 500; // Increased
const MAX_DM_FLOOD = 150; // Increased

module.exports = {
  name: 'flood',
  description: 'Floods channels (webhook) or DMs (optimized) - owner only.',
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

    const maxAmount = isDM ? MAX_DM_FLOOD : MAX_CHANNEL_FLOOD;
    if (amount > maxAmount) amount = maxAmount;

    // 🚀 NO START MESSAGE - INSTANT START
    const startTime = Date.now();
    
    try {
      let sent = 0;
      let failed = 0;

      // ⚡ CHANNEL FLOOD (WEBHOOK - MAX SPEED)
      if (!isDM) {
        try {
          const webhook = await target.createWebhook({
            name: 'FloodWave',
            avatar: client.user.displayAvatarURL(),
            reason: 'Flood command'
          });

          const WEBHOOK_BATCH = 15; // MAX BATCH SIZE
          
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
            
            // MINIMAL DELAY: 20ms (ALMOST NONE)
            if (i + WEBHOOK_BATCH < amount) {
              await new Promise(r => setTimeout(r, 20));
            }
          }

          await webhook.delete().catch(() => {});
          
        } catch (webhookError) {
          // Fallback to direct messages if webhook fails
          const BATCH_SIZE = 8;
          for (let i = 0; i < amount; i += BATCH_SIZE) {
            const batchSize = Math.min(BATCH_SIZE, amount - i);
            const promises = Array(batchSize).fill().map(() => 
              target.send(text).catch(() => { failed++; return null; })
            );
            
            await Promise.allSettled(promises);
            sent += batchSize;
            
            if (i + BATCH_SIZE < amount) {
              await new Promise(r => setTimeout(r, 100));
            }
          }
        }
        
      } else {
        // 📨 DM FLOOD (MAX SPEED FOR DMS)
        const DM_BATCH = 5;
        
        for (let i = 0; i < amount; i += DM_BATCH) {
          const batchSize = Math.min(DM_BATCH, amount - i);
          const promises = Array(batchSize).fill().map(() => 
            target.send(text).catch(() => { failed++; return null; })
          );
          
          await Promise.allSettled(promises);
          sent += batchSize;
          
          // DM DELAY: 80ms (MINIMUM)
          if (i + DM_BATCH < amount) {
            await new Promise(r => setTimeout(r, 80));
          }
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
          { name: 'Method', value: isDM ? 'Direct Messages' : 'Webhook', inline: true },
          { name: 'Sent', value: `${sent}/${amount}`, inline: true },
          { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Speed', value: `${speed}/sec`, inline: true }
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