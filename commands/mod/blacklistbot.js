const { EmbedBuilder } = require('discord.js');
const { ownerId } = require('../../config');

function buildInvalidUserEmbed() {
  return new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('❌ Invalid User')
    .setDescription('Provide a valid ping, user ID, exact username, or display name.');
}

async function resolveTargetUser(message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input);
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const id = raw.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = message.client.users.cache.get(id);
    if (cached) return cached;
    return await message.client.users.fetch(id).catch(() => null);
  }

  const lowered = raw.toLowerCase();

  const cachedUser = message.client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered
  );

  if (cachedUser) return cachedUser;

  if (message.guild) {
    const member = message.guild.members.cache.find(m =>
      m?.displayName?.toLowerCase() === lowered ||
      m?.user?.username?.toLowerCase() === lowered ||
      m?.user?.globalName?.toLowerCase() === lowered
    );

    if (member?.user) return member.user;
  }

  return null;
}

module.exports = {
  name: 'blacklistbot',
  aliases: ['bla', 'blr'],
  description: 'Blacklist or unblacklist a user from using the bot',
  category: 'mod',
  usage: 'blacklistbot <add|remove> <@user|user_id|username|display name>',

  async execute(client, message, args) {
    if (message.author.id !== ownerId) return;

    let sub = args[0]?.toLowerCase();
    const invokedAs = message.content.trim().split(/\s+/)[0].replace(/^\$/, '').toLowerCase();

    if (invokedAs === 'bla') sub = 'add';
    if (invokedAs === 'blr') sub = 'remove';

    if (sub !== 'add' && sub !== 'remove') {
      const helpEmbed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('Blacklist Bot')
        .setDescription(
          '**Usage:**\n' +
          '`blacklistbot add <@user|id|username|display name>` — Block user from bot\n' +
          '`blacklistbot remove <@user|id|username|display name>` — Unblock user\n\n' +
          '**Aliases:** `bla` = add, `blr` = remove'
        );

      return message.reply({ embeds: [helpEmbed] });
    }

    const targetInput = args[1];
    const targetUser = await resolveTargetUser(message, targetInput);

    if (!targetUser) {
      return message.reply({ embeds: [buildInvalidUserEmbed()] });
    }

    if (targetUser.id === ownerId) {
      const errEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Nice try');
      return message.reply({ embeds: [errEmbed] });
    }

    const db = client.prefixlessDB;
    db.prepare(`
      CREATE TABLE IF NOT EXISTS bot_blacklist (
        user_id TEXT PRIMARY KEY
      )
    `).run();

    if (sub === 'add') {
      const already = db.prepare('SELECT user_id FROM bot_blacklist WHERE user_id = ?').get(targetUser.id);
      if (already) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Already Blacklisted')
          .setDescription(`**${targetUser.tag}** is already blacklisted from the bot.`);
        return message.reply({ embeds: [embed] });
      }

      db.prepare('INSERT INTO bot_blacklist (user_id) VALUES (?)').run(targetUser.id);

      if (client.botBlacklist instanceof Set) {
        client.botBlacklist.add(targetUser.id);
      } else {
        client.botBlacklist = new Set(
          db.prepare('SELECT user_id FROM bot_blacklist').all().map(r => r.user_id)
        );
      }

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setAuthor({ name: 'Vanessa', iconURL: client.user.displayAvatarURL() })
        .setTitle('🚫 User Blacklisted')
        .setDescription(
          `**${targetUser.tag}** has been restricted from using Vanessa.\n\n` +
          `> You're restricted from using Vanessa.`
        )
        .addFields({ name: 'User ID', value: `\`${targetUser.id}\``, inline: true })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Action by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const exists = db.prepare('SELECT user_id FROM bot_blacklist WHERE user_id = ?').get(targetUser.id);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Not Blacklisted')
          .setDescription(`**${targetUser.tag}** isn't blacklisted.`);
        return message.reply({ embeds: [embed] });
      }

      db.prepare('DELETE FROM bot_blacklist WHERE user_id = ?').run(targetUser.id);

      if (client.botBlacklist instanceof Set) {
        client.botBlacklist.delete(targetUser.id);
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setAuthor({ name: 'Vanessa', iconURL: client.user.displayAvatarURL() })
        .setTitle('✅ Blacklist Removed')
        .setDescription(`**${targetUser.tag}** can now use Vanessa again.`)
        .addFields({ name: 'User ID', value: `\`${targetUser.id}\``, inline: true })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Action by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },
};