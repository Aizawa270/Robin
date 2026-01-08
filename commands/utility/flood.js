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
  name: 'flood',
  description: 'Fast webhook flood with Vanessa webhooks.',
  category: 'utility',
  hidden: true,
  usage: '$flood [channel/user]',
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

    if (args.length < 2) return message.reply('Usage: `$flood [channel/user] <amount> <text>`\nExamples:\n`$flood #general 100 hello`\n`$flood @User 50 test`\n`$flood 100 spam` (current channel)');

    let targetChannel = message.channel;
    let targetUser = null;
    let targetDM = false;
    let amountIndex = 0;

    // Check if first arg is a channel mention or user mention
    if (args[0]) {
      // Channel
      const channelMatch = args[0].match(/<#(\d+)>/);
      if (channelMatch) {
        const channelId = channelMatch[1];
        try {
          const channel = await message.guild.channels.fetch(channelId);
          if (channel && channel.isTextBased()) {
            targetChannel = channel;
            amountIndex = 1;
          } else return message.reply('Invalid channel or channel is not text-based.');
        } catch { return message.reply('Could not find that channel.'); }
      }
      // User
      else if (args[0].match(/<@!?(\d+)>/)) {
        const userId = args[0].replace(/[<@!>]/g, '');
        try {
          targetUser = await client.users.fetch(userId);
          targetDM = true;
          amountIndex = 1;
        } catch { return message.reply('Could not find that user.'); }
      }
      // User by ID
      else if (/^\d+$/.test(args[0])) {
        try {
          targetUser = await client.users.fetch(args[0]);
          targetDM = true;
          amountIndex = 1;
        } catch {}
      }
    }

    // Amount & Text
    const amount = parseInt(args[amountIndex]);
    if (isNaN(amount) || amount < 1 || amount > 5000) return message.reply('Amount must be 1-5000.');
    const textArgs = args.slice(amountIndex + 1);
    const text = textArgs.join(' ');
    if (!text) return message.reply('Need text to send.');

    // Start flood embed
    let targetDescription = targetDM ? `**Target:** ${targetUser.tag} (DM)` : `**Target:** ${targetChannel}`;
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
      if (targetDM) {
        let sent = 0, failed = 0;
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
          try { await startMsg.edit({ embeds: [progressEmbed] }); } catch {}
        };

        for (let i = 0; i < amount; i++) {
          try {
            await targetUser.send(text);
            sent++;
            if (sent % 25 === 0) await updateProgress();
            if (sent % 5 === 0) await new Promise(r => setTimeout(r, 100));
          } catch (error) {
            failed++;
            if (error.code === 50007 || error.message.includes('Cannot send messages to this user')) break;
            if (error.code === 40001 || error.code === 40002) await new Promise(r => setTimeout(r, 1000));
          }
        }

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
      } else {
        // CHANNEL FLOOD (original webhook method)
        const webhooks = [];
        let sent = 0, failed = 0;

        for (let i = 0; i < 5; i++) {
          try {
            const webhook = await targetChannel.createWebhook({
              name: 'Vanessa',
              avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
              reason: 'Flood command'
            });
            webhooks.push(webhook);
          } catch {}
        }

        if (webhooks.length === 0) throw new Error('Could not create any webhooks');

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
          try { await startMsg.edit({ embeds: [progressEmbed] }); } catch {}
        };

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
              sent++; localSent++;
              if (sent % 25 === 0) await updateProgress();
              if (sent % 5 === 0) await new Promise(r => setTimeout(r, 20));
            } catch (err) { failed++; if (err.code === 10015 || err.code === 429) { webhooks.splice(webhooks.indexOf(webhook), 1); break; } await new Promise(r => setTimeout(r, 100)); }
          }
          return localSent;
        };

        await Promise.allSettled(webhooks.map(floodWebhook));

        for (const webhook of webhooks) try { await webhook.delete(); } catch {}

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
      }
    } catch (error) {
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