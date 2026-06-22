const { EmbedBuilder } = require('discord.js');

// Master Owner ID (Always has access)
const MASTER_OWNER_ID = '852839588689870879';

// Add any other user IDs here who are allowed to use the command
const ALLOWED_USERS = [
  '852839588689870879', // Yours
];

module.exports = {
  name: 'spamping',
  description: 'Max-speed parallel multi-channel webhook flood that forces role and user pings.',
  category: 'utility',
  hidden: true,
  usage: '$spamping [target ping] [amount]',
  async execute(client, message, args) {
    const authorId = message.author.id;

    // Direct permission check
    const isMaster = authorId === MASTER_OWNER_ID;
    const isAllowed = ALLOWED_USERS.includes(authorId);

    if (!isMaster && !isAllowed) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor('#f472b6')
          .setDescription("You're not that guy 😹😹")
      ] });
    }

    // Input validation (Requires exactly target and amount)
    if (args.length < 2) {
      return message.reply('Usage: `$spamping <@User/@Role> <amount>`\nExamples:\n`$spamping @User 100`\n`$spamping @Staff 500`');
    }

    const mentionTarget = args[0];
    // Check if the first argument is a valid user or role mention format
    if (!mentionTarget.match(/<@!?\d+>/) && !mentionTarget.match(/<@&\d+>/)) {
      return message.reply('Please provide a valid user or role ping as the first argument.');
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 5000) return message.reply('Amount must be 1-5000.');

    // Find up to 5 text channels that the bot can write in to distribute the rate limits
    const targetChannels = message.guild.channels.cache
      .filter(c => c.isTextBased() && c.permissionsFor(client.user).has('SendMessages'))
      .take(5);

    const webhooks = [];
    let sent = 0, failed = 0;
    const startTime = Date.now();

    // Start setup embed
    const startEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('☢️ MULTI-CHANNEL PING ACTIVATED')
      .setDescription(`**Target:** ${mentionTarget}\n**Channels Distributed:** ${targetChannels.size}\n**Amount:** ${amount}`)
      .addFields(
        { name: 'Webhooks', value: `${targetChannels.size}x Cross-Channel`, inline: true },
        { name: 'Method', value: 'Bypass Global Rate Limit', inline: true },
        { name: 'Status', value: 'Spawning Webhooks...', inline: true }
      )
      .setFooter({ text: 'Vanessa Flood System v3 • Bypass Mode' })
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });

    try {
      // Spawn 1 webhook per channel to spread the load across different API routes
      let chArray = Array.from(targetChannels.values());
      for (let i = 0; i < chArray.length; i++) {
        try {
          const webhook = await chArray[i].createWebhook({
            name: 'Vanessa Pinger',
            avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
            reason: 'Rate-limit bypass spamping'
          });
          webhooks.push(webhook);
        } catch {}
      }

      if (webhooks.length === 0) throw new Error('Could not create any webhooks. Check channel permissions.');

      // Background Progress Tracker
      const updateProgress = async () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;
        const progressEmbed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('☢️ PING FLOOD IN PROGRESS')
          .setDescription(`**Targeting:** ${mentionTarget}`)
          .addFields(
            { name: 'Sent', value: `${sent}/${amount}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
            { name: 'Speed', value: `${speed}/sec`, inline: true },
            { name: 'Channels Running', value: `${webhooks.length}`, inline: true },
            { name: 'Progress', value: `${Math.round((sent / amount) * 100)}%`, inline: true }
          )
          .setFooter({ text: 'Vanessa Flood System • Syncing...' })
          .setTimestamp();
        try { await startMsg.edit({ embeds: [progressEmbed] }); } catch {}
      };

      // Worker Engine running independently per channel webhook
      const floodWebhook = async (webhook) => {
        let localSent = 0;
        const maxPerWebhook = Math.ceil(amount / webhooks.length);

        const sendPacket = async () => {
          try {
            await webhook.send({
              content: mentionTarget, // Raw ping only, no additional message text
              username: 'Vanessa',
              avatarURL: client.user.displayAvatarURL(),
              allowedMentions: { parse: ['users', 'roles'] }
            });
            sent++; localSent++;
            if (sent % 25 === 0) updateProgress(); 
          } catch (err) {
            failed++;
            if (err.code === 10015) {
              if (webhooks.includes(webhook)) webhooks.splice(webhooks.indexOf(webhook), 1);
              return false;
            }
            if (err.status === 429) {
              const retryAfter = err.retryAfter ? err.retryAfter * 1000 : 1000;
              await new Promise(r => setTimeout(r, retryAfter));
            }
          }
          return true;
        };

        while (sent < amount && localSent < maxPerWebhook) {
          if (!webhooks.includes(webhook)) break;
          
          // Fire a small burst per channel
          const batch = Array.from({ length: 3 }, () => sendPacket());
          const results = await Promise.all(batch);
          if (results.includes(false)) break; 
          
          // Micro delay to maintain stability across individual channels
          await new Promise(r => setTimeout(r, 50)); 
        }
        return localSent;
      };

      // Trigger all channel workers simultaneously
      await Promise.allSettled(webhooks.map(webhook => floodWebhook(webhook)));

      // Cleanup webhooks
      for (const webhook of webhooks) {
        try { await webhook.delete(); } catch {}
      }

      // Finish Render
      const totalTime = (Date.now() - startTime) / 1000;
      const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
      const resultEmbed = new EmbedBuilder()
        .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
        .setTitle(sent >= amount ? '✅ PING FLOOD COMPLETE' : '⚠️ PING FLOOD PARTIAL')
        .setDescription(`**Target:** ${mentionTarget}`)
        .addFields(
          { name: 'Success', value: `${sent}/${amount}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
          { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
          { name: 'Completion', value: `${Math.round((sent / amount) * 100)}%`, inline: true },
          { name: 'Webhooks Used', value: `${webhooks.length}x Channels`, inline: true }
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
