// commands/economy/itemslist.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const items = require('../../handlers/items');

module.exports = {
  name: 'itemslist',
  description: 'List all items with pagination.',
  category: 'economy',
  usage: '!itemslist',
  async execute(client, message, args) {
    const allItems = items.listMasterItems();
    if (!allItems.length) return message.reply('No items found.');

    const perPage = 10;
    let page = 0;
    const pages = [];
    for (let i = 0; i < allItems.length; i += perPage) {
      const chunk = allItems.slice(i, i + perPage);
      const embed = new EmbedBuilder()
        .setTitle(`Items (Page ${Math.floor(i/perPage)+1}/${Math.ceil(allItems.length/perPage)})`)
        .setColor('#1f2937')
        .setDescription(chunk.map(it => `**${it.name}** — ${it.rarity} — ${it.description}`).join('\n'));
      pages.push(embed);
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('prev').setLabel('⬅ Previous').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('next').setLabel('Next ➡').setStyle(ButtonStyle.Primary)
      );

    const msg = await message.reply({ embeds: [pages[page]], components: [row] });

    const collector = msg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', i => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Not your menu.', ephemeral: true });
      if (i.customId === 'prev') page = (page === 0 ? pages.length-1 : page-1);
      if (i.customId === 'next') page = (page === pages.length-1 ? 0 : page+1);
      i.update({ embeds: [pages[page]] });
    });

    collector.on('end', () => msg.edit({ components: [] }));
  }
};