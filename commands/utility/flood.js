const { EmbedBuilder } = require('discord.js');

const ALLOWED_USER_IDS = [
  '852839588689870879',
  '821734525247815741',
];

const ALLOWED_ROLE_IDS = [
  '1447894643277561856',
  '1431646610752012420',
];

module.exports = {
  name: 'flood',
  description: 'Send multiple messages via webhook or DM (restricted)',
  category: 'utility',
  hidden: true,
  usage: '$flood [channel/user] <amount> <text>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const isAllowedUser = ALLOWED_USER_IDS.includes(message.author.id);
    const hasAllowedRole = message.member.roles.cache.some(r =>
      ALLOWED_ROLE_IDS.includes(r.id)
    );

    if (!isAllowedUser && !hasAllowedRole) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f472b6')
            .setDescription('You are not allowed to use this command.'),
        ],
      });
    }

    if (args.length < 2) {
      return message.reply(
        'Usage: `$flood [channel/user] <amount> <text>`\n' +
        'Examples:\n' +
        '`$flood #general 20 hello`\n' +
        '`$flood @User 10 test`\n' +
        '`$flood 15 spam`'
      );
    }

    let targetChannel = message.channel;
    let targetUser = null;
    let targetDM = false;
    let amountIndex = 0;

    if (args[0]) {
      const channelMatch = args[0].match(/<#(\d+)>/);
      if (channelMatch) {
        const channel = await message.guild.channels.fetch(channelMatch[1]).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          return message.reply('Invalid channel.');
        }
        targetChannel = channel;
        amountIndex = 1;
      } else if (args[0].match(/<@!?(\d+)>/)) {
        const userId = args[0].replace(/[<@!>]/g, '');
        targetUser = await client.users.fetch(userId).catch(() => null);
        if (!targetUser) return message.reply('Invalid user.');
        targetDM = true;
        amountIndex = 1;
      }
    }

    const amount = parseInt(args[amountIndex]);
    if (isNaN(amount) || amount < 1 || amount > 40) {
      return message.reply('Amount must be between 1 and 40.');
    }

    const text = args.slice(amountIndex + 1).join(' ');
    if (!text) return message.reply('Provide text to send.');

    const startEmbed = new EmbedBuilder()
      .setColor('#ef4444')
      .setTitle('Flood Started')
      .setDescription(
        targetDM
          ? `Target: ${targetUser.tag} (DM)\nAmount: ${amount}`
          : `Target: ${targetChannel}\nAmount: ${amount}`
      )
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });
    const startTime = Date.now();

    try {
      if (targetDM) {
        let sent = 0;
        let failed = 0;

        for (let i = 0; i < amount; i++) {
          try {
            await targetUser.send(text);
            sent++;
            await new Promise(r => setTimeout(r, 150));
          } catch {
            failed++;
            break;
          }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        const resultEmbed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('Flood Finished')
          .addFields(
            { name: 'Sent', value: `${sent}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Time', value: `${duration}s`, inline: true }
          )
          .setTimestamp();

        return startMsg.edit({ embeds: [resultEmbed] });
      }

      // CHANNEL FLOOD
      const webhooks = [];
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < 3; i++) {
        const hook = await targetChannel.createWebhook({
          name: 'Vanessa',
          reason: 'Flood command',
        }).catch(() => null);
        if (hook) webhooks.push(hook);
      }

      if (!webhooks.length) throw new Error('Failed to create webhooks.');

      const floodWebhook = async webhook => {
        while (sent < amount) {
          try {
            await webhook.send({ content: text });
            sent++;
            await new Promise(r => setTimeout(r, 100));
          } catch {
            failed++;
            break;
          }
        }
      };

      await Promise.allSettled(webhooks.map(floodWebhook));

      for (const hook of webhooks) {
        await hook.delete().catch(() => {});
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const resultEmbed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Flood Finished')
        .addFields(
          { name: 'Sent', value: `${sent}`, inline: true },
          { name: 'Failed', value: `${failed}`, inline: true },
          { name: 'Time', value: `${duration}s`, inline: true }
        )
        .setTimestamp();

      await startMsg.edit({ embeds: [resultEmbed] });

    } catch (err) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#dc2626')
        .setTitle('Flood Failed')
        .setDescription(err.message)
        .setTimestamp();

      await startMsg.edit({ embeds: [errorEmbed] });
    }
  },
};