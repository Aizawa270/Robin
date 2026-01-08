const { EmbedBuilder, PermissionFlagsBits, WebhookClient } = require('discord.js');

module.exports = {
  name: 'flood',
  description: 'Floods the channel using 5 webhooks and shows execution time.',
  category: 'mod',
  usage: '!flood <amount> <delay(ms)> <message>',

  async execute(client, message, args) {
    if (!message.guild) return;

    // ---- ACCESS CONTROL ----
    const allowedUserIds = [
      '852839588689870879',
      '821734525247815741',
    ];

    const allowedRoleIds = [
      '1447894643277561856',
      '1431646610752012420',
    ];

    const hasAllowedRole = message.member.roles.cache.some(r =>
      allowedRoleIds.includes(r.id)
    );

    if (!allowedUserIds.includes(message.author.id) && !hasAllowedRole) {
      return message.reply('❌ You are not allowed to use this.');
    }

    // ---- ARGS ----
    const amount = parseInt(args[0]);
    const delay = parseInt(args[1]);
    const text = args.slice(2).join(' ');

    if (!amount || !delay || !text) {
      return message.reply(
        'Usage: `!flood <amount> <delay(ms)> <message>`\nExample: `!flood 40 200 hello`'
      );
    }

    if (amount > 300) {
      return message.reply('❌ Max limit is 300 messages.');
    }

    // ---- FETCH / CREATE 5 WEBHOOKS ----
    let webhooks = await message.channel.fetchWebhooks();
    webhooks = webhooks.filter(w => w.owner?.id === client.user.id);

    while (webhooks.size < 5) {
      const wh = await message.channel.createWebhook({
        name: `Flood-${webhooks.size + 1}`,
      });
      webhooks.set(wh.id, wh);
    }

    const webhookClients = [...webhooks.values()]
      .slice(0, 5)
      .map(w => new WebhookClient({ id: w.id, token: w.token }));

    // ---- START TIMER ----
    const startTime = Date.now();

    let index = 0;

    for (let i = 0; i < amount; i++) {
      const webhook = webhookClients[index];

      await webhook.send({
        content: text,
      }).catch(() => {});

      index = (index + 1) % 5;
      await new Promise(r => setTimeout(r, delay));
    }

    // ---- END TIMER ----
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('Flood Finished')
      .addFields(
        { name: 'Messages Sent', value: `${amount}`, inline: true },
        { name: 'Webhooks Used', value: '5', inline: true },
        { name: 'Time Taken', value: `${duration}s`, inline: false },
      )
      .setFooter({ text: 'Execution completed successfully' })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  },
};