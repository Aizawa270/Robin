const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DARK_GRAY = '#2b2d31';
const COOLDOWN_TIME = 43200000; // 12 hours

let config = null;
try {
  config = require('../../config');
} catch {}

function createFameEmbed() {
  const embed = new EmbedBuilder().setColor(DARK_GRAY);
  embed._bypassUniversalHelper = true;
  return embed;
}

function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getBotOwnerIds(client) {
  const ids = new Set();
  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (client?.ownerIds && Array.isArray(client.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function canManageFame(client, member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  if (isBotOwner(client, member.id)) return true;
  return false;
}

// Mention / ID / exact username only. No display names.
async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  const query = String(input).trim();
  if (!query) return null;

  const mention = query.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    return await client.users.fetch(mention[1]).catch(() => null);
  }

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});
    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;
  }

  return null;
}

function getUserPoints(client, guildId, userId) {
  if (!client.fameDB) return { reputation: 0, stupidity: 0, black: 0 };

  const row = client.fameDB.prepare(`
    SELECT reputation, stupidity, black
    FROM fame_points_guild
    WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId);

  return row || { reputation: 0, stupidity: 0, black: 0 };
}

function addPoint(client, guildId, userId, pointType) {
  if (!client.fameDB) return false;

  const columnName = pointType === 'rep' ? 'reputation' : pointType;

  client.fameDB.prepare(`
    INSERT INTO fame_points_guild (guild_id, user_id, ${columnName}, last_updated)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      ${columnName} = ${columnName} + 1,
      last_updated = ?
  `).run(guildId, userId, Date.now(), Date.now());

  return true;
}

function removePoint(client, guildId, userId, pointType, amount) {
  if (!client.fameDB) return 0;

  const columnName = pointType === 'rep' ? 'reputation' : pointType;
  const current = getUserPoints(client, guildId, userId)[columnName];
  const newAmount = Math.max(0, current - amount);

  client.fameDB.prepare(`
    INSERT INTO fame_points_guild (guild_id, user_id, reputation, stupidity, black, last_updated)
    VALUES (?, ?, 0, 0, 0, ?)
    ON CONFLICT(guild_id, user_id) DO NOTHING
  `).run(guildId, userId, Date.now());

  client.fameDB.prepare(`
    UPDATE fame_points_guild
    SET ${columnName} = ?, last_updated = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(newAmount, Date.now(), guildId, userId);

  return newAmount;
}

function logFameAction(client, guildId, giverId, receiverId, pointType) {
  if (!client.fameDB) return;

  client.fameDB.prepare(`
    INSERT INTO fame_logs_guild (guild_id, giver_id, receiver_id, point_type, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, giverId, receiverId, pointType, Date.now());
}

function checkCooldown(client, guildId, giverId, pointType) {
  if (!client.fameDB) return { onCooldown: false };

  const now = Date.now();

  const row = client.fameDB.prepare(`
    SELECT last_given FROM fame_cooldowns_guild
    WHERE guild_id = ? AND giver_id = ? AND point_type = ?
  `).get(guildId, giverId, pointType);

  if (row) {
    const timeLeft = COOLDOWN_TIME - (now - row.last_given);

    if (timeLeft > 0) {
      const hoursLeft = Math.floor(timeLeft / 3600000);
      const minutesLeft = Math.ceil((timeLeft % 3600000) / 60000);
      return { onCooldown: true, timeString: `${hoursLeft}h ${minutesLeft}m` };
    }
  }

  client.fameDB.prepare(`
    INSERT INTO fame_cooldowns_guild (guild_id, giver_id, point_type, last_given)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, giver_id, point_type) DO UPDATE SET
      last_given = ?
  `).run(guildId, giverId, pointType, now, now);

  return { onCooldown: false };
}

function pointMeta(pointType) {
  const normalized = pointType === 'rep' ? 'reputation' : pointType;

  const meta = {
    reputation: {
      title: 'Reputation Point Given',
      color: '#00ff00',
      label: 'reputation',
    },
    stupidity: {
      title: 'Stupidity Point Given',
      color: '#ff6b6b',
      label: 'stupidity',
    },
    black: {
      title: 'Black Point Given',
      color: '#2b2d31',
      label: 'black',
    },
  };

  return meta[normalized] || {
    title: 'Point Given',
    color: DARK_GRAY,
    label: normalized,
  };
}

function makePointEmbed(giver, target, pointType) {
  const meta = pointMeta(pointType);

  return new EmbedBuilder()
    .setTitle(meta.title)
    .setDescription(`${giver.username} gave ${target.username} a ${meta.label} point.`)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .setColor(meta.color)
    .setTimestamp();
}

function buildUserReplyEmbed(title, description, color = '#f59e0b') {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  name: 'fame',
  description: 'Fame point system - reputation, stupidity, and black points',
  category: 'misc',
  usage: 'fame <rep/stupidity/black/profile/lb/help> [user]',
  aliases: ['famelb'],

  async execute(client, message, args) {
    if (!message.guild) return;
    if (!client.fameDB) {
      return message.reply({
        embeds: [buildUserReplyEmbed('Fame System Unavailable', 'Fame system is unavailable.', '#ef4444')]
      });
    }

    const guildId = message.guild.id;
    const subcommand = args[0]?.toLowerCase();
    if (!subcommand) return;

    // HELP
    if (subcommand === 'help') {
      const embed = createFameEmbed()
        .setTitle('Fame System - Commands')
        .setDescription('Give reputation, stupidity, or black points to other users!')
        .addFields(
          {
            name: '📊 Viewing Commands',
            value: '• `fame lb` or `famelb` - View leaderboard\n• `fame profile [@user]` - View fame profile (with buttons!)'
          },
          {
            name: '⭐ Giving Points',
            value: '• `fame rep @user` - Give reputation point\n• `fame stupidity @user` - Give stupidity point\n• `fame black @user` - Give black point'
          },
          {
            name: '⚙️ Admin Commands',
            value: '• `fame add <type> @user [amount]` - Add points (Bot owner / Server owner)\n• `fame remove <type> @user [amount]` - Remove points (Bot owner / Server owner)\n• `fame reset confirm` - Reset all points (Bot owner / Server owner)'
          },
          {
            name: '⏱️ Cooldown',
            value: '12 hours per point type, per server.'
          },
          {
            name: '💡 Tip',
            value: 'Use `fame profile @user` to quickly give points using buttons!'
          }
        )
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      return message.reply({ embeds: [embed] });
    }

    // LEADERBOARD
    if (
      subcommand === 'lb' ||
      subcommand === 'leaderboard' ||
      message.content.toLowerCase().startsWith(`${client.getPrefix(message.guild.id)}famelb`)
    ) {
      const topUsers = client.fameDB.prepare(`
        SELECT user_id, reputation, stupidity, black
        FROM fame_points_guild
        WHERE guild_id = ?
        ORDER BY reputation DESC, stupidity DESC, black DESC
        LIMIT 10
      `).all(guildId);

      if (topUsers.length === 0) {
        const embed = createFameEmbed()
          .setTitle('Reputation Leaderboard')
          .setDescription('No fame points have been given in this server yet!')
          .setFooter({ text: `Vynora • ${getCurrentTime()}` });
        return message.reply({ embeds: [embed] });
      }

      let leaderboardText = 'Top users by reputation points in this server:\n\n';

      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const targetUser = await client.users.fetch(user.user_id).catch(() => null);
        const displayName = targetUser?.username || user.user_id;
        leaderboardText += `**${i + 1}. ${displayName}**\n${user.reputation} points\n\n`;
      }

      const embed = createFameEmbed()
        .setTitle('Reputation Leaderboard')
        .setDescription(leaderboardText.trim())
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      return message.reply({ embeds: [embed] });
    }

    // PROFILE
    if (subcommand === 'profile') {
      const target =
        message.mentions.users.first() ||
        (args[1] ? await resolveTargetUser(client, message, args[1]) : null) ||
        message.author;

      const points = getUserPoints(client, guildId, target.id);

      const embed = createFameEmbed()
        .setTitle(`${target.username}'s Fame Points`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: 'Reputation Points', value: points.reputation.toString() },
          { name: 'Stupidity Points', value: points.stupidity.toString() },
          { name: 'Black Points', value: points.black.toString() }
        )
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      if (target.bot) {
        return message.reply({ embeds: [embed] });
      }

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fame_rep:${guildId}:${target.id}`)
          .setLabel('Give Reputation')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`fame_stupidity:${guildId}:${target.id}`)
          .setLabel('Give Stupidity')
          .setStyle(ButtonStyle.Danger)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fame_black:${guildId}:${target.id}`)
          .setLabel('Give Black Point')
          .setStyle(ButtonStyle.Secondary)
      );

      const reply = await message.reply({ embeds: [embed], components: [row1, row2] });

      const collector = reply.createMessageComponentCollector({ time: 300000 });

      collector.on('collect', async (interaction) => {
        const parts = interaction.customId.split(':');
        const action = parts[0];
        const customGuildId = parts[1];
        const targetId = parts[2];

        if (customGuildId !== interaction.guildId) {
          return interaction.reply({
            content: 'This button is not for this server.',
            ephemeral: true
          });
        }

        const pointType = action.replace('fame_', '');
        const giverId = interaction.user.id;

        if (targetId === giverId) {
          return interaction.reply({
            content: `You cannot give yourself ${pointType} points!`,
            ephemeral: true
          });
        }

        const cooldown = checkCooldown(client, interaction.guildId, giverId, pointType);
        if (cooldown.onCooldown) {
          return interaction.reply({
            content: `You can give ${pointType} points again in ${cooldown.timeString}.`,
            ephemeral: true
          });
        }

        addPoint(client, interaction.guildId, targetId, pointType);
        logFameAction(client, interaction.guildId, giverId, targetId, pointType);

        const updatedPoints = getUserPoints(client, interaction.guildId, targetId);
        const targetUser = await client.users.fetch(targetId).catch(() => null);

        if (targetUser) {
          const updatedEmbed = createFameEmbed()
            .setTitle(`${targetUser.username}'s Fame Points`)
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .addFields(
              { name: 'Reputation Points', value: updatedPoints.reputation.toString() },
              { name: 'Stupidity Points', value: updatedPoints.stupidity.toString() },
              { name: 'Black Points', value: updatedPoints.black.toString() }
            )
            .setFooter({ text: `Vynora • ${getCurrentTime()}` });

          await reply.edit({ embeds: [updatedEmbed], components: [row1, row2] }).catch(() => {});
        }

        const responseEmbed = makePointEmbed(
          interaction.user,
          targetUser || { username: 'Unknown', displayAvatarURL: () => null },
          pointType
        );
        responseEmbed._bypassUniversalHelper = true;

        return interaction.reply({
          embeds: [responseEmbed],
          ephemeral: true
        });
      });

      collector.on('end', () => {
        reply.edit({ components: [] }).catch(() => {});
      });

      return;
    }

    // GIVE REPUTATION
    if (subcommand === 'rep' || subcommand === 'reputation') {
      const target =
        message.mentions.users.first() ||
        (args[1] ? await resolveTargetUser(client, message, args[1]) : null);

      if (!target) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Rep Failed', 'Please mention a user or provide a valid username or user ID.', '#f59e0b')]
        });
      }
      if (target.id === message.author.id) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Rep Failed', 'You cannot give yourself reputation points!', '#ef4444')]
        });
      }
      if (target.bot) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Rep Failed', 'You cannot give reputation points to bots!', '#ef4444')]
        });
      }

      const cooldown = checkCooldown(client, guildId, message.author.id, 'reputation');
      if (cooldown.onCooldown) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Rep Cooldown', `You can give reputation points again in ${cooldown.timeString}.`, '#f59e0b')]
        });
      }

      addPoint(client, guildId, target.id, 'reputation');
      logFameAction(client, guildId, message.author.id, target.id, 'reputation');

      const embed = makePointEmbed(message.author, target, 'reputation');
      return message.reply({ embeds: [embed] });
    }

    // GIVE STUPIDITY
    if (subcommand === 'stupidity' || subcommand === 'stupid') {
      const target =
        message.mentions.users.first() ||
        (args[1] ? await resolveTargetUser(client, message, args[1]) : null);

      if (!target) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Stupidity Failed', 'Please mention a user or provide a valid username or user ID.', '#f59e0b')]
        });
      }
      if (target.id === message.author.id) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Stupidity Failed', 'You cannot give yourself stupidity points!', '#ef4444')]
        });
      }
      if (target.bot) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Stupidity Failed', 'You cannot give stupidity points to bots!', '#ef4444')]
        });
      }

      const cooldown = checkCooldown(client, guildId, message.author.id, 'stupidity');
      if (cooldown.onCooldown) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Stupidity Cooldown', `You can give stupidity points again in ${cooldown.timeString}.`, '#f59e0b')]
        });
      }

      addPoint(client, guildId, target.id, 'stupidity');
      logFameAction(client, guildId, message.author.id, target.id, 'stupidity');

      const embed = makePointEmbed(message.author, target, 'stupidity');
      return message.reply({ embeds: [embed] });
    }

    // GIVE BLACK POINT
    if (subcommand === 'black' || subcommand === 'blackpoint') {
      const target =
        message.mentions.users.first() ||
        (args[1] ? await resolveTargetUser(client, message, args[1]) : null);

      if (!target) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Black Point Failed', 'Please mention a user or provide a valid username or user ID.', '#f59e0b')]
        });
      }
      if (target.id === message.author.id) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Black Point Failed', 'You cannot give yourself black points!', '#ef4444')]
        });
      }
      if (target.bot) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Black Point Failed', 'You cannot give black points to bots!', '#ef4444')]
        });
      }

      const cooldown = checkCooldown(client, guildId, message.author.id, 'black');
      if (cooldown.onCooldown) {
        return message.reply({
          embeds: [buildUserReplyEmbed('Black Point Cooldown', `You can give black points again in ${cooldown.timeString}.`, '#f59e0b')]
        });
      }

      addPoint(client, guildId, target.id, 'black');
      logFameAction(client, guildId, message.author.id, target.id, 'black');

      const embed = makePointEmbed(message.author, target, 'black');
      return message.reply({ embeds: [embed] });
    }

    // ADMIN COMMANDS (BOT OWNER / SERVER OWNER ONLY)
    if (canManageFame(client, message.member)) {
      if (subcommand === 'add') {
        const pointType = args[1]?.toLowerCase();
        const target =
          message.mentions.users.first() ||
          (args[2] ? await resolveTargetUser(client, message, args[2]) : null);
        const amount = parseInt(args[3]) || 1;

        if (!['rep', 'reputation', 'stupidity', 'black'].includes(pointType)) {
          return message.reply({
            embeds: [buildUserReplyEmbed('Add Failed', 'Invalid point type! Use: `rep`, `stupidity`, or `black`.', '#f59e0b')]
          });
        }

        if (!target) {
          return message.reply({
            embeds: [buildUserReplyEmbed('Add Failed', 'Please mention a user or provide a valid username or user ID.', '#f59e0b')]
          });
        }

        if (amount > 100) {
          return message.reply({
            embeds: [buildUserReplyEmbed('Add Failed', 'You cannot add more than 100 points at once!', '#f59e0b')]
          });
        }

        const normalizedType = pointType === 'rep' ? 'reputation' : pointType;

        for (let i = 0; i < amount; i++) {
          addPoint(client, guildId, target.id, normalizedType);
        }

        const embed = createFameEmbed()
          .setTitle('✅ Points Added')
          .setDescription(`Added **${amount}** ${normalizedType} point(s) to ${target.username}`)
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }

      if (subcommand === 'remove') {
        const pointType = args[1]?.toLowerCase();
        const target =
          message.mentions.users.first() ||
          (args[2] ? await resolveTargetUser(client, message, args[2]) : null);
        const amount = parseInt(args[3]) || 1;

        if (!['rep', 'reputation', 'stupidity', 'black'].includes(pointType)) {
          return message.reply({
            embeds: [buildUserReplyEmbed('Remove Failed', 'Invalid point type! Use: `rep`, `stupidity`, or `black`.', '#f59e0b')]
          });
        }

        if (!target) {
          return message.reply({
            embeds: [buildUserReplyEmbed('Remove Failed', 'Please mention a user or provide a valid username or user ID.', '#f59e0b')]
          });
        }

        const normalizedType = pointType === 'rep' ? 'reputation' : pointType;
        const newAmount = removePoint(client, guildId, target.id, normalizedType, amount);

        const embed = createFameEmbed()
          .setTitle('✅ Points Removed')
          .setDescription(`Removed **${amount}** ${normalizedType} point(s) from ${target.username}\nNew total: **${newAmount}**`)
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }

      if (subcommand === 'reset') {
        const confirmation = args[1]?.toLowerCase();

        if (confirmation !== 'confirm') {
          const embed = createFameEmbed()
            .setTitle('⚠️ Reset All Fame Points')
            .setDescription(
              'This will reset **ALL** fame points for **this server only**!\n\n' +
              'To confirm, use: `fame reset confirm`'
            )
            .setFooter({ text: 'This action cannot be undone!' });

          return message.reply({ embeds: [embed] });
        }

        client.fameDB.prepare('DELETE FROM fame_points_guild WHERE guild_id = ?').run(guildId);
        client.fameDB.prepare('DELETE FROM fame_logs_guild WHERE guild_id = ?').run(guildId);
        client.fameDB.prepare('DELETE FROM fame_cooldowns_guild WHERE guild_id = ?').run(guildId);

        const embed = createFameEmbed()
          .setTitle('✅ Fame System Reset')
          .setDescription('All fame points for this server have been reset.')
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }
    }

    return message.reply({
      embeds: [buildUserReplyEmbed('Fame Failed', 'Unknown fame command.', '#f59e0b')]
    });
  }
};