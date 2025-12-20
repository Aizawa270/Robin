const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430']; // Both owner IDs
const MAX_FLOOD = 1000; // Max 1000 messages

module.exports = {
  name: 'flood',
  description: 'Floods a channel, user DMs, or specific channel (owner only).',
  category: 'utility',
  hidden: true,
  usage: '$flood [@user|#channel|channelID] <amount> <text>',
  async execute(client, message, args) {

    // 🔒 Owner lock - BOTH IDs
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

    // Target detection (same as before)
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
    if (isNaN(amount) || amount < 1) {
      return message.reply('Amount must be a number greater than 0.');
    }
    args.shift();

    if (amount > MAX_FLOOD) {
      amount = MAX_FLOOD;
    }

    text = args.join(' ');
    if (!text) return message.reply('What am I supposed to send?');

    // ⚡⚡⚡ ULTIMATE FAST ENGINE ⚡⚡⚡
    try {
      const startTime = Date.now();
      const startMsg = await message.reply(`⚡ **FLOODING ${amount} MESSAGES**...`);
      
      // DANGEROUSLY FAST SETTINGS
      const MEGA_BATCH = isDM ? 25 : 50; // Send 50 at once in channels!
      const messages = Array(amount).fill(text);
      let sent = 0;
      let failed = 0;
      
      // Process in MEGA batches
      for (let i = 0; i < messages.length; i += MEGA_BATCH) {
        const batch = messages.slice(i, i + MEGA_BATCH);
        const promises = batch.map(msg => 
          target.send(msg).catch(() => {
            failed++;
            return null;
          })
        );
        
        // Send ALL in parallel - NO WAITING
        await Promise.allSettled(promises);
        sent += batch.length;
        
        // Micro delay ONLY if rate limited
        if (failed > sent * 0.1) { // If 10% failed, slow down slightly
          await new Promise(r => setTimeout(r, 10));
        }
      }
      
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
      
      // Quick result
      await startMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('⚡ FLOOD COMPLETE')
            .setDescription(`**Target:** ${isDM ? 'User DMs' : 'Channel'}`)
            .addFields(
              { name: 'Sent', value: `${sent}/${amount}`, inline: true },
              { name: 'Time', value: `${totalTime.toFixed(2)}s`, inline: true },
              { name: 'Speed', value: `${speed}/sec`, inline: true },
              { name: 'Batch Size', value: `${MEGA_BATCH}`, inline: true }
            )
        ]
      }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
      
      console.log(`[Flood] ${message.author.tag} -> ${target.name || 'DM'}: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);
      
    } catch (error) {
      console.error('[Flood] Critical:', error);
      await message.reply(`💥 Flood crashed: ${error.message}`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }
  },
};