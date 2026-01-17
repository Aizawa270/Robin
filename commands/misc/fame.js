// commands/misc/fame.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
let fameDB;
try {
  const DATA_DIR = path.join(__dirname, '..', '..', 'data');
  fameDB = new Database(path.join(DATA_DIR, 'fame.sqlite'));
  fameDB.pragma('journal_mode = WAL');

  fameDB.prepare(`
    CREATE TABLE IF NOT EXISTS fame_points (
      user_id TEXT PRIMARY KEY,
      reputation INTEGER DEFAULT 0,
      stupidity INTEGER DEFAULT 0,
      black INTEGER DEFAULT 0,
      last_updated INTEGER DEFAULT (strftime('%s','now')*1000)
    )
  `).run();

  fameDB.prepare(`
    CREATE TABLE IF NOT EXISTS fame_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      giver_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      point_type TEXT NOT NULL,
      timestamp INTEGER DEFAULT (strftime('%s','now')*1000)
    )
  `).run();
} catch (err) {
  console.error('[Fame] DB init failed:', err);
}

const LIGHT_PINK = '#FF69B4';
const COOLDOWN_TIME = 43200000; // 12 hours in milliseconds
const cooldowns = new Map();
const ADMIN_ID = '852839588689870879';

function getUserPoints(userId) {
  if (!fameDB) return { reputation: 0, stupidity: 0, black: 0 };
  const row = fameDB.prepare('SELECT reputation, stupidity, black FROM fame_points WHERE user_id = ?').get(userId);
  return row || { reputation: 0, stupidity: 0, black: 0 };
}

function addPoint(userId, pointType) {
  if (!fameDB) return false;

  fameDB.prepare(`
    INSERT INTO fame_points (user_id, ${pointType}, last_updated)
    VALUES (?, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      ${pointType} = ${pointType} + 1,
      last_updated = ?
  `).run(userId, Date.now(), Date.now());

  return true;
}

