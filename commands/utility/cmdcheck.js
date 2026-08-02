// commands/utility/cmdcheck.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'cmdcheck',
  description: 'Displays command loader diagnostics.',
  category: 'utility',
  usage: '$cmdcheck',
  aliases: ['cc'],

  async execute(client, message) {

    const broken = client.brokenCommands || [];
    const totalCommands = client.commands?.size || 0;
    const totalAliases = client.aliases?.size || 0;

    // ==========================
    // EVERYTHING OK
    // ==========================

    if (!broken.length) {
      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('✅ Command Diagnostics')
        .addFields(
          {
            name: 'Loaded Commands',
            value: `\`${totalCommands}\``,
            inline: true
          },
          {
            name: 'Loaded Aliases',
            value: `\`${totalAliases}\``,
            inline: true
          },
          {
            name: 'Broken Files',
            value: '`0`',
            inline: true
          },
          {
            name: 'Status',
            value:
              'All command files loaded successfully.\nNo loader errors were detected.',
            inline: false
          }
        )
        .setFooter({
          text: 'This only checks command loading, not runtime errors.'
        })
        .setTimestamp();

      return message.reply({
        embeds: [embed]
      });
    }

    // ==========================
    // BROKEN FILES
    // ==========================

    const embed = new EmbedBuilder()
      .setColor('#ef4444')
      .setTitle('❌ Command Diagnostics')
      .setDescription(
        `Detected **${broken.length}** broken command file(s).`
      )
      .addFields(
        {
          name: 'Loaded Commands',
          value: `\`${totalCommands}\``,
          inline: true
        },
        {
          name: 'Loaded Aliases',
          value: `\`${totalAliases}\``,
          inline: true
        },
        {
          name: 'Broken Files',
          value: `\`${broken.length}\``,
          inline: true
        }
      );

    const limit = 8;

    for (const b of broken.slice(0, limit)) {

      const file =
        b.file
          ?.replace(process.cwd(), '')
          .replace(/\\/g, '/');

      const error =
        String(
          b.error?.stack ||
          b.error?.message ||
          b.error
        )
          .replace(/`/g, "'")
          .substring(0, 900);

      embed.addFields({
        name: `📄 ${file}`,
        value: `\`\`\`\n${error}\n\`\`\``,
        inline: false
      });
    }

    if (broken.length > limit) {
      embed.addFields({
        name: 'More Files',
        value: `...and **${broken.length - limit}** more.`,
        inline: false
      });
    }

    embed.setFooter({
      text: 'These files failed while loading. Runtime errors are not shown here.'
    });

    embed.setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }
};