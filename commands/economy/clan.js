
'use strict';

const path = require('path');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ComponentType,
} = require('discord.js');

const clan = require('../../handlers/clanService');
const invites = require('../../handlers/clanInvites');
const economy = require('../../handlers/economy');
const CFG = require('../../handlers/clanConfig');

const RED = CFG.COLOR || '#5b0000';
const ICON = key => String(CFG.ICONS?.[key] || '').trim();

function prefixFor(client, guildId) {
  try {
    return typeof client.getPrefix === 'function'
      ? client.getPrefix(guildId) || CFG.PREFIX || '$'
      : CFG.PREFIX || '$';
  } catch {
    return CFG.PREFIX || '$';
  }
}

// ------------------------------------------------------------
// General embeds for normal clan commands.
// Clan info deliberately uses its own direct EmbedBuilder below.
// ------------------------------------------------------------

function baseEmbed(message, title, description) {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  if (message.guild?.iconURL()) {
    embed.setThumbnail(message.guild.iconURL({ size: 256 }));
  }

  const footer = {
    text: `${message.guild?.name || 'Vanessa'} • Requested by ${message.author?.username || 'user'}`,
  };

  const avatar = message.author?.displayAvatarURL?.();

  if (avatar) {
    footer.iconURL = avatar;
  }

  embed.setFooter(footer);

  return embed;
}

function replyEmbed(message, title, description, extra = {}) {
  return message.reply({
    embeds: [baseEmbed(message, title, description)],
    ...extra,
  });
}

function money(amount) {
  return economy.formatCurrency(Number(amount || 0));
}

function shortMoney(amount) {
  const value = Number(amount || 0);

  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  }

  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  }

  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  }

  return value.toLocaleString('en-US');
}

function progressBar(percent, size = 16) {
  const filled = Math.max(
    0,
    Math.min(size, Math.round((Number(percent) || 0) / 100 * size))
  );

  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}`;
}

function parseUserId(message, raw) {
  const mentioned = message.mentions?.users?.first?.();

  if (mentioned) return mentioned.id;

  const text = String(raw || '').trim();

  const match =
    text.match(/^<@!?(\d{15,25})>$/) ||
    text.match(/^(\d{15,25})$/);

  return match ? match[1] : null;
}

async function resolveTarget(message, raw) {
  const id = parseUserId(message, raw);

  if (!id) return null;

  return message.guild.members.fetch(id).catch(() => null);
}

function getClanMembers(clanId) {
  return economy.db.prepare(`
    SELECT user_id, rank_no, total_deposited, joined_at, last_deposit_at
    FROM clan_members
    WHERE clan_id = ?
    ORDER BY rank_no DESC, joined_at ASC, user_id ASC
  `).all(Number(clanId));
}

// ------------------------------------------------------------
// Clan logo
//
// Uploaded logo: attachment URL used as thumbnail.
// Custom emoji: Discord CDN URL used as thumbnail.
// Unicode emoji: no image URL, so no emoji text is added
// to the clan name.
// ------------------------------------------------------------

function clanLogo(clanRow) {
  if (clanRow.logo_file) {
    const filePath = clan.mediaPath(clanRow.logo_file);

    if (filePath) {
      const fileName = path.basename(filePath);

      const file = new AttachmentBuilder(filePath, {
        name: fileName,
      });

      return {
        file,
        thumbnailURL: `attachment://${fileName}`,
      };
    }
  }

  if (clanRow.logo_emoji) {
    const parsed = clan.parseEmoji(clanRow.logo_emoji);

    if (parsed?.url) {
      return {
        file: null,
        thumbnailURL: parsed.url,
      };
    }
  }

  return {
    file: null,
    thumbnailURL: null,
  };
}

// ------------------------------------------------------------
// Clan info embed colour
//
// This does NOT use baseEmbed(), message.createEmbed(),
// universalHelper, or the patched message.reply() method.
//
// It reads the saved colour directly from economy.sqlite
// and converts it to a numeric Discord Embed colour.
// ------------------------------------------------------------

