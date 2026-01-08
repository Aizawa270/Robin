const { EmbedBuilder } = require('discord.js');

const OWNER_IDS = [
  '852839588689870879',
  '908521674700390430',
  '821734525247815741'
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
  usage: '$flood [channel/user] <amount> <text>',

  async execute(client, message, args) {

    const isOwner = OWNER_IDS.includes(message.author.id);
    const hasRole = message.member?.roles.cache.some(r =>
      ALLOWED_ROLES.includes(r.id)
    );

    if (!isOwner && !hasRole) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f472b6')
            .setDescription("You're not that guy 😹😹")
        ]
      });
    }

    if (args.length < 2)
      return message.reply(
        'Usage: `$flood [channel/user] <amount> <text>`\n' +
        'Examples:\n' +
        '`$flood #general 100 hello`\n' +
        '`$flood @User 50 test`\n' +
        '`$flood 100 spam`'
      );

    let targetChannel = message.channel;
    let targetUser = null;
    let targetDM = false;
    let amountIndex = 0;

    if (args[0]) {
      const channelMatch = args[0].match(/<#(\d+)>/);
      if (channelMatch) {
        const channelId = channelMatch[1];
        try {
          const channel = await message.guild.channels.fetch(channelId);
          if (channel && channel.isTextBased()) {
            targetChannel = channel;
            amountIndex = 1;
          } else {
            return message.reply('Invalid channel.');
          }
        } catch {
          return message.reply('Channel not found.');
        }
      } else if (args[0].match(/<@!?(\d+)>/)) {
        const userId = args[0].replace(/[<@!>]/g, '');
        try {
          targetUser = await client.users.fetch(userId);
          targetDM = true;
          amountIndex = 1;
        } catch {
          return message.reply('User not found.');
        }
      }
    }

    const amount = parseInt(args[amountIndex]);
    if (isNaN(amount) || amount < 1 || amount > 5000) {
      return message.reply('Amount must be 1–5000.');
    }

    const text = args.slice(amountIndex + 1).join(' ');
    if (!text) return message.reply('Need text.');

    const startEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('☢️ NUCLEAR FLOOD ACTIVATED')
      .setDescription(`**Amount:** ${amount}\n**Text:** "${text}"`)
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });
    const startTime = Date.now();

    try {
      if (targetDM) {
        let sent = 0;

        for (let i = 0; i < amount; i++) {
          try {
            await targetUser.send(text);
            sent++;
          } catch {
            break;
          }
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

        await startMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('✅ DM FLOOD COMPLETE')
              .setDescription(`Sent: ${sent}/${amount}\nTime: ${totalTime}s`)
              .setTimestamp()
          ]
        });

      } else {
        const webhooks = [];

        for (let i = 0; i < 5; i++) {
          try {
            const webhook = await targetChannel.createWebhook({
              name: 'Vanessa'
            });
            webhooks.push(webhook);
          } catch {}
        }

        let sent = 0;

        const floodWebhook = async (webhook) => {
          while (sent < amount) {
            try {
              await webhook.send(text);
              sent++;
            } catch {
              break;
            }
          }
        };

        await Promise.all(webhooks.map(w => floodWebhook(w)));

        for (const w of webhooks) {
          try { await w.delete(); } catch {}
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

        await startMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('✅ FLOOD COMPLETE')
              .setDescription(`Sent: ${sent}/${amount}\nTime: ${totalTime}s`)
              .setTimestamp()
          ]
        });
      }

    } catch (err) {
      console.error(err);
      await startMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('FLOOD FAILED')
            .setDescription(err.message)
        ]
      });
    }
  },
};