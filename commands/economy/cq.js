'use strict';

const { EmbedBuilder } = require('discord.js');

const clan = require('../../handlers/clanService');
const economy = require('../../handlers/economy');
const CFG = require('../../handlers/clanConfig');

const COLOR = CFG.COLOR || '#5b0000';

const ICON = key => String(CFG.ICONS?.[key] || '').trim();

function money(amount) {
  return economy.formatCurrency(Number(amount || 0));
}

function progressBar(percent, size = 12) {
  const value = Math.max(
    0,
    Math.min(100, Number(percent) || 0)
  );

  const filled = Math.round(value / 100 * size);

  return (
    '█'.repeat(filled) +
    '░'.repeat(size - filled)
  );
}

function createEmbed(message, title, description) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description || '\u200b')
    .setTimestamp();

  const guildIcon = message.guild?.iconURL({
    size: 256,
  });

  if (guildIcon) {
    embed.setThumbnail(guildIcon);
  }

  const footer = {
    text: `${message.guild?.name || 'Vanessa'} • Requested by ${message.author.username}`,
  };

  const avatar = message.author.displayAvatarURL?.();

  if (avatar) {
    footer.iconURL = avatar;
  }

  embed.setFooter(footer);

  return embed;
}

function errorMessage(error) {
  if (
    error?.name === 'ClanError' ||
    error instanceof clan.ClanError
  ) {
    return error.message;
  }

  return 'The clan quest board could not be loaded. Please try again later.';
}

module.exports = {
  name: 'cq',

  aliases: [
    'clanquest',
  ],

  description: 'View your clan daily quests.',

  category: 'economy',

  usage: '$cq',

  async execute(client, message) {
    if (!message.guild) {
      return message.reply(
        'This command can only be used inside a server.'
      );
    }

    try {
      // ================================================
      // GET QUEST BOARD
      // ================================================

      const board = clan.getQuestBoard(
        message.guild.id,
        message.author.id
      );

      if (!board || !board.clan) {
        throw new Error(
          'Clan quest service returned an invalid board.'
        );
      }

      // ================================================
      // BUILD QUESTS
      // ================================================

      const quests = Array.isArray(board.quests)
        ? board.quests
        : [];

      if (!quests.length) {
        throw new Error(
          'The clan quest board contains no quests.'
        );
      }

      const lines = quests.map((quest, index) => {
        const target = Number(quest.target || 0);

        const progress = Math.max(
          0,
          Number(quest.progress || 0)
        );

        const percent = target > 0
          ? Math.min(
              100,
              Math.floor(progress / target * 100)
            )
          : 0;

        const completed = Boolean(quest.done);

        const mark = completed ? '✅' : '◆';

        const label = clan.questText(quest);

        return [
          `${mark} **${index + 1}. ${label}**`,
          `\`${progress.toLocaleString('en-US')} / ${target.toLocaleString('en-US')}\``,
          `└ ${quest.tier} • ${money(quest.reward_coins)} • ${Number(quest.reward_xp || 0).toLocaleString('en-US')} XP`,
          `${progressBar(percent, 12)} **${percent}%**`,
        ].join('\n');
      });

      // ================================================
      // BUILD EMBED
      // ================================================

      const description = [
        'Complete daily quests together with your clan!',
        '',
        lines.join('\n\n'),
        '',
        `${ICON('trophy')} **Daily Completion Bonus**`,
        `Complete all ${CFG.QUEST_COUNT} quests for **${Number(board.bonusXp || 0).toLocaleString('en-US')} bonus XP!**`,
        board.bonusClaimed
          ? '✅ Your clan has already claimed today\'s bonus.'
          : '',
        board.boost
          ? `\n✨ Active Clan XP Booster: **+${Math.round(board.boost * 100)}%**`
          : '',
      ].filter(Boolean).join('\n');

      const embed = createEmbed(
        message,
        `${ICON('quest')} ${board.clan.name} — Daily Quests`,
        description
      );

      // ================================================
      // SEND RESULT
      // ================================================

      return message.reply({
        embeds: [embed],
        allowedMentions: {
          repliedUser: false,
        },
      });

    } catch (error) {
      console.error(
        '[Clan Quest] $cq command failed:',
        error
      );

      return message.reply({
        embeds: [
          createEmbed(
            message,
            'Clan Quest System',
            errorMessage(error)
          ),
        ],
        allowedMentions: {
          repliedUser: false,
        },
      }).catch(() => null);
    }
  },
};