function getClanEmbedColor(clanId, guildId) {
  const row = economy.db.prepare(`
    SELECT embed_color
    FROM clans
    WHERE id = ? AND guild_id = ?
    LIMIT 1
  `).get(
    Number(clanId),
    String(guildId)
  );

  const saved = String(row?.embed_color || '').trim();

  if (/^#?[0-9a-fA-F]{6}$/.test(saved)) {
    const normalized = saved.replace(/^#/, '');
    return Number.parseInt(normalized, 16);
  }

  // Convert the default colour to the same numeric format.
  const fallback = String(RED).trim();

  if (/^#?[0-9a-fA-F]{6}$/.test(fallback)) {
    return Number.parseInt(
      fallback.replace(/^#/, ''),
      16
    );
  }

  return 0x5b0000;
}

// ------------------------------------------------------------
// Clan info
// ------------------------------------------------------------

async function sendClanInfo(message, clanRow) {
  // Always fetch the latest saved clan data.
  // This prevents an old clan object from showing an old hex.
  const latestClan = economy.db.prepare(`
    SELECT *
    FROM clans
    WHERE id = ? AND guild_id = ?
    LIMIT 1
  `).get(
    Number(clanRow.id),
    String(message.guild.id)
  );

  if (!latestClan) {
    return replyEmbed(
      message,
      'Clan Information',
      'That clan no longer exists.'
    );
  }

  const data = clan.describeClan(latestClan);
  const logo = clanLogo(data.clan);

  // Create a completely independent embed.
  // Do not use baseEmbed() or message.createEmbed() here.
  const embed = new EmbedBuilder()
    .setColor(getClanEmbedColor(data.clan.id, message.guild.id))
    .setTitle(data.clan.name)
    .setTimestamp();

  // Top-right clan logo thumbnail.
  if (logo.thumbnailURL) {
    embed.setThumbnail(logo.thumbnailURL);
  } else if (message.guild?.iconURL()) {
    embed.setThumbnail(
      message.guild.iconURL({ size: 256 })
    );
  }

  const files = [];

  if (logo.file) {
    files.push(logo.file);
  }

  const members = getClanMembers(data.clan.id);

  const byRank = rank =>
    members
      .filter(member => Number(member.rank_no) === rank)
      .map(member => `<@${member.user_id}>`);

  const roster = byRank(clan.RANK.MEMBER);

  const rosterText = roster.length
    ? `${roster.slice(0, 18).join('\n')}${roster.length > 18 ? `\n*+${roster.length - 18} more*` : ''}`
    : '—';

  const donorText = data.donors.length
    ? data.donors
        .map((donor, index) =>
          `**${index + 1}.** <@${donor.user_id}> — **${money(donor.total_deposited)}**`
        )
        .join('\n')
    : 'No donors yet.';

  const needed = Number(data.xpNeeded || 0);
  const xp = Number(data.clan.xp || 0);
  const pct = Number(data.pct || 0);

  embed.addFields(
    {
      name: `${ICON('vault')} Vault`,
      value:
        `**${money(data.clan.vault)}** ` +
        `(${shortMoney(data.clan.vault)})`,
      inline: false,
    },
    {
      name: `${ICON('owner')} Owner`,
      value: `<@${data.owner}>`,
      inline: true,
    },
    {
      name: `${ICON('coowner')} Co-Owners`,
      value: byRank(clan.RANK.COOWNER).join('\n') || '—',
      inline: true,
    },
    {
      name: `${ICON('manager')} Managers`,
      value: byRank(clan.RANK.MANAGER).join('\n') || '—',
      inline: true,
    },
    {
      name: `${ICON('senior')} Seniors`,
      value: byRank(clan.RANK.SENIOR).join('\n') || '—',
      inline: true,
    },
    {
      name: `${ICON('members')} Members (${data.memberCount}/${data.capacity})`,
      value: rosterText,
      inline: true,
    },
    {
      name: `${ICON('donors')} Top 3 Donors`,
      value: donorText,
      inline: false,
    },
    {
      name: `${ICON('level')} Clan Level ${data.clan.level}`,
      value: data.clan.level >= CFG.MAX_LEVEL
        ? '**MAX LEVEL**'
        : `**${pct}%**  ${progressBar(pct)}\n${xp.toLocaleString('en-US')} / ${needed.toLocaleString('en-US')} XP`,
      inline: false,
    }
  );

  if (data.clan.booster_until > Date.now()) {
    embed.addFields({
      name: 'XP Booster',
      value:
        `Tier ${data.clan.booster_tier} • ` +
        `+${Math.round(data.boost * 100)}% quest XP • ` +
        `<t:${Math.floor(data.clan.booster_until / 1000)}:R>`,
      inline: false,
    });
  }

  // Banner remains the large image at the bottom.
  // It is separate from the top-right clan logo thumbnail.
  if (data.clan.banner_file) {
    const bannerPath = clan.mediaPath(data.clan.banner_file);

    if (bannerPath) {
      const bannerName = path.basename(bannerPath);

      files.push(
        new AttachmentBuilder(bannerPath, {
          name: bannerName,
        })
      );

      embed.setImage(`attachment://${bannerName}`);
    }
  }

  // Keep the familiar footer without invoking the universal helper.
  const footer = {
    text:
      `${message.guild.name} • ` +
      `Requested by ${message.author.username}`,
  };

  const requesterAvatar = message.author.displayAvatarURL?.();

  if (requesterAvatar) {
    footer.iconURL = requesterAvatar;
  }

  embed.setFooter(footer);

  // Send directly through the channel to bypass patched message.reply.
  return message.channel.send({
    embeds: [embed],
    files,
    reply: {
      messageReference: message.id,
      failIfNotExists: false,
    },
  });
}

// ------------------------------------------------------------
// Clan profile
// ------------------------------------------------------------

async function sendProfile(message) {
  const found = clan.getMembership(
    message.guild.id,
    message.author.id
  );

  if (!found) {
    return replyEmbed(
      message,
      'Clan Profile',
      'You are not currently in a clan.'
    );
  }

  const avatar = message.author.displayAvatarURL({
    size: 256,
  });

  const description =
    `${ICON('clan')} **Clan**\n` +
    `↳ ${found.clan.name}\n\n` +

    `${ICON('rank')} **Rank**\n` +
    `↳ ${clan.RANK_NAMES[found.member.rank_no]}\n\n` +

    `${ICON('contributions')} **Contributions**\n` +
    `↳ ${money(found.member.total_deposited)}`;

  const embed = baseEmbed(
    message,
    'Clan Profile',
    description
  );

  embed.setThumbnail(avatar);

  return message.reply({
    embeds: [embed],
  });
}

// ------------------------------------------------------------
// Clan delete confirmation
// ------------------------------------------------------------

async function confirmClanDeletion(message, gid, uid, clanRow) {
  const embed = baseEmbed(
    message,
    'Delete Clan?',
    `Are you sure you want to permanently delete **${clanRow.name}**?\n\n` +
    `This will remove:\n` +
    `• The clan and all its members\n` +
    `• The clan vault and progression\n` +
    `• Clan quests, deposits and history\n` +
    `• The clan logo and banner\n\n` +
    `**This action cannot be undone.**`
  );

  embed.setColor('#B91C1C');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('clandelete:confirm')
      .setLabel('Delete Clan')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('clandelete:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  const prompt = await message.reply({
    embeds: [embed],
    components: [row],
  });

  const collector = prompt.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
  });

  collector.on('collect', async interaction => {
    if (interaction.user.id !== uid) {
      await interaction.reply({
        content:
          'Only the clan owner who started this command can use these buttons.',
        ephemeral: true,
      }).catch(() => {});

      return;
    }

    if (interaction.customId === 'clandelete:cancel') {
      const cancelled = baseEmbed(
        message,
        'Clan Deletion Cancelled',
        `The deletion of **${clanRow.name}** was cancelled.`
      );

      await interaction.update({
        embeds: [cancelled],
        components: [],
      }).catch(() => {});

      collector.stop('completed');
      return;
    }

    if (interaction.customId === 'clandelete:confirm') {
      try {
        const deleted = clan.deleteClan(gid, uid);

        const success = baseEmbed(
          message,
          'Clan Deleted',
          `**${deleted.name}** has been permanently deleted.`
        );

        success.setColor('#B91C1C');

        await interaction.update({
          embeds: [success],
          components: [],
        }).catch(() => {});

      } catch (error) {
        const failure = baseEmbed(
          message,
          'Clan Deletion Failed',
          error?.name === 'ClanError'
            ? error.message
            : 'The clan could not be deleted. Please try again.'
        );

        await interaction.update({
          embeds: [failure],
          components: [],
        }).catch(() => {});
      }

      collector.stop('completed');
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'completed') return;

    await prompt.edit({
      components: [],
    }).catch(() => {});
  });

  return prompt;
}

