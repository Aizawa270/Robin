const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');

const {
  canManageEconomy,
  resolveTargetUser,
} = require('../../handlers/economyHelpers');

const CONFIRM_TIMEOUT_MS = 60_000;

function formatNumber(number) {
  return Number(number || 0).toLocaleString('en-US');
}

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${formatNumber(amount)} Crowns`;
}

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

    if (data.thumbnail) {
      embed.setThumbnail(data.thumbnail);
    }

    if (data.footer) {
      if (typeof data.footer === 'string') {
        embed.setFooter({ text: data.footer });
      } else {
        embed.setFooter(data.footer);
      }
    }

    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor('#FF69B4')
    .setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({ text: data.footer });
    } else {
      embed.setFooter(data.footer);
    }
  }

  return embed;
}

function createConfirmationButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ecreset_confirm')
      .setLabel('Confirm Reset')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId('ecreset_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

/**
 * Resets one user's economy account.
 *
 * Resets:
 * - Balance
 * - Lifetime earned, spent, and tax paid
 * - Reward cooldown timestamp
 * - Job assignment and work progress
 * - Work-related cooldowns and counters
 * - Active boost
 *
 * Preserves transaction and tax history.
 * Does not affect the shared server bank.
 */
function resetOneUser(db, guildId, userId) {
  const now = Date.now();

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO economy_users (
      guild_id,
      user_id,
      created_at
    )
    VALUES (?, ?, ?)
  `);

  const resetUser = db.prepare(`
    UPDATE economy_users
    SET
      balance = 0,
      lifetime_earned = 0,
      lifetime_spent = 0,
      lifetime_tax_paid = 0,
      last_reward_at = 0,
      current_job_id = NULL,
      work_streak = 0,
      last_work_day_key = NULL,
      today_work_day_key = NULL,
      today_work_count = 0,
      total_shifts_worked = 0,
      last_work_at = 0,
      last_job_switch_at = 0,
      current_job_started_at = 0
    WHERE guild_id = ?
      AND user_id = ?
  `);

  const deleteBoost = db.prepare(`
    DELETE FROM economy_boosts
    WHERE guild_id = ?
      AND user_id = ?
  `);

  return db.transaction(() => {
    insertUser.run(guildId, userId, now);

    resetUser.run(guildId, userId);

    const boostResult = deleteBoost.run(guildId, userId);

    return {
      success: true,
      boostsRemoved: boostResult.changes,
    };
  })();
}

/**
 * Resets the economy account data for everyone in this server.
 *
 * Also resets the server bank.
 * Preserves transaction/tax/leaderboard history and job configuration.
 */
function resetAllUsers(db, guildId) {
  const now = Date.now();

  const resetUsers = db.prepare(`
    UPDATE economy_users
    SET
      balance = 0,
      lifetime_earned = 0,
      lifetime_spent = 0,
      lifetime_tax_paid = 0,
      last_reward_at = 0,
      current_job_id = NULL,
      work_streak = 0,
      last_work_day_key = NULL,
      today_work_day_key = NULL,
      today_work_count = 0,
      total_shifts_worked = 0,
      last_work_at = 0,
      last_job_switch_at = 0,
      current_job_started_at = 0
    WHERE guild_id = ?
  `);

  const deleteBoosts = db.prepare(`
    DELETE FROM economy_boosts
    WHERE guild_id = ?
  `);

  const resetBank = db.prepare(`
    INSERT INTO economy_server_banks (
      guild_id,
      balance,
      total_tax_collected,
      updated_at
    )
    VALUES (?, 0, 0, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      balance = 0,
      total_tax_collected = 0,
      updated_at = excluded.updated_at
  `);

  return db.transaction(() => {
    const userResult = resetUsers.run(guildId);
    const boostResult = deleteBoosts.run(guildId);

    resetBank.run(guildId, now);

    return {
      success: true,
      accountsReset: userResult.changes,
      boostsRemoved: boostResult.changes,
    };
  })();
}

