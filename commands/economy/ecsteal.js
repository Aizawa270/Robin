const { EmbedBuilder } = require('discord.js');
const {
  resolveTargetUser,
} = require('../../handlers/economyHelpers');
const {
  formatNumber,
  formatDuration,
  useCooldown,
  setStealImmunity,
  getStealImmunityRemaining,
} = require('../../handlers/gamblingHelpers');

const STEAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const IMMUNITY_MS = 24 * 60 * 60 * 1000;

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  return embed;
}

function pickPercent(min, max) {
  return min + Math.random() * (max - min);
}

module.exports = {
  name: 'ecsteal',
  aliases: ['steal'],
  description: 'Attempt to steal Crowns from another user.',
  category: 'economy',
  usage: '$ecsteal <@user|id|username>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Economy Unavailable',
            description: 'The economy system is not ready.',
          }),
        ],
      });
    }

    const targetInput = args[0];
    if (!targetInput) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: 'Use: `$ecsteal <@user|id|username>`',
          }),
        ],
      });
    }

    const target =
      message.mentions.users.first() ||
      (await resolveTargetUser(client, message, targetInput));

    if (!target) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: 'User not found.',
          }),
        ],
      });
    }

    if (target.bot || target.id === message.author.id) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: 'You cannot steal from that user.',
          }),
        ],
      });
    }

    const thiefBalance = client.economy.getBalance(message.guild.id, message.author.id);
    const targetBalance = client.economy.getBalance(message.guild.id, target.id);

    if (thiefBalance <= 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: 'You have no Crowns.',
          }),
        ],
      });
    }

    if (targetBalance < 10_000) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: 'That user does not have enough Crowns to steal from.',
          }),
        ],
      });
    }

    const immunityRemaining = getStealImmunityRemaining(message.guild.id, target.id);
    if (immunityRemaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: `That user is protected for **${formatDuration(immunityRemaining)}**.`,
          }),
        ],
      });
    }

    const remaining = useCooldown(message.guild.id, message.author.id, 'ecsteal', STEAL_COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: `You are on cooldown for **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    const success = Math.random() < 0.30;
    const targetMember =
      message.guild.members.cache.get(target.id) ||
      await message.guild.members.fetch(target.id).catch(() => null);

    const displayName = targetMember?.displayName || target.username;

    if (success) {
      const stealPct = pickPercent(0.15, 0.25);
      const amount = Math.max(1, Math.floor(targetBalance * stealPct));

      const removed = client.economy.removeCrowns(message.guild.id, target.id, amount, {
        type: 'ecsteal_loss',
        reason: `Stolen by ${message.author.tag}`,
        actorId: message.author.id,
      });

      if (!removed) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Steal',
              description: 'The steal failed because the target balance changed.',
            }),
          ],
        });
      }

      client.economy.addCrowns(message.guild.id, message.author.id, amount, {
        type: 'ecsteal_gain',
        reason: `Stolen from ${displayName}`,
        actorId: message.author.id,
      });

      setStealImmunity(message.guild.id, target.id, IMMUNITY_MS);

      const newThiefBalance = client.economy.getBalance(message.guild.id, message.author.id);
      const newTargetBalance = client.economy.getBalance(message.guild.id, target.id);

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description:
              `Success\n↳ You stole **${money(client, amount)}** from **${displayName}**.\n\n` +
              `Your Balance\n↳ ${money(client, newThiefBalance)}\n\n` +
              `Their Balance\n↳ ${money(client, newTargetBalance)}`,
            thumbnail: target.displayAvatarURL({ size: 256 }),
          }),
        ],
      });
    }

    const lossPct = pickPercent(0.15, 0.25);
    const amount = Math.max(1, Math.floor(thiefBalance * lossPct));

    const removed = client.economy.removeCrowns(message.guild.id, message.author.id, amount, {
      type: 'ecsteal_fail',
      reason: `Failed steal against ${displayName}`,
      actorId: message.author.id,
    });

    if (!removed) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Steal',
            description: 'The fail penalty could not be applied.',
          }),
        ],
      });
    }

    setStealImmunity(message.guild.id, target.id, IMMUNITY_MS);

    const newThiefBalance = client.economy.getBalance(message.guild.id, message.author.id);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Steal',
          description:
            `Failed\n↳ You lost **${money(client, amount)}**.\n\n` +
            `Your Balance\n↳ ${money(client, newThiefBalance)}`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  },
};