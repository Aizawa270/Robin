const { EmbedBuilder } = require('discord.js');

let config = null;
try {
  config = require('../../config');
} catch {}

const OWNER_ID = config?.ownerId ? String(config.ownerId) : null;

function buildInvalidUserEmbed() {
  return new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('❌ Invalid User')
    .setDescription('Provide a valid ping, user ID, or exact username.');
}

async function resolveTargetUser(message, input) {
  if (!input) return null;

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
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;

    const fetched = await message.guild.members.fetch().catch(() => null);
    if (fetched?.size) {
      const exact = fetched.find(m =>
        m?.user?.username?.toLowerCase() === lowered
      );
      if (exact?.user) return exact.user;
    }
  }

  return null;
}

module.exports = {
  name: 'blacklistbot',
  aliases: ['bla', 'blr'],
  description: 'Blacklist or unblacklist a user from using the bot',
  category: 'mod',
  usage: 'blacklistbot <add|remove> <@user|user_id|username>',

  async execute(client, message, args) {
    if (!OWNER_ID || message.author.id !== OWNER_ID) return;

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
          '`blacklistbot add <@user|id|username>` — Block user from bot\n' +
          '`blacklistbot remove <@user|id|username>` — Unblock user\n\n' +
          '**Aliases:** `bla` = add, `blr` = remove'
        );

      return message.reply({ embeds: [helpEmbed] });
    }

    const targetInput = args[1];
    const targetUser = await resolveTargetUser(message, targetInput);

    if (!targetUser) {
      return message.reply({ embeds: [buildInvalidUserEmbed()] });
    }

    if (targetUser.id === OWNER_ID) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Nice try')
        ]
      });
    }

    if (!client.prefixlessDB) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor('#ef4444').setDescription('Database unavailable.')]
      });
    }

    client.prefixlessDB.prepare(`
      CREATE TABLE IF NOT EXISTS bot_blacklist (
        user_id TEXT PRIMARY KEY
      )
    `).run();

    if (sub === 'add') {
      const already = client.prefixlessDB.prepare('SELECT user_id FROM bot_blacklist WHERE user_id = ?').get(targetUser.id);
      if (already) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Already Blacklisted')
          .setDescription(`**${targetUser.tag}** is already blacklisted from the bot.`);
        return message.reply({ embeds: [embed] });
      }

      client.prefixlessDB.prepare('INSERT INTO bot_blacklist (user_id) VALUES (?)').run(targetUser.id);

      if (client.botBlacklist instanceof Set) {
        client.botBlacklist.add(targetUser.id);
      } else {
        client.botBlacklist = new Set(
          client.prefixlessDB.prepare('SELECT user_id FROM bot_blacklist').all().map(r => r.user_id)
        );
      }

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
        .setTitle('🚫 User Blacklisted')
        .setDescription(
          `**${targetUser.tag}** has been restricted from using the bot.\n\n` +
          `> You're restricted from using this bot.`
        )
        .addFields({ name: 'User ID', value: `\`${targetUser.id}\``, inline: true })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Action by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const exists = client.prefixlessDB.prepare('SELECT user_id FROM bot_blacklist WHERE user_id = ?').get(targetUser.id);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Not Blacklisted')
          .setDescription(`**${targetUser.tag}** isn't blacklisted.`);
        return message.reply({ embeds: [embed] });
      }

      client.prefixlessDB.prepare('DELETE FROM bot_blacklist WHERE user_id = ?').run(targetUser.id);

      if (client.botBlacklist instanceof Set) {
        client.botBlacklist.delete(targetUser.id);
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
        .setTitle('✅ Blacklist Removed')
        .setDescription(`**${targetUser.tag}** can now use the bot again.`)
        .addFields({ name: 'User ID', value: `\`${targetUser.id}\``, inline: true })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Action by ${message.author.tag}` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  },
};