module.exports = {
  name: 'ecreset',
  aliases: [],
  description: 'Reset one user or the entire server economy.',
  category: 'economy',
  usage: '$ecreset <@user|user ID|username|all>',

  async execute(client, message, args) {
    if (!message.guild) return;

    // Only the bot owner or server owner, according to your existing helper.
    if (!canManageEconomy(client, message)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Access Denied',
            description:
              'Only the bot owner or server owner can use this command.',
          }),
        ],
      });
    }

    if (!client.economy) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Economy Unavailable',
            description: 'The economy system is not initialized.',
          }),
        ],
      });
    }

    const db = client.economy.db || client.economyDB;

    if (
      !db ||
      typeof db.prepare !== 'function' ||
      typeof db.transaction !== 'function'
    ) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Database Unavailable',
            description:
              'Could not access the economy database. No changes were made.',
          }),
        ],
      });
    }

    const guildId = String(message.guild.id);
    const firstArgument = (args[0] || '').trim();

    if (!firstArgument) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Usage',
            description:
              'Use one of the following:\n' +
              '`$ecreset @user`\n' +
              '`$ecreset userID`\n' +
              '`$ecreset username`\n' +
              '`$ecreset all`',
          }),
        ],
      });
    }

    const resetAll = firstArgument.toLowerCase() === 'all';

    // Resolve the target if this is a single-user reset.
    let target = null;
    let targetLabel = '';
    let oldBalance = 0;
    let targetAvatar = null;
    let accountCount = 0;
    let currentBankBalance = 0;

    try {
      if (resetAll) {
        accountCount =
          db.prepare(`
            SELECT COUNT(*) AS count
            FROM economy_users
            WHERE guild_id = ?
          `).get(guildId)?.count || 0;

        currentBankBalance =
          db.prepare(`
            SELECT balance
            FROM economy_server_banks
            WHERE guild_id = ?
          `).get(guildId)?.balance || 0;
      } else {
        const targetRaw = args.join(' ').trim();

        target =
          message.mentions.users.first() ||
          (targetRaw
            ? await resolveTargetUser(client, message, targetRaw)
            : null);

        if (!target) {
          return message.reply({
            embeds: [
              buildEmbed(message, {
                title: 'User Not Found',
                description:
                  'Provide a valid user mention, user ID, or exact username.',
              }),
            ],
          });
        }

        oldBalance = client.economy.getBalance
          ? client.economy.getBalance(guildId, target.id)
          : 0;

        const member =
          message.guild.members.cache.get(target.id) ||
          await message.guild.members.fetch(target.id).catch(() => null);

        targetLabel =
          member?.displayName ||
          target.globalName ||
          target.username ||
          target.id;

        targetAvatar = target.displayAvatarURL({ size: 256 });
      }
    } catch (error) {
      console.error('[ecreset] Error preparing reset:', error);

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Reset Preparation Failed',
            description:
              'Could not prepare the reset. No economy data was reset.',
          }),
        ],
      });
    }

    const confirmationDescription = resetAll
      ? (
          `You are about to reset the economy for **${message.guild.name}**.\n\n` +
          `**This will reset:**\n` +
          `• Every user's balance and lifetime economy totals\n` +
          `• Every user's job, work progress, and work cooldowns\n` +
          `• All active economy boosts in this server\n` +
          `• The server bank and its accumulated tax total\n\n` +
          `**Current accounts:** ${formatNumber(accountCount)}\n` +
          `**Current server bank:** ${money(client, currentBankBalance)}\n\n` +
          `Transaction history, tax history, leaderboard payout history, and job configuration will be preserved.\n\n` +
          '⚠️ **This action cannot be undone.**\n' +
          'Press **Confirm Reset** within 60 seconds to proceed.'
        )
      : (
          `You are about to reset the economy account for **${targetLabel}** (<@${target.id}>).\n\n` +
          `**Current balance:** ${money(client, oldBalance)}\n\n` +
          `This will reset the user's balance, lifetime economy totals, job assignment, work progress, and work cooldowns. Their active economy boost will also be removed.\n\n` +
          `The shared server bank and other users' accounts will not be affected. Transaction and tax history will be preserved.\n\n` +
          '⚠️ **This action cannot be undone.**\n' +
          'Press **Confirm Reset** within 60 seconds to proceed.'
        );

    const confirmationEmbed = buildEmbed(message, {
      title: resetAll ? '⚠️ Confirm Server Economy Reset' : '⚠️ Confirm User Economy Reset',
      description: confirmationDescription,
      thumbnail: resetAll ? undefined : targetAvatar,
      footer: 'Only the person who started this command can confirm it.',
    });

    let confirmationMessage;

    try {
      confirmationMessage = await message.reply({
        embeds: [confirmationEmbed],
        components: [createConfirmationButtons()],
      });
    } catch (error) {
      console.error('[ecreset] Could not send confirmation:', error);
      return;
    }

    const collector = confirmationMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: CONFIRM_TIMEOUT_MS,
    });

    collector.on('collect', async interaction => {
      // Do not let another user confirm or cancel this reset.
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: 'Only the person who started this reset can use these buttons.',
          ephemeral: true,
        }).catch(() => {});
      }

      if (interaction.customId === 'ecreset_cancel') {
        collector.stop('cancelled');

        return interaction.update({
          embeds: [
            buildEmbed(message, {
              title: 'Reset Cancelled',
              description: 'No economy data was changed.',
            }),
          ],
          components: [createConfirmationButtons(true)],
        }).catch(() => {});
      }

      if (interaction.customId !== 'ecreset_confirm') return;

      // Recheck authorization before performing the destructive action.
      if (!canManageEconomy(client, message)) {
        collector.stop('denied');

        return interaction.update({
          embeds: [
            buildEmbed(message, {
              title: 'Access Denied',
              description: 'Your permission to perform this reset is no longer valid. No changes were made.',
            }),
          ],
          components: [createConfirmationButtons(true)],
        }).catch(() => {});
      }

      try {
        let result;

        if (resetAll) {
          result = resetAllUsers(db, guildId);
        } else {
          result = resetOneUser(db, guildId, String(target.id));
        }

        collector.stop('completed');

        const successEmbed = resetAll
          ? buildEmbed(message, {
              title: '✅ Server Economy Reset',
              description:
                `The economy for **${message.guild.name}** has been reset successfully.\n\n` +
                `**Accounts reset:** ${formatNumber(result.accountsReset)}\n` +
                `**Active boosts removed:** ${formatNumber(result.boostsRemoved)}\n` +
                `**Server bank:** ${money(client, 0)}\n\n` +
                'Transaction, tax, and leaderboard payout history and job configuration have been preserved.',
            })
          : buildEmbed(message, {
              title: '✅ User Economy Reset',
              description:
                `The economy account for **${targetLabel}** (<@${target.id}>) has been reset successfully.\n\n` +
                `**Previous balance:** ${money(client, oldBalance)}\n` +
                `**New balance:** ${money(client, 0)}\n` +
                `**Active boosts removed:** ${formatNumber(result.boostsRemoved)}\n\n` +
                'The shared server bank and other users were not affected. Transaction and tax history have been preserved.',
              thumbnail: targetAvatar,
            });

        return interaction.update({
          embeds: [successEmbed],
          components: [createConfirmationButtons(true)],
        }).catch(() => {});
      } catch (error) {
        console.error('[ecreset] Error performing economy reset:', error);

        collector.stop('failed');

        return interaction.update({
          embeds: [
            buildEmbed(message, {
              title: 'Reset Failed',
              description:
                'An error occurred while resetting the economy. The database transaction was rolled back, so no partial reset should have been applied.',
            }),
          ],
          components: [createConfirmationButtons(true)],
        }).catch(() => {});
      }
    });

    collector.on('end', async (_collected, reason) => {
      if (reason !== 'time') return;

      await confirmationMessage.edit({
        embeds: [
          buildEmbed(message, {
            title: 'Confirmation Expired',
            description:
              'No reset was performed because the confirmation timed out.',
          }),
        ],
        components: [createConfirmationButtons(true)],
      }).catch(() => {});
    });
  },
};