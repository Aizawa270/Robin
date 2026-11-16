const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const COLOR = '#5865F2';

function makeEmbed(title, description, color = COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: 'Automod • Soft blacklist',
    })
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  name: 'blacklistwordsoft',
  aliases: ['bwsoft'],
  description: 'Add, remove, or list soft blacklist words.',
  category: 'automod',
  hidden: true,
  usage: '$blacklistwordsoft add|remove|list <word>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member?.permissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply(
        'You need the **Administrator** permission to manage the soft blacklist.'
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
            'Soft blacklist usage',
            [
              `\`${prefix}blacklistwordsoft add <word>\``,
              `\`${prefix}blacklistwordsoft remove <word>\``,
              `\`${prefix}blacklistwordsoft list\``,
            ].join('\n')
          ),
        ],
      });
    }

    try {
      if (sub === 'list') {
        const words = client.automod.listSoftWords(
          message.guild.id
        );

        if (!words.length) {
          return message.reply({
            embeds: [
              makeEmbed(
                'Soft blacklist',
                'No soft blacklist entries are configured.'
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
              `Soft blacklist · ${words.length}`,
              [
                'Messages containing these words are silently deleted without a timeout or staff alert.',
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
          `Provide a word. Example: \`${prefix}blacklistwordsoft ${sub} example\``
        );
      }

      if (sub === 'add') {
        const success = client.automod.addSoftWord(
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
              'Soft blacklist updated',
              [
                `**Entry:** \`${word.slice(0, 200)}\``,
                '**Action:** Silent message deletion',
                '**Timeout:** None',
                '**Staff alert:** None',
                '',
                'This word is now monitored by automod.',
              ].join('\n'),
              '#3BA55D'
            ),
          ],
        });
      }

      const success = client.automod.removeSoftWord(
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
            'Soft blacklist updated',
            [
              `**Entry:** \`${word.slice(0, 200)}\``,
              '**Status:** Removed',
              '',
              'This word will no longer trigger the soft blacklist.',
            ].join('\n'),
            '#ED4245'
          ),
        ],
      });

    } catch (error) {
      console.error('[Soft Blacklist] Command error:', error);

      return message.reply(
        'Something went wrong while updating the soft blacklist.'
      );
    }
  },
};