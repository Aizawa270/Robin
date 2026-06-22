const { EmbedBuilder } = require('discord.js');

// Master Owner ID (Always has access)
const MASTER_OWNER_ID = '852839588689870879';

// Add any other user IDs here who are allowed to use the command
const ALLOWED_USERS = [
  '852839588689870879', // Yours
  // 'ANOTHER_USER_ID_HERE',
];

module.exports = {
  name: 'spamping',
  description: 'Max-speed parallel webhook flood with hardcoded permissions.',
  category: 'utility',
  hidden: true,
  usage: '$spamping [target ping] [amount] [optional text]',
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

    // Input validation
    if (args.length < 2) {
      return message.reply('Usage: `$spamping <@User/@Role> <amount> [optional text]`\nExamples:\n`$spamping @User 100`\n`$spamping @Staff 50 wake up!`');
    }

    const mentionTarget = args[0];
    // Check if the first argument is a valid user or role mention format
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
        { name: 'Method', value: 'Parallel Unthrottled Burst', inline: true },
        { name: 'Status', value: 'Spawning Webhooks...', inline: true }
      )
      .setFooter({ text: 'Vanessa Flood System v3' })
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });

    try {
      // Setup webhooks
      for (let i = 0; i < 5; i++) {
        try {
          const webhook = await targetChannel.createWebhook({
            name: 'Vanessa Pinger',
            avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
            reason: 'Max-speed spamping command'
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

      // Worker Engine
      const floodWebhook = async (webhook) => {
        let localSent = 0;
        const maxPerWebhook = Math.ceil(amount / webhooks.length);

        const sendPacket = async () => {
          try {
            await webhook.send({
              content: fullPayload,
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
              const retryAfter = err.retryAfter ? err.retryAfter * 1000 : 500;
              await new Promise(r => setTimeout(r, retryAfter));
            }
          }
          return true;
        };

        while (sent < amount && localSent < maxPerWebhook) {
          if (!webhooks.includes(webhook)) break;
          const batch = Array.from({ length: 5 }, () => sendPacket());
          const results = await Promise.all(batch);
          if (results.includes(false)) break; 
        }
        return localSent;
      };

      // Trigger parallel workers
      await Promise.allSettled(webhooks.map(webhook => floodWebhook(webhook)));

      // Cleanup
      for (const webhook of webhooks) {
        try { await webhook.delete(); } catch {}
      }

      // Finish Render
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
