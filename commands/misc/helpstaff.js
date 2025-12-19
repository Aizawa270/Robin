const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { colors, prefix } = require('../../config');

module.exports = {
  name: 'helpstaff',
  description: 'Shows all mod commands (for mods only).',
  category: 'utility',
  usage: '$helpstaff',
  aliases: ['hstaff'],
  async execute(client, message, args) {
    if (!message.guild) return;

    // Only mods
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You must be a mod to use this command.');
    }

    const modCommandsPath = path.join(__dirname, '..', 'mod');
    if (!fs.existsSync(modCommandsPath)) return message.reply('No mod commands folder found.');

    const files = fs.readdirSync(modCommandsPath).filter(f => f.endsWith('.js'));
    if (!files.length) return message.reply('No mod commands found.');

    const modCommands = files.map(f => {
      const cmd = require(path.join(modCommandsPath, f));
      return cmd.hidden ? null : cmd;
    }).filter(Boolean);

    if (!modCommands.length) return message.reply('No mod commands to display.');

    // Pagination setup
    const pages = [];
    for (let i = 0; i < modCommands.length; i += 10) {
      const chunk = modCommands.slice(i, i + 10);
      const embed = new EmbedBuilder()
        .setTitle(`Mod Commands`)
        .setColor(colors.help || '#22c55e')
        .setDescription(`Prefix: \`${prefix}\``)
        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
        .setFooter({ text: `Page ${pages.length + 1}` });

      chunk.forEach(cmd => {
        const usage = cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases = cmd.aliases && cmd.aliases.length ? `\nAliases: ${cmd.aliases.join(', ')}` : '';
        embed.addFields({ name: `\`${cmd.name}\``, value: `${cmd.description}${aliases}${usage}`, inline: false });
      });

      pages.push(embed);
    }

    // Buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('⬅️ Previous').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('next').setLabel('➡️ Next').setStyle(ButtonStyle.Primary)
    );

    let current = 0;
    const helpMsg = await message.reply({ embeds: [pages[current]], components: [row] });

    const collector = helpMsg.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async interaction => {
      if (!interaction.isButton()) return;
      if (interaction.customId === 'prev') current = current > 0 ? current - 1 : pages.length - 1;
      else if (interaction.customId === 'next') current = current < pages.length - 1 ? current + 1 : 0;
      await interaction.update({ embeds: [pages[current]], components: [row] });
    });

    collector.on('end', async () => {
      try { await helpMsg.edit({ components: [] }); } catch {}
    });
  },
};