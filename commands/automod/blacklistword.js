const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const COLOR = '#5865F2';

function makeEmbed(title, description, color = COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: 'Automod • Hard blacklist',
    })
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  name: 'blacklistword',
  aliases: ['bwl'],
  description: 'Add, remove, or list hard blacklist words.',
  category: 'automod',
  hidden: true,
  usage: '$blacklistword add|remove|list <word>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member?.permissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply(
        'You need the **Administrator** permission to manage the hard blacklist.'
      );
    }

    if (!client.automod) {
      return message.reply(
        'Automod is not initialized. Please restart the bot.'
      );
    }

    const sub = String(args.shift() || '').toLowerCase();

    const prefix = client.getPrefix
      ? client.getPrefix(message.guild.id)
      : '$';

    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Hard blacklist usage',
            [
              `\`${prefix}blacklistword add <word>\``,
              `\`${prefix}blacklistword remove <word>\``,
              `\`${prefix}blacklistword list\``,
            ].join('\n')
          ),
        ],
      });
    }

    try {
      if (sub === 'list') {
        const words = client.automod.listHardWords(
          message.guild.id
        );

        if (!words.length) {
          return message.reply({
            embeds: [
              makeEmbed(
                'Hard blacklist',
                'No hard blacklist entries are configured.'
              ),
            ],
          });
        }

        const content = words
          .join('\n')
          .replace(/```/g, "'''")
          .slice(0, 3500);

        return message.reply({
          embeds: [
            makeEmbed(
              `Hard blacklist · ${words.length}`,
              [
                'Messages containing these words are deleted and may result in a 15-minute timeout.',
                '',
                `\`\`\`\n${content}\n\`\`\``,
              ].join('\n')
            ),
          ],
        });
      }

      const word = args.join(' ').trim();

      if (!word) {
        return message.reply(
          `Provide a word. Example: \`${prefix}blacklistword ${sub} example\``
        );
      }

      if (sub === 'add') {
        const success = client.automod.addHardWord(
          message.guild.id,
          word
        );

        if (!success) {
          return message.reply(
            'The word could not be saved.'
          );
        }

        return message.reply({
          embeds: [
            makeEmbed(
              'Hard blacklist updated',
              [
                `**Entry:** \`${word.slice(0, 200)}\``,
                '**Action:** Message deletion',
                '**Penalty:** 15-minute timeout when possible',
                '',
                'This word is now monitored by automod.',
              ].join('\n'),
              '#3BA55D'
            ),
          ],
        });
      }

      const success = client.automod.removeHardWord(
        message.guild.id,
        word
      );

      if (!success) {
        return message.reply(
          'The word could not be removed.'
        );
      }

      return message.reply({
        embeds: [
          makeEmbed(
            'Hard blacklist updated',
            [
              `**Entry:** \`${word.slice(0, 200)}\``,
              '**Status:** Removed',
              '',
              'This word will no longer trigger the hard blacklist.',
            ].join('\n'),
            '#ED4245'
          ),
        ],
      });

    } catch (error) {
      console.error('[Hard Blacklist] Command error:', error);

      return message.reply(
        'Something went wrong while updating the hard blacklist.'
      );
    }
  },
};