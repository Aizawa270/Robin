// commands/misc/fame.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DARK_GRAY = '#2b2d31';
const COOLDOWN_TIME = 43200000; // 12 hours
const ADMIN_ID = '852839588689870879';
const AUTHORIZED_ROLES = ['1447894643277561856', '1431646610752012420'];

function createFameEmbed() {
  const embed = new EmbedBuilder();
  embed.setColor(DARK_GRAY);
  embed._bypassUniversalHelper = true;
  return embed;
}

function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getUserPoints(client, userId) {
  if (!client.fameDB) return { reputation: 0, stupidity: 0, black: 0 };
  const row = client.fameDB.prepare('SELECT reputation, stupidity, black FROM fame_points WHERE user_id = ?').get(userId);
  return row || { reputation: 0, stupidity: 0, black: 0 };
}

function addPoint(client, userId, pointType) {
  if (!client.fameDB) return false;

  // Normalize point type
  const columnName = pointType === 'rep' ? 'reputation' : pointType;

  client.fameDB.prepare(`
    INSERT INTO fame_points (user_id, ${columnName}, last_updated)
    VALUES (?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      ${columnName} = ${columnName} + 1,
      last_updated = ?
  `).run(userId, Date.now(), Date.now());

  return true;
}

function logFameAction(client, giverId, receiverId, pointType) {
  if (!client.fameDB) return;
  client.fameDB.prepare(`
    INSERT INTO fame_logs (giver_id, receiver_id, point_type, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(giverId, receiverId, pointType, Date.now());
}

function checkCooldown(client, giverId, pointType) {
  if (!client.fameDB) return { onCooldown: false };

  const now = Date.now();

  const row = client.fameDB.prepare(`
    SELECT last_given FROM fame_cooldowns
    WHERE giver_id = ? AND point_type = ?
  `).get(giverId, pointType);

  if (row) {
    const timeLeft = COOLDOWN_TIME - (now - row.last_given);

    if (timeLeft > 0) {
      const hoursLeft = Math.floor(timeLeft / 3600000);
      const minutesLeft = Math.ceil((timeLeft % 3600000) / 60000);
      return { onCooldown: true, timeString: `${hoursLeft}h ${minutesLeft}m` };
    }
  }

  client.fameDB.prepare(`
    INSERT INTO fame_cooldowns (giver_id, point_type, last_given)
    VALUES (?, ?, ?)
    ON CONFLICT(giver_id, point_type) DO UPDATE SET
      last_given = ?
  `).run(giverId, pointType, now, now);

  return { onCooldown: false };
}

function hasAuthorizedRole(member) {
  return AUTHORIZED_ROLES.some(roleId => member.roles.cache.has(roleId));
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
      return message.reply('Fame system is unavailable.');
    }

    const subcommand = args[0]?.toLowerCase();

    if (!subcommand) {
      return;
    }

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
            value: '• `fame add <type> @user [amount]` - Add points (Admin only)\n• `fame remove <type> @user [amount]` - Remove points (Admin only)\n• `fame reset confirm` - Reset all points (Admin only)' 
          },
          { 
            name: '⏱️ Cooldown', 
            value: '12 hours per point type (global - affects all users)' 
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
    if (subcommand === 'lb' || subcommand === 'leaderboard' || message.content.toLowerCase().startsWith(`${client.getPrefix(message.guild.id)}famelb`)) {
      const topUsers = client.fameDB.prepare(`
        SELECT user_id, reputation, stupidity, black
        FROM fame_points
        ORDER BY reputation DESC
        LIMIT 10
      `).all();

      if (topUsers.length === 0) {
        const embed = createFameEmbed()
          .setTitle('Reputation Leaderboard')
          .setDescription('No fame points have been given yet!')
          .setFooter({ text: `Vynora • ${getCurrentTime()}` });
        return message.reply({ embeds: [embed] });
      }

      let leaderboardText = 'Top users by reputation points:\n\n';

      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        try {
          const member = await message.guild.members.fetch(user.user_id).catch(() => null);
          const displayName = member ? member.user.username : user.user_id;
          leaderboardText += `**${i + 1}. ${displayName}**\n${user.reputation} points\n\n`;
        } catch (e) {
          leaderboardText += `**${i + 1}. ${user.user_id}**\n${user.reputation} points\n\n`;
        }
      }

      const embed = createFameEmbed()
        .setTitle('Reputation Leaderboard')
        .setDescription(leaderboardText.trim())
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      return message.reply({ embeds: [embed] });
    }

    // PROFILE
    if (subcommand === 'profile') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null) ||
                     message.author;

      const points = getUserPoints(client, target.id);

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
          .setCustomId(`fame_rep:${target.id}`)
          .setLabel('Give Reputation')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`fame_stupidity:${target.id}`)
          .setLabel('Give Stupidity')
          .setStyle(ButtonStyle.Danger)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fame_black:${target.id}`)
          .setLabel('Give Black Point')
          .setStyle(ButtonStyle.Secondary)
      );

      const reply = await message.reply({ embeds: [embed], components: [row1, row2] });

      const collector = reply.createMessageComponentCollector({ time: 300000 });

      collector.on('collect', async (interaction) => {
        const [action, targetId] = interaction.customId.split(':');
        const pointType = action.replace('fame_', '');
        const giverId = interaction.user.id;

        if (targetId === giverId) {
          return interaction.reply({ 
            content: `You cannot give yourself ${pointType} points!`, 
            ephemeral: true 
          });
        }

        const cooldown = checkCooldown(client, giverId, pointType);
        if (cooldown.onCooldown) {
          return interaction.reply({ 
            content: `You can give ${pointType} points again in ${cooldown.timeString}.`, 
            ephemeral: true 
          });
        }

        addPoint(client, targetId, pointType);
        logFameAction(client, giverId, targetId, pointType);

        const updatedPoints = getUserPoints(client, targetId);
        const targetUser = await client.users.fetch(targetId);

        const updatedEmbed = createFameEmbed()
          .setTitle(`${targetUser.username}'s Fame Points`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .addFields(
            { name: 'Reputation Points', value: updatedPoints.reputation.toString() },
            { name: 'Stupidity Points', value: updatedPoints.stupidity.toString() },
            { name: 'Black Points', value: updatedPoints.black.toString() }
          )
          .setFooter({ text: `Vynora • ${getCurrentTime()}` });

        await reply.edit({ embeds: [updatedEmbed], components: [row1, row2] });

        const colors = { rep: '#00ff00', reputation: '#00ff00', stupidity: '#ff6b6b', black: '#2b2d31' };
        const responseEmbed = new EmbedBuilder()
          .setDescription(`Successfully gave ${targetUser.username} a ${pointType} point!`)
          .setColor(colors[pointType] || DARK_GRAY);
        responseEmbed._bypassUniversalHelper = true;

        await interaction.reply({ embeds: [responseEmbed], ephemeral: true });
      });

      collector.on('end', () => {
        reply.edit({ components: [] }).catch(() => {});
      });

      return;
    }

    // GIVE REPUTATION
    if (subcommand === 'rep' || subcommand === 'reputation') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);

      if (!target) return message.reply('Please mention a user or provide a user ID.');
      if (target.id === message.author.id) return message.reply('You cannot give yourself reputation points!');
      if (target.bot) return message.reply('You cannot give reputation points to bots!');

      const cooldown = checkCooldown(client, message.author.id, 'reputation');
      if (cooldown.onCooldown) {
        return message.reply(`You can give reputation points again in ${cooldown.timeString}.`);
      }

      addPoint(client, target.id, 'reputation');
      logFameAction(client, message.author.id, target.id, 'reputation');

      const embed = createFameEmbed()
        .setTitle('Reputation Point Given')
        .setDescription(`${message.author.username} gave ${target.username} a reputation point.`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      return message.reply({ embeds: [embed] });
    }

    // GIVE STUPIDITY
    if (subcommand === 'stupidity' || subcommand === 'stupid') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);

      if (!target) return message.reply('Please mention a user or provide a user ID.');
      if (target.id === message.author.id) return message.reply('You cannot give yourself stupidity points!');
      if (target.bot) return message.reply('You cannot give stupidity points to bots!');

      const cooldown = checkCooldown(client, message.author.id, 'stupidity');
      if (cooldown.onCooldown) {
        return message.reply(`You can give stupidity points again in ${cooldown.timeString}.`);
      }

      addPoint(client, target.id, 'stupidity');
      logFameAction(client, message.author.id, target.id, 'stupidity');

      const embed = createFameEmbed()
        .setTitle('Stupidity Point Given')
        .setDescription(`${message.author.username} gave ${target.username} a stupidity point.`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      return message.reply({ embeds: [embed] });
    }

    // GIVE BLACK POINT
    if (subcommand === 'black' || subcommand === 'blackpoint') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);

      if (!target) return message.reply('Please mention a user or provide a user ID.');
      if (target.id === message.author.id) return message.reply('You cannot give yourself black points!');
      if (target.bot) return message.reply('You cannot give black points to bots!');

      const cooldown = checkCooldown(client, message.author.id, 'black');
      if (cooldown.onCooldown) {
        return message.reply(`You can give black points again in ${cooldown.timeString}.`);
      }

      addPoint(client, target.id, 'black');
      logFameAction(client, message.author.id, target.id, 'black');

      const embed = createFameEmbed()
        .setTitle('Black Point Given')
        .setDescription(`${message.author.username} gave ${target.username} a black point.`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setFooter({ text: `Vynora • ${getCurrentTime()}` });

      return message.reply({ embeds: [embed] });
    }

    // ADMIN COMMANDS (ADD/REMOVE)
    if (message.author.id === ADMIN_ID || hasAuthorizedRole(message.member)) {
      if (subcommand === 'add') {
        const pointType = args[1]?.toLowerCase();
        const target = message.mentions.users.first() || 
                       (args[2] ? await client.users.fetch(args[2]).catch(() => null) : null);
        const amount = parseInt(args[3]) || 1;

        if (!['rep', 'reputation', 'stupidity', 'black'].includes(pointType)) {
          return message.reply('Invalid point type! Use: `rep`, `stupidity`, or `black`');
        }

        if (!target) return message.reply('Please mention a user or provide a user ID.');

        const normalizedType = pointType === 'rep' ? 'reputation' : pointType;

        for (let i = 0; i < amount; i++) {
          addPoint(client, target.id, normalizedType);
        }

        const embed = createFameEmbed()
          .setTitle('✅ Points Added')
          .setDescription(`Added **${amount}** ${normalizedType} point(s) to ${target.username}`)
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }

      if (subcommand === 'remove') {
        const pointType = args[1]?.toLowerCase();
        const target = message.mentions.users.first() || 
                       (args[2] ? await client.users.fetch(args[2]).catch(() => null) : null);
        const amount = parseInt(args[3]) || 1;

        if (!['rep', 'reputation', 'stupidity', 'black'].includes(pointType)) {
          return message.reply('Invalid point type! Use: `rep`, `stupidity`, or `black`');
        }

        if (!target) return message.reply('Please mention a user or provide a user ID.');

        const normalizedType = pointType === 'rep' ? 'reputation' : pointType;
        const current = getUserPoints(client, target.id)[normalizedType];
        const newAmount = Math.max(0, current - amount);

        client.fameDB.prepare(`
          UPDATE fame_points
          SET ${normalizedType} = ?
          WHERE user_id = ?
        `).run(newAmount, target.id);

        const embed = createFameEmbed()
          .setTitle('✅ Points Removed')
          .setDescription(`Removed **${amount}** ${normalizedType} point(s) from ${target.username}\nNew total: **${newAmount}**`)
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }
    }

    // RESET COMMAND (ADMIN ONLY - NOT FOR AUTHORIZED ROLES)
    if (message.author.id === ADMIN_ID) {
      if (subcommand === 'reset') {
        const confirmation = args[1]?.toLowerCase();

        if (confirmation !== 'confirm') {
          const embed = createFameEmbed()
            .setTitle('⚠️ Reset All Fame Points')
            .setDescription(
              'This will reset **ALL** fame points for **EVERY** user!\n\n' +
              'To confirm, use: `fame reset confirm`'
            )
            .setFooter({ text: 'This action cannot be undone!' });

          return message.reply({ embeds: [embed] });
        }

        client.fameDB.prepare('DELETE FROM fame_points').run();
        client.fameDB.prepare('DELETE FROM fame_logs').run();
        client.fameDB.prepare('DELETE FROM fame_cooldowns').run();

        const embed = createFameEmbed()
          .setTitle('✅ Fame System Reset')
          .setDescription('All fame points have been reset for all users.')
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }
    }
  }
};