function logFameAction(giverId, receiverId, pointType) {
  if (!fameDB) return;
  fameDB.prepare(`
    INSERT INTO fame_logs (giver_id, receiver_id, point_type, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(giverId, receiverId, pointType, Date.now());
}

function checkCooldown(userId, targetId, pointType) {
  const key = `${userId}-${targetId}-${pointType}`;
  const now = Date.now();
  const lastUsed = cooldowns.get(key);

  if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
    const timeLeft = COOLDOWN_TIME - (now - lastUsed);
    const hoursLeft = Math.floor(timeLeft / 3600000);
    const minutesLeft = Math.ceil((timeLeft % 3600000) / 60000);
    return { onCooldown: true, timeString: `${hoursLeft}h ${minutesLeft}m` };
  }

  cooldowns.set(key, now);
  return { onCooldown: false };
}

module.exports = {
  name: 'fame',
  description: 'Fame point system - reputation, stupidity, and black points',
  category: 'misc',
  usage: 'fame <rep/stupidity/black/profile/lb/help> [user]',
  aliases: ['famelb'],
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!fameDB) {
      return message.reply('Fame system is unavailable.');
    }

    const subcommand = args[0]?.toLowerCase();

    // HELP COMMAND
    if (subcommand === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('Fame System - Commands')
        .setDescription('Give reputation, stupidity, or black points to other users!')
        .setColor(LIGHT_PINK)
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
            value: '12 hours per point type per user' 
          },
          { 
            name: '💡 Tip', 
            value: 'Use `fame profile @user` to quickly give points using buttons!' 
          }
        )
        .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });

      return message.reply({ embeds: [embed] });
    }

    // LEADERBOARD
    if (!subcommand || subcommand === 'lb' || subcommand === 'leaderboard' || message.content.toLowerCase().startsWith(`${client.getPrefix(message.guild.id)}famelb`)) {
      const topUsers = fameDB.prepare(`
        SELECT user_id, reputation, stupidity, black
        FROM fame_points
        ORDER BY reputation DESC
        LIMIT 10
      `).all();

      if (topUsers.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('Reputation Leaderboard')
          .setDescription('No fame points have been given yet!')
          .setColor(LIGHT_PINK)
          .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });
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

      const embed = new EmbedBuilder()
        .setTitle('Reputation Leaderboard')
        .setDescription(leaderboardText.trim())
        .setColor(LIGHT_PINK)
        .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });

      return message.reply({ embeds: [embed] });
    }

    // PROFILE
    if (subcommand === 'profile') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null) ||
                     message.author;

      const points = getUserPoints(target.id);

      const embed = new EmbedBuilder()
        .setTitle(`${target.username}'s Fame Points`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor(LIGHT_PINK)
        .addFields(
          { name: 'Reputation Points', value: points.reputation.toString() },
          { name: 'Stupidity Points', value: points.stupidity.toString() },
          { name: 'Black Points', value: points.black.toString() }
        )
        .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}` });

      // Don't show buttons if target is a bot
      if (target.bot) {
        return message.reply({ embeds: [embed] });
      }

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fame_rep:${target.id}:${message.author.id}`)
          .setLabel('Give Reputation')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`fame_stupidity:${target.id}:${message.author.id}`)
          .setLabel('Give Stupidity')
          .setStyle(ButtonStyle.Danger)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fame_black:${target.id}:${message.author.id}`)
          .setLabel('Give Black Point')
          .setStyle(ButtonStyle.Secondary)
      );

      const reply = await message.reply({ embeds: [embed], components: [row1, row2] });

      // Button collector
      const collector = reply.createMessageComponentCollector({ time: 300000 }); // 5 minutes

      collector.on('collect', async (interaction) => {
        // Check if the person clicking is the original author
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: 'These buttons are not for you!', ephemeral: true });
        }

        const [action, targetId, authorId] = interaction.customId.split(':');
        const pointType = action.replace('fame_', '');

        // Check if trying to give points to self
        if (targetId === authorId) {
          return interaction.reply({ 
            content: `You cannot give yourself ${pointType} points!`, 
            ephemeral: true 
          });
        }

        // Check cooldown
        const cooldown = checkCooldown(authorId, targetId, pointType);
        if (cooldown.onCooldown) {
          return interaction.reply({ 
            content: `You can give ${pointType} to this user again in ${cooldown.timeString}.`, 
            ephemeral: true 
          });
        }

        // Add point
        addPoint(targetId, pointType);
        logFameAction(authorId, targetId, pointType);

        // Fetch updated points
        const updatedPoints = getUserPoints(targetId);
        const targetUser = await client.users.fetch(targetId);

        // Update embed
        const updatedEmbed = new EmbedBuilder()
          .setTitle(`${targetUser.username}'s Fame Points`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .setColor(LIGHT_PINK)
          .addFields(
            { name: 'Reputation Points', value: updatedPoints.reputation.toString() },
            { name: 'Stupidity Points', value: updatedPoints.stupidity.toString() },
            { name: 'Black Points', value: updatedPoints.black.toString() }
          )
          .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}` });

        await reply.edit({ embeds: [updatedEmbed], components: [row1, row2] });

        const colors = { reputation: '#00ff00', stupidity: '#ff6b6b', black: '#2b2d31' };
        const responseEmbed = new EmbedBuilder()
          .setDescription(`Successfully gave ${targetUser.username} a ${pointType} point!`)
          .setColor(colors[pointType]);

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

      if (!target) {
        return message.reply('Please mention a user or provide a user ID.');
      }

      if (target.id === message.author.id) {
        return message.reply('You cannot give yourself reputation points!');
      }

      if (target.bot) {
        return message.reply('You cannot give reputation points to bots!');
      }

      const cooldown = checkCooldown(message.author.id, target.id, 'reputation');
      if (cooldown.onCooldown) {
        return message.reply(`You can give reputation to this user again in ${cooldown.timeString}.`);
      }

      addPoint(target.id, 'reputation');
      logFameAction(message.author.id, target.id, 'reputation');

      const embed = new EmbedBuilder()
        .setTitle('Reputation Point Given')
        .setDescription(`${message.author.username} gave ${target.username} a reputation point.`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor('#00ff00')
        .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });

      return message.reply({ embeds: [embed] });
    }

    // GIVE STUPIDITY
    if (subcommand === 'stupidity' || subcommand === 'stupid') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);

      if (!target) {
        return message.reply('Please mention a user or provide a user ID.');
      }

      if (target.id === message.author.id) {
        return message.reply('You cannot give yourself stupidity points!');
      }

      if (target.bot) {
        return message.reply('You cannot give stupidity points to bots!');
      }

      const cooldown = checkCooldown(message.author.id, target.id, 'stupidity');
      if (cooldown.onCooldown) {
        return message.reply(`You can give stupidity to this user again in ${cooldown.timeString}.`);
      }

      addPoint(target.id, 'stupidity');
      logFameAction(message.author.id, target.id, 'stupidity');

      const embed = new EmbedBuilder()
        .setTitle('Stupidity Point Given')
        .setDescription(`${message.author.username} gave ${target.username} a stupidity point.`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor('#ff6b6b')
        .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });

      return message.reply({ embeds: [embed] });
    }

    // GIVE BLACK POINT
    if (subcommand === 'black' || subcommand === 'blackpoint') {
      const target = message.mentions.users.first() || 
                     (args[1] ? await client.users.fetch(args[1]).catch(() => null) : null);

      if (!target) {
        return message.reply('Please mention a user or provide a user ID.');
      }

      if (target.id === message.author.id) {
        return message.reply('You cannot give yourself black points!');
      }

      if (target.bot) {
        return message.reply('You cannot give black points to bots!');
      }

      const cooldown = checkCooldown(message.author.id, target.id, 'black');
      if (cooldown.onCooldown) {
        return message.reply(`You can give black points to this user again in ${cooldown.timeString}.`);
      }

      addPoint(target.id, 'black');
      logFameAction(message.author.id, target.id, 'black');

      const embed = new EmbedBuilder()
        .setTitle('Black Point Given')
        .setDescription(`${message.author.username} gave ${target.username} a black point.`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor('#2b2d31')
        .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });

      return message.reply({ embeds: [embed] });
    }

    // ADMIN COMMANDS
    if (message.author.id === ADMIN_ID) {
      // ADD POINTS
      if (subcommand === 'add') {
        const pointType = args[1]?.toLowerCase();
        const target = message.mentions.users.first() || 
                       (args[2] ? await client.users.fetch(args[2]).catch(() => null) : null);
        const amount = parseInt(args[3]) || 1;

        if (!['rep', 'reputation', 'stupidity', 'black'].includes(pointType)) {
          return message.reply('Invalid point type! Use: `rep`, `stupidity`, or `black`');
        }

        if (!target) {
          return message.reply('Please mention a user or provide a user ID.');
        }

        const normalizedType = pointType === 'rep' ? 'reputation' : pointType;

        for (let i = 0; i < amount; i++) {
          addPoint(target.id, normalizedType);
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Points Added')
          .setDescription(`Added **${amount}** ${normalizedType} point(s) to ${target.username}`)
          .setColor('#00ff00')
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }

      // REMOVE POINTS
      if (subcommand === 'remove') {
        const pointType = args[1]?.toLowerCase();
        const target = message.mentions.users.first() || 
                       (args[2] ? await client.users.fetch(args[2]).catch(() => null) : null);
        const amount = parseInt(args[3]) || 1;

        if (!['rep', 'reputation', 'stupidity', 'black'].includes(pointType)) {
          return message.reply('Invalid point type! Use: `rep`, `stupidity`, or `black`');
        }

        if (!target) {
          return message.reply('Please mention a user or provide a user ID.');
        }

        const normalizedType = pointType === 'rep' ? 'reputation' : pointType;
        const current = getUserPoints(target.id)[normalizedType];
        const newAmount = Math.max(0, current - amount);

        fameDB.prepare(`
          UPDATE fame_points
          SET ${normalizedType} = ?
          WHERE user_id = ?
        `).run(newAmount, target.id);

        const embed = new EmbedBuilder()
          .setTitle('✅ Points Removed')
          .setDescription(`Removed **${amount}** ${normalizedType} point(s) from ${target.username}\nNew total: **${newAmount}**`)
          .setColor('#ff6b6b')
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }

      // RESET ALL
      if (subcommand === 'reset') {
        const confirmation = args[1]?.toLowerCase();

        if (confirmation !== 'confirm') {
          const embed = new EmbedBuilder()
            .setTitle('⚠️ Reset All Fame Points')
            .setDescription(
              'This will reset **ALL** fame points for **EVERY** user!\n\n' +
              'To confirm, use: `fame reset confirm`'
            )
            .setColor('#ff0000')
            .setFooter({ text: 'This action cannot be undone!' });

          return message.reply({ embeds: [embed] });
        }

        fameDB.prepare('DELETE FROM fame_points').run();
        fameDB.prepare('DELETE FROM fame_logs').run();
        cooldowns.clear();

        const embed = new EmbedBuilder()
          .setTitle('✅ Fame System Reset')
          .setDescription('All fame points have been reset for all users.')
          .setColor('#00ff00')
          .setFooter({ text: 'Admin Action' });

        return message.reply({ embeds: [embed] });
      }
    }

    // DEFAULT HELP
    const embed = new EmbedBuilder()
      .setTitle('Fame System')
      .setDescription(
        'Give reputation, stupidity, or black points to other users!\n\n' +
        '**Quick Commands:**\n' +
        '• `fame rep @user` - Give reputation\n' +
        '• `fame stupidity @user` - Give stupidity\n' +
        '• `fame black @user` - Give black point\n' +
        '• `fame profile [@user]` - View profile\n' +
        '• `fame lb` - View leaderboard\n\n' +
        'Use `fame help` for full command list!'
      )
      .setColor(LIGHT_PINK)
      .setFooter({ text: `Vynora • ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}` });

    return message.reply({ embeds: [embed] });
  }
};
