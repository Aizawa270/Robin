const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = ['852839588689870879', '908521674700390430'];

module.exports = {
  name: 'flood',
  description: 'Fast webhook flood with Vanessa webhooks.',
  category: 'utility',
  hidden: true,
  usage: '$flood <amount> <text>',
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

    if (!args.length) return message.reply('Usage: `$flood <amount> <text>`');

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 5000) {
      return message.reply('Amount must be 1-5000.');
    }
    
    args.shift();
    const text = args.join(' ');
    if (!text) return message.reply('Need text to send.');

    // 🚀 START NOTIFICATION
    const startEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('☢️ NUCLEAR FLOOD ACTIVATED')
      .setDescription(`**Target:** ${message.channel}\n**Amount:** ${amount}\n**Text:** "${text}"`)
      .addFields(
        { name: 'Webhooks', value: '5x Vanessa', inline: true },
        { name: 'Method', value: 'Parallel Send', inline: true },
        { name: 'Status', value: 'Starting...', inline: true }
      )
      .setFooter({ text: 'Vanessa Flood System v2' })
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });
    const startTime = Date.now();

    try {
      const webhooks = [];
      let sent = 0;
      let failed = 0;
      
      // 1. CREATE 5 VANESSA WEBHOOKS
      console.log(`[Flood] Creating 5 Vanessa webhooks...`);
      for (let i = 0; i < 5; i++) {
        try {
          const webhook = await message.channel.createWebhook({
            name: 'Vanessa',
            avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png', // Optional: add avatar
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
          .setDescription(`**Target:** ${message.channel}`)
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
        .setDescription(`**Target:** ${message.channel}`)
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
      
      console.log(`[Flood] Completed: ${sent}/${amount} in ${totalTime.toFixed(2)}s (${speed}/sec)`);

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