// ------------------------------------------------------------
// Clan quests
// ------------------------------------------------------------

async function sendQuestBoard(message) {
  const board = clan.getQuestBoard(
    message.guild.id,
    message.author.id
  );

  const lines = board.quests.map(q => {
    const percent = q.target > 0
      ? Math.min(100, Math.floor(q.progress / q.target * 100))
      : 100;

    const mark = q.done ? '✅' : '◆';
    const label = clan.questText(q);

    return (
      `${mark} **${label}**  ` +
      `[${q.progress.toLocaleString('en-US')}/${q.target.toLocaleString('en-US')}]\n` +
      `└ ${q.tier} • ${money(q.reward_coins)} • ` +
      `${q.reward_xp} XP • ${progressBar(percent, 10)}`
    );
  });

  const embed = baseEmbed(
    message,
    `${ICON('quest')} ${board.clan.name} — Daily Quests`,
    `Complete the daily quests with your clan!\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `${ICON('trophy')} **Complete all four quests for ${board.bonusXp.toLocaleString('en-US')} bonus XP!**` +
    (board.bonusClaimed ? '\n✅ Daily bonus already claimed.' : '') +
    (board.boost
      ? `\n\nActive XP bonus: **+${Math.round(board.boost * 100)}%**`
      : '')
  );

  return message.reply({
    embeds: [embed],
  });
}

// ------------------------------------------------------------
// Clan leaderboard
// ------------------------------------------------------------

async function sendLeaderboard(message, pageRaw) {
  const page = Math.max(
    0,
    (Number.parseInt(pageRaw, 10) || 1) - 1
  );

  const result = clan.getLeaderboard(
    message.guild.id,
    page,
    10
  );

  if (!result.rows.length) {
    return replyEmbed(
      message,
      'Clan Leaderboard',
      'There are no clans in this server yet.'
    );
  }

  const marks = [
    ICON('rank1') || '🥇',
    ICON('rank2') || '🥈',
    ICON('rank3') || '🥉',
  ];

  const text = result.rows.map((row, i) => {
    const place = result.offset + i + 1;
    const mark = marks[place - 1] || `**${place}.**`;

    return (
      `${mark} **${row.name}**\n` +
      `Vault: **${shortMoney(row.vault)}** • Level **${row.level}**`
    );
  }).join('\n\n');

  const embed = baseEmbed(
    message,
    'Clan Leaderboard',
    `${text}\n\n` +
    `${ICON('stats')} **Total Clans:** ${result.total}\n` +
    `${ICON('crown')} Use \`${prefixFor(message.client, message.guild.id)}clan info <name>\` to view a clan.`
  );

  embed.setFooter({
    text: `Page ${result.page + 1}/${result.pages} • Ranked by vault balance`,
  });

  return message.reply({
    embeds: [embed],
  });
}

