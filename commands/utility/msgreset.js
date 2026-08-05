const { EmbedBuilder } = require('discord.js');

let config = null;
try {
  config = require('../../config');
} catch {}

function makeEmbed(message, options = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed(options);
    if (options.fields) embed.addFields(options.fields);
    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.footer) embed.setFooter({ text: options.footer });
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  return embed;
}

function getBotOwnerIds(client) {
  const ids = new Set();

  if (config?.ownerId) ids.add(String(config.ownerId));
  if (Array.isArray(config?.ownerIds)) {
    for (const id of config.ownerIds) ids.add(String(id));
  }
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (Array.isArray(client?.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));

  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function canManage(client, message) {
  if (!message.guild || !message.member) return false;
  if (message.guild.ownerId === message.author.id) return true;
  if (isBotOwner(client, message.author.id)) return true;
  return false;
}

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input).catch(() => null);
  }

  const query = String(input).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();
  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});
    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered ||
      m?.displayName?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;
  }

  return null;
}

module.exports = {
  name: 'msgreset',
  description: 'Reset message tracking data.',
  category: 'utility',
  usage: '$msgreset all confirm | $msgreset daily confirm | $msgreset user @user confirm',
  aliases: [],
  hidden: true,

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!canManage(client, message)) {
      return message.reply({
        embeds: [
          makeEmbed(message, {
            title: 'Message Reset Failed',
            description: 'Only the server owner or bot owner can use this command.',
          }),
        ],
      });
    }

    if (!client.messageTracker) {
      return message.reply({
        embeds: [
          makeEmbed(message, {
            title: 'Message Tracker Unavailable',
            description: 'The message tracker is not initialized.',
          }),
        ],
      });
    }

    const sub = (args[0] || '').toLowerCase();

    if (!sub || !['all', 'daily', 'weekly', 'monthly', 'user'].includes(sub)) {
      return message.reply({
        embeds: [
          makeEmbed(message, {
            title: 'Message Reset',
            description: [
              '`$msgreset all confirm`',
              '`$msgreset daily confirm`',
              '`$msgreset weekly confirm`',
              '`$msgreset monthly confirm`',
              '`$msgreset user @user confirm`',
            ].join('\n'),
          }),
        ],
      });
    }

    if (sub === 'user') {
      const target = await resolveTargetUser(client, message, args[1]);
      const confirmation = (args[2] || '').toLowerCase();

      if (!target) {
        return message.reply({
          embeds: [
            makeEmbed(message, {
              title: 'Message Reset Failed',
              description: 'Provide a valid user mention, ID, or username.',
            }),
          ],
        });
      }

      if (confirmation !== 'confirm') {
        return message.reply({
          embeds: [
            makeEmbed(message, {
              title: 'Message Reset',
              description: `Use \`$msgreset user ${target.id} confirm\` to reset ${target.username}.`,
            }),
          ],
        });
      }

      client.messageTracker.resetUser(message.guild.id, target.id);

      return message.reply({
        embeds: [
          makeEmbed(message, {
            title: 'Message Reset',
            description: `Message stats for ${target.username} were reset in this server.`,
          }),
        ],
      });
    }

    const confirmation = (args[1] || '').toLowerCase();
    if (confirmation !== 'confirm') {
      return message.reply({
        embeds: [
          makeEmbed(message, {
            title: 'Message Reset',
            description: `Use \`$msgreset ${sub} confirm\` to reset the ${sub} counters.`,
          }),
        ],
      });
    }

    client.messageTracker.resetGuild(message.guild.id, sub);

    return message.reply({
      embeds: [
        makeEmbed(message, {
          title: 'Message Reset',
          description: sub === 'all'
            ? 'All message tracking counters were reset for this server.'
            : `The ${sub} counters were reset for this server.`,
        }),
      ],
    });
  },
};