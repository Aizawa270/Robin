const { EmbedBuilder } = require('discord.js');

// Original IDs plus the two roles you wanted
const OWNER_IDS = [
  '852839588689870879', 
  '908521674700390430'
];

const ALLOWED_ROLES = [
  '1447894643277561856',
  '1431646610752012420'
];

module.exports = {
  name: 'spamping',
  description: 'Fast webhook flood that targets a specific user or role mention.',
  category: 'utility',
  hidden: true,
  usage: '$spamping [target ping] [amount] [optional text]',
  async execute(client, message, args) {
    // Permission check
    const hasOwnerId = OWNER_IDS.includes(message.author.id);
    const hasRole = message.member?.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    if (!hasOwnerId && !hasRole) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor('#f472b6')
          .setDescription("You're not that guy 😹😹")
      ] });
    }

    // Input validation
    if (args.length < 2) {
      return message.reply('Usage: `$spamping <@User/@Role> <amount> [optional text]`\nExamples:\n`$spamping @User 100`\n`$spamping @Staff 50 wake up!`');
    }

    const mentionTarget = args[0];
    // Check if the first argument is actually a valid user or role mention format
    if (!mentionTarget.match(/<@!?\d+>/) && !mentionTarget.match(/<@&\d+>/)) {
      return message.reply('Please provide a valid user or role ping as the first argument.');
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 5000) return message.reply('Amount must be 1-5000.');

    // Build the payload (ping + optional text)
    const extraText = args.slice(2).join(' ');
    const fullPayload = extraText ? `${mentionTarget} ${extraText}` : mentionTarget;

    const targetChannel = message.channel;
    const webhooks = [];
    let sent = 0, failed = 0;
    const startTime = Date.now();

    // Start setup embed
    const startEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('☢️ NUCLEAR SPAM PING ACTIVATED')
      .setDescription(`**Target:** ${mentionTarget}\n**Channel:** ${targetChannel}\n**Amount:** ${amount}`)
      .addFields(
        { name: 'Webhooks', value: '5x Vanessa', inline: true },
        { name: 'Method', value: 'Parallel Ping', inline: true },
        { name: 'Status', value: 'Spawning Webhooks...', inline: true }
      )
      .setFooter({ text: 'Vanessa Flood System v3 • SpamPing' })
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });

    try {
      // Create Webhooks for maximum speed
      for (let i = 0; i < 5; i++) {
        try {
          const webhook = await targetChannel.createWebhook({
            name: 'Vanessa Pinger',
            avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
            reason: 'Spamping command'
          });
          webhooks.push(webhook);
        } catch {}
      }

      if (webhooks.length === 0) throw new Error('Could not create any webhooks. Check channel permissions.');

      const updateProgress = async () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;
        const progressEmbed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('☢️ PING FLOOD IN PROGRESS')
          .setDescription(`**Targeting:** ${mentionTarget}\n**Channel:** ${targetChannel}`)
          .addFields(
            { name: 'Sent', value: `${sent}/${amount}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
            { name: 'Speed', value: `${speed}/sec`, inline: true },
            { name: 'Webhooks', value: `${webhooks.length} active`, inline: true },
            { name: 'Progress', value: `${Math.round((sent / amount) * 100)}%`, inline: true }
          )
          .setFooter({ text: 'Vanessa Flood System • Syncing...' })
          .setTimestamp();
        try { await startMsg.edit({ embeds: [progressEmbed] }); } catch {}
      };

      const floodWebhook = async (webhook) => {
        let localSent = 0;
        const maxPerWebhook = Math.ceil(amount / webhooks.length);
        
        while (sent < amount && localSent < maxPerWebhook) {
          try {
            await webhook.send({
              content: fullPayload,
              username: 'Vanessa',
              avatarURL: client.user.displayAvatarURL(),
              allowedMentions: { parse: ['users', 'roles'] } // Explicitly allows user/role pings through the webhook
            });
            sent++; localSent++;
            if (sent % 25 === 0) await updateProgress();
            if (sent % 5 === 0) await new Promise(r => setTimeout(r, 20));
          } catch (err) { 
            failed++; 
            if (err.code === 10015 || err.code === 429) { 
              webhooks.splice(webhooks.indexOf(webhook), 1); 
              break; 
            } 
            await new Promise(r => setTimeout(r, 100)); 
          }
        }
        return localSent;
      };

      // Run parallel workers
      await Promise.allSettled(webhooks.map(floodWebhook));

      // Cleanup
      for (const webhook of webhooks) {
        try { await webhook.delete(); } catch {}
      }

      // Final Results
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
      const resultEmbed = new EmbedBuilder()
        .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
        .setTitle(sent >= amount ? '✅ PING FLOOD COMPLETE' : '⚠️ PING FLOOD PARTIAL')
        .setDescription(`**Target:** ${mentionTarget}\n**Channel:** ${targetChannel}`)
        .addFields(
          { name: 'Success', value: `${sent}/${amount}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
          { name: 'Completion', value: `${Math.round((sent / amount) * 100)}%`, inline: true },
          { name: 'Webhooks Used', value: '5x Vanessa', inline: true }
        )
        .setFooter({ text: 'Vanessa Flood System • Job Done' })
        .setTimestamp();
        
      await startMsg.edit({ embeds: [resultEmbed] });

    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('💥 PING FLOOD FAILED')
        .setDescription(`**Error:** ${error.message}`)
        .setFooter({ text: 'Vanessa Flood System • Error' })
        .setTimestamp();
      await startMsg.edit({ embeds: [errorEmbed] });
    }
  },
};