// ------------------------------------------------------------
// Upgrades
// ------------------------------------------------------------

async function sendUpgradeView(message) {
  const view = clan.upgradeView(
    message.guild.id,
    message.author.id
  );

  const xpLines = view.booster.tiers
    .map(t =>
      `**XP Booster ${t.tier}** — ${money(t.cost)} • ` +
      `+${Math.round(t.bonus * 100)}% quest XP • ${t.xp} XP`
    )
    .join('\n');

  const capLines = CFG.CAPACITY
    .map((t, i) =>
      `**Capacity ${i + 1}** — ${money(t.cost)} • ` +
      `${t.capacity} members • ${t.xp} XP`
    )
    .join('\n');

  const active = view.booster.active
    ? `Active: **Tier ${view.booster.tier}** until <t:${Math.floor(view.booster.until / 1000)}:R>`
    : 'No XP Booster is currently active.';

  const embed = baseEmbed(
    message,
    `${view.clan.name} — Clan Upgrades`,
    `**Vault:** ${money(view.clan.vault)}\n` +
    `**Members:** ${view.members}/${view.capacity}\n` +
    `${active}\n\n` +
    `**XP Boosters**\n${xpLines}\n\n` +
    `**Member Capacity**\n${capLines}\n\n` +
    `Buy with \`${prefixFor(message.client, message.guild.id)}clan upgrade xp <tier>\` ` +
    `or \`${prefixFor(message.client, message.guild.id)}clan upgrade capacity\`. ` +
    `Only Co-owner+ can purchase upgrades.`
  );

  return message.reply({
    embeds: [embed],
  });
}

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

