const { EmbedBuilder } = require('discord.js');

const OWNER_ID = '852839588689870879';
const MAX_FLOOD = 100;
const DELAY = 900; // ms – fast but safe

module.exports = {
  name: 'flood',
  description: 'Floods a channel or a user’s DMs (owner only).',
  category: 'utility',
  hidden: true, // 🚫 NOT shown in help
  usage: '$flood [@user|id] <amount> <text>',
  async execute(client, message, args) {

    // 🔒 Owner lock
    if (message.author.id !== OWNER_ID) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f472b6')
            .setDescription("You're not that guy 😹😹")
        ]
      });
    }

    if (!args.length) return message.reply('Give me something to work with.');

    let target = message.channel;
    let amount;
    let text;

    // If first arg is user mention or ID → DM flood
    const user =
      message.mentions.users.first() ||
      (args[0]?.match(/^\d{17,20}$/)
        ? await client.users.fetch(args[0]).catch(() => null)
        : null);

    if (user) {
      target = await user.createDM();
      args.shift();
    }

    amount = parseInt(args.shift());
    if (isNaN(amount) || amount < 1) {
      return message.reply('Amount must be a number.');
    }

    if (amount > MAX_FLOOD) amount = MAX_FLOOD;

    text = args.join(' ');
    if (!text) return message.reply('What am I supposed to send?');

    // 🚀 Flood loop (rate‑limit safe)
    for (let i = 0; i < amount; i++) {
      try {
        await target.send(text);
        await new Promise(res => setTimeout(res, DELAY));
      } catch (err) {
        console.error('Flood error:', err);
        break;
      }
    }
  },
};