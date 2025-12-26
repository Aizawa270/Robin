const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fetch = require('node-fetch');

// Expanded categories
const CATEGORIES = [
  'hentai', 'yuri', 'ecchi', 'blowjob', 'futanari', 'lesbian', 'gay', 'maid',
  'tentacle', 'milf', 'anal', 'foot', 'ahegao', 'netorare', 'creampie', 'glasses',
  'threesome', 'incest', 'bondage', 'cuckold', 'oral', 'paizuri', 'yaoi', 'yaoianal',
  'harem', 'school', 'swimsuit', 'idol', 'cosplay', 'cheating', 'futa', 'futaanal',
  'pregnant', 'licking', 'rape', 'fingering', 'ecchikemono', 'trap', 'shotacon', 'shota'
];

module.exports = {
  name: 'hentai',
  description: 'Sends hentai images or videos. Admins only.',
  category: 'mod',
  usage: '!hentai [amount] [category]',
  aliases: [],
  async execute(client, message, args) {
    // Admin-only: no reply for non-admins
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    let amount = 1;
    let category;

    // Parse amount and category
    if (args[0]) {
      if (!isNaN(args[0])) {
        amount = Math.min(Math.max(parseInt(args[0], 10), 1), 5); // Limit 1-5
        category = args[1]?.toLowerCase();
      } else {
        category = args[0]?.toLowerCase();
      }
    }

    // Validate category
    if (category && !CATEGORIES.includes(category)) {
      category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    } else if (!category) {
      category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    }

    try {
      for (let i = 0; i < amount; i++) {
        const url = `https://nekobot.xyz/api/image?type=${category}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data || !data.message) continue;

        const embed = new EmbedBuilder()
          .setColor('#ff0055')
          .setTitle(`Category: ${category}`)
          .setFooter({ text: `Requested by ${message.author.tag}` });

        // Check if URL is video or image
        if (data.message.endsWith('.mp4') || data.message.endsWith('.webm')) {
          embed.setDescription(`[Click here if video doesn't autoplay](${data.message})`);
        } else {
          embed.setImage(data.message);
        }

        await message.channel.send({ content: data.message.endsWith('.mp4') || data.message.endsWith('.webm') ? data.message : null, embeds: [embed] });
      }
    } catch (err) {
      console.error('Hentai command error:', err);
      return;
    }
  },
};