function handleError(message, error) {
  console.error('[Clan] Command failed:', error);

  const description = error?.name === 'ClanError'
    ? error.message
    : 'The clan system hit an unexpected error. Check the console logs and try again.';

  return replyEmbed(
    message,
    'Clan System',
    description
  ).catch(() => null);
}

// ------------------------------------------------------------
// Button interactions
// ------------------------------------------------------------

async function handleInteraction(client, interaction) {
  if (!interaction.isButton?.()) return false;

  const parts = String(interaction.customId || '').split(':');

  if (parts[0] !== 'claninvite' || parts.length !== 3) {
    return false;
  }

  const action = parts[1];
  const token = parts[2];

  try {
    const result = action === 'accept'
      ? invites.accept(token, interaction.user.id)
      : action === 'reject'
        ? invites.reject(token, interaction.user.id)
        : null;

    if (!result) {
      await interaction.reply({
        content: 'This invitation action is not recognized.',
        ephemeral: true,
      });

      return true;
    }

    if (!result.ok) {
      const messages = {
        missing: 'This invitation could not be found.',
        not_invited_user: 'This invitation was sent to someone else.',
        not_pending: 'This invitation is no longer active.',
        expired: 'This invitation has expired.',
      };

      await interaction.reply({
        content: messages[result.code] ||
          'This invitation is no longer available.',
        ephemeral: true,
      });

      return true;
    }

    if (!result.rejected && result.notes) {
      await clan.announce(interaction.channel, result.notes);
    }

    const embed = new EmbedBuilder()
      .setColor(RED)
      .setTitle(result.rejected ? 'Invitation Rejected' : 'Clan Joined')
      .setDescription(
        result.rejected
          ? 'You rejected the clan invitation.'
          : `You joined **${result.clan.name}**.`
      )
      .setTimestamp();

    await interaction.update({
      embeds: [embed],
      components: [],
      content: '',
    });

    return true;

  } catch (error) {
    console.error('[Clan] Invitation interaction failed:', error);

    const text = error?.name === 'ClanError'
      ? error.message
      : 'The invitation could not be processed.';

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: text,
        ephemeral: true,
      }).catch(() => {});
    }

    return true;
  }
}

// ------------------------------------------------------------
// Main command
// ------------------------------------------------------------

module.exports = {
  name: 'clan',
  aliases: [],
  description: 'Create, manage and grow a clan.',
  category: 'economy',
  usage: '$clan help',
  handleInteraction,

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || 'help').toLowerCase();
    const gid = message.guild.id;
    const uid = message.author.id;
    const prefix = prefixFor(client, gid);

    try {
      // ------------------------------------------------------
      // Help
      // ------------------------------------------------------

      if (sub === 'help') {
        const e = baseEmbed(
          message,
          'Clan Commands',
          `**Create / join**\n` +
          `\`${prefix}shop\` → buy Clan Creation (8,000,000 Crowns)\n` +
          `\`${prefix}clan name <name>\`\n` +
          `\`${prefix}clan join <name>\`\n` +
          `\`${prefix}clan leave\`\n\n` +

          `**Members & ranks**\n` +
          `\`${prefix}clan invite <@user>\` • \`${prefix}clan kick <@user>\`\n` +
          `\`${prefix}clan setco-owner <@user>\` • \`${prefix}clan removeco-owner <@user>\`\n` +
          `\`${prefix}clan setmanager <@user>\` • \`${prefix}clan removemanager <@user>\`\n` +
          `\`${prefix}clan setsenior <@user>\` • \`${prefix}clan removesenior <@user>\`\n\n` +

          `**Vault & progression**\n` +
          `\`${prefix}clan deposit <amount|all>\` • \`${prefix}clan deposit history [page]\`\n` +
          `\`${prefix}clan quest\` / \`${prefix}cq\` • \`${prefix}clan upgrade\` • \`${prefix}clan lb [page]\`\n\n` +

          `**Information & appearance**\n` +
          `\`${prefix}clan info [name]\` • \`${prefix}clan profile\`\n` +
          `\`${prefix}clan rename <name>\`\n` +
          `\`${prefix}clan logo <emoji>\` or attach an image\n` +
          `\`${prefix}clan banner\` with an image attachment\n` +
          `\`${prefix}clan sethex #RRGGBB\` (Owner and Co-owner)\n` +
          `\`${prefix}clan privacy <on|off>\` (Owner only)\n` +
          `\`${prefix}clan delete\` (Owner only)`
        );

        return message.reply({
          embeds: [e],
        });
      }

      // ------------------------------------------------------
      // Create
      // ------------------------------------------------------

      if (sub === 'name') {
        const name = args.slice(1).join(' ').trim();

        if (!name) {
          return replyEmbed(
            message,
            'Clan Name',
            `Use \`${prefix}clan name <name>\`.`
          );
        }

        const created = clan.createFromVoucher(gid, uid, name);

        return replyEmbed(
          message,
          'Clan Created',
          `**${created.name}** has been created. You are its Owner. ` +
          `Use \`${prefix}clan info\` to view your clan.`
        );
      }

      // ------------------------------------------------------
      // Join
      // ------------------------------------------------------

      if (sub === 'join') {
        const name = args.slice(1).join(' ').trim();

        if (!name) {
          return replyEmbed(
            message,
            'Join a Clan',
            `Use \`${prefix}clan join <name>\`.`
          );
        }

        const joined = clan.joinByName(gid, uid, name);

        await clan.announce(message.channel, joined.notes);

        return replyEmbed(
          message,
          'Clan Joined',
          `You joined **${joined.clan.name}** as a Member.`
        );
      }

      // ------------------------------------------------------
      // Leave
      // ------------------------------------------------------

      if (sub === 'leave') {
        const left = clan.leaveClan(gid, uid);

        return replyEmbed(
          message,
          'Left Clan',
          `You left **${left.clan.name}**. You must wait 5 days before rejoining that clan.`
        );
      }

      // ------------------------------------------------------
      // Rename
      // ------------------------------------------------------

      if (sub === 'rename') {
        const name = args.slice(1).join(' ').trim();

        if (!name) {
          return replyEmbed(
            message,
            'Rename Clan',
            `Use \`${prefix}clan rename <new name>\`. ` +
            `Cost: ${money(CFG.RENAME_COST)}.`
          );
        }

        const result = clan.renameClan(gid, uid, name);

        return replyEmbed(
          message,
          'Clan Renamed',
          `**${result.oldName}** is now **${result.clan.name}**.\n` +
          `Cost: ${money(result.cost)}.`
        );
      }

      if (sub === 'joinid') {
        return replyEmbed(
          message,
          'Join a Clan',
          'Use the clan name with `clan join <name>`.'
        );
      }

      // ------------------------------------------------------
      // Delete — owner only
      // ------------------------------------------------------

      if (sub === 'delete') {
        const found = clan.getMembership(gid, uid);

        if (!found) {
          return replyEmbed(
            message,
            'Clan Delete',
            'You are not currently in a clan.'
          );
        }

        if (
          found.member.rank_no !== clan.RANK.OWNER ||
          String(found.clan.owner_id) !== uid
        ) {
          throw new clan.ClanError(
            'Only the clan Owner can delete the clan.'
          );
        }

        return confirmClanDeletion(
          message,
          gid,
          uid,
          found.clan
        );
      }

      // ------------------------------------------------------
      // Set hex colour — owner and co-owner
      // ------------------------------------------------------

      if (sub === 'sethex') {
        const hex = String(args[1] || '').trim();

        if (!hex) {
          return replyEmbed(
            message,
            'Clan Embed Colour',
            `Use \`${prefix}clan sethex #RRGGBB\`.\n` +
            `Example: \`${prefix}clan sethex #5865F2\``
          );
        }

        const updated = clan.setEmbedColor(gid, uid, hex);

        return replyEmbed(
          message,
          'Clan Colour Updated',
          `The info embed colour for **${updated.name}** is now **${updated.embed_color}**.`
        );
      }

      // ------------------------------------------------------
      // Invite
      // ------------------------------------------------------

      if (sub === 'invite') {
        const target = await resolveTarget(message, args[1]);

        if (!target) {
          return replyEmbed(
            message,
            'Invite Failed',
            `Mention a server member or provide their ID.\n` +
            `Use: \`${prefix}clan invite <@user>\`.`
          );
        }

        if (target.user.bot) {
          return replyEmbed(
            message,
            'Invite Failed',
            'Bots cannot join clans.'
          );
        }

        const { clan: clanRow } = clan.assertCanInvite(
          gid,
          uid,
          target.id
        );

        const invite = invites.create(
          gid,
          clanRow.id,
          uid,
          target.id
        );

        const e = new EmbedBuilder()
          .setColor(RED)
          .setTitle('Clan Invitation')
          .setDescription(
            `You have been invited to join **${clanRow.name}**.\n\n` +
            `This invitation expires <t:${Math.floor(invite.expiresAt / 1000)}:R>.`
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claninvite:accept:${invite.token}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`claninvite:reject:${invite.token}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Danger)
        );

        await message.channel.send({
          content: `<@${target.id}>`,
          embeds: [e],
          components: [row],
          allowedMentions: {
            users: [target.id],
          },
        });

        return;
      }

      // ------------------------------------------------------
      // Kick
      // ------------------------------------------------------

      if (sub === 'kick') {
        const target = await resolveTarget(message, args[1]);

        if (!target) {
          return replyEmbed(
            message,
            'Kick Failed',
            `Use \`${prefix}clan kick <@user>\`.`
          );
        }

        const result = clan.kickMember(
          gid,
          uid,
          target.id
        );

        return replyEmbed(
          message,
          'Member Kicked',
          `<@${target.id}> was removed from **${result.clan.name}**.`
        );
      }

      // ------------------------------------------------------
      // Rank actions
      // ------------------------------------------------------

      const rankActions = {
        'setco-owner': {
          rank: clan.RANK.COOWNER,
          expected: null,
          label: 'Co-owner',
        },

        'removeco-owner': {
          rank: clan.RANK.MEMBER,
          expected: clan.RANK.COOWNER,
          label: 'Co-owner',
        },

        setmanager: {
          rank: clan.RANK.MANAGER,
          expected: null,
          label: 'Manager',
        },

        removemanager: {
          rank: clan.RANK.MEMBER,
          expected: clan.RANK.MANAGER,
          label: 'Manager',
        },

        setsenior: {
          rank: clan.RANK.SENIOR,
          expected: null,
          label: 'Senior',
        },

        removesenior: {
          rank: clan.RANK.MEMBER,
          expected: clan.RANK.SENIOR,
          label: 'Senior',
        },
      };

      if (rankActions[sub]) {
        const target = await resolveTarget(message, args[1]);

        if (!target) {
          return replyEmbed(
            message,
            'Rank Update Failed',
            `Use \`${prefix}clan ${sub} <@user>\`.`
          );
        }

        const spec = rankActions[sub];

        clan.changeRank(
          gid,
          uid,
          target.id,
          spec.rank,
          spec.expected
        );

        const outcome = spec.rank === clan.RANK.MEMBER
          ? `Their ${spec.label} rank was removed; they are now a Member.`
          : `They have been appointed as ${spec.label}.`;

        return replyEmbed(
          message,
          'Clan Rank Updated',
          `<@${target.id}> — ${outcome}`
        );
      }

      // ------------------------------------------------------
      // Privacy
      // ------------------------------------------------------

      if (sub === 'privacy') {
        const value = String(args[1] || '').toLowerCase();

        if (!['on', 'off'].includes(value)) {
          return replyEmbed(
            message,
            'Clan Privacy',
            `Use \`${prefix}clan privacy <on|off>\`.`
          );
        }

        const found = clan.requireMembership(gid, uid);

        if (found.member.rank_no !== clan.RANK.OWNER) {
          throw new clan.ClanError(
            'Only the clan Owner can change clan privacy.'
          );
        }

        const updated = clan.setPrivate(
          gid,
          found.clan.name,
          value === 'on'
        );

        return replyEmbed(
          message,
          'Clan Privacy Updated',
          `**${updated.name}** is now ${updated.is_private ? 'private' : 'public'}.`
        );
      }

      // ------------------------------------------------------
      // Deposit and deposit history
      // ------------------------------------------------------

      if (sub === 'deposit') {
        if (String(args[1] || '').toLowerCase() === 'history') {
          const history = clan.depositHistory(
            gid,
            uid,
            Math.max(0, (Number.parseInt(args[2], 10) || 1) - 1)
          );

          if (!history.rows.length) {
            return replyEmbed(
              message,
              'Deposit History',
              `No deposits in the last ${history.days} days.`
            );
          }

          const lines = history.rows.map(row =>
            `• <@${row.user_id}> — **${money(row.amount)}** • ` +
            `<t:${Math.floor(row.ts / 1000)}:R>`
          );

          const e = baseEmbed(
            message,
            `${history.clan.name} — Deposit History`,
            lines.join('\n')
          );

          e.setFooter({
            text: `Page ${history.page + 1}/${history.pages} • Last ${history.days} days`,
          });

          return message.reply({
            embeds: [e],
          });
        }

        const result = clan.deposit(
          gid,
          uid,
          args[1]
        );

        await clan.announce(message.channel, result.notes);

        return replyEmbed(
          message,
          'Vault Deposit Complete',
          `Deposited **${money(result.amount)}** into **${result.clan.name}**'s vault.\n` +
          `Your wallet: ${money(result.wallet)}\n` +
          `Clan vault: ${money(result.clan.vault)}.`
        );
      }

      // ------------------------------------------------------
      // Leaderboard and quests
      // ------------------------------------------------------

      if (sub === 'lb' || sub === 'leaderboard') {
        return sendLeaderboard(message, args[1]);
      }

      if (sub === 'quest' || sub === 'quests') {
        return sendQuestBoard(message);
      }

      // ------------------------------------------------------
      // Upgrades
      // ------------------------------------------------------

      if (sub === 'upgrade' || sub === 'upgrades') {
        if (!args[1]) {
          return sendUpgradeView(message);
        }

        const kind = String(args[1]).toLowerCase();

        const result = kind === 'capacity'
          ? clan.buyUpgrade(gid, uid, 'capacity')
          : kind === 'xp'
            ? clan.buyUpgrade(gid, uid, 'xp', args[2])
            : null;

        if (!result) {
          return replyEmbed(
            message,
            'Clan Upgrade',
            `Use \`${prefix}clan upgrade\`, ` +
            `\`${prefix}clan upgrade xp <tier>\` or ` +
            `\`${prefix}clan upgrade capacity\`.`
          );
        }

        await clan.announce(message.channel, result.notes);

        const detail = result.kind === 'capacity'
          ? `Member capacity is now **${result.capacity}**.`
          : `XP Booster **Tier ${result.tier}** is active until <t:${Math.floor(result.until / 1000)}:R>.`;

        return replyEmbed(
          message,
          'Upgrade Purchased',
          `${detail}\nCost: ${money(result.cost)}\n` +
          `Clan XP gained: ${result.xp.toLocaleString('en-US')}.`
        );
      }

      // ------------------------------------------------------
      // Clan info
      // ------------------------------------------------------

      if (sub === 'info') {
        const name = args.slice(1).join(' ').trim();

        const found = name
          ? clan.getClanByName(gid, name)
          : clan.getMembership(gid, uid)?.clan;

        if (!found) {
          return replyEmbed(
            message,
            'Clan Information',
            name
              ? `I could not find **${name}**.`
              : 'You are not in a clan. Use `clan info <name>` to view another clan.'
          );
        }

        return sendClanInfo(message, found);
      }

      // ------------------------------------------------------
      // Profile
      // ------------------------------------------------------

      if (sub === 'profile') {
        return sendProfile(message);
      }

      // ------------------------------------------------------
      // Logo and banner
      // ------------------------------------------------------

      if (sub === 'logo' || sub === 'banner') {
        const attachment = message.attachments?.first?.();

        if (sub === 'logo' && !attachment) {
          const emojiText = args.slice(1).join(' ').trim();

          if (!emojiText) {
            return replyEmbed(
              message,
              'Clan Logo',
              `Attach an image or use \`${prefix}clan logo <emoji>\`.`
            );
          }

          const updated = clan.setLogoEmoji(
            gid,
            uid,
            emojiText
          );

          return replyEmbed(
            message,
            'Clan Logo Updated',
            `The logo for **${updated.name}** has been changed.`
          );
        }

        if (!attachment) {
          return replyEmbed(
            message,
            'Clan Banner',
            `Attach a PNG, JPG, WEBP or GIF image.\n` +
            `Use: \`${prefix}clan banner\` with an attachment.`
          );
        }

        const updated = await clan.setMedia(
          gid,
          uid,
          sub,
          attachment
        );

        return replyEmbed(
          message,
          `${sub === 'logo' ? 'Clan Logo' : 'Clan Banner'} Updated`,
          `The ${sub} for **${updated.name}** has been changed.`
        );
      }

      // ------------------------------------------------------
      // Unknown command
      // ------------------------------------------------------

      return replyEmbed(
        message,
        'Unknown Clan Command',
        `Use \`${prefix}clan help\` to see the available commands.`
      );

    } catch (error) {
      return handleError(message, error);
    }
  },
};
