const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { resolveUser: universalResolveUser } = require('../../handlers/universalHelper');

let config = null;
try {
  config = require('../../config');
} catch {}

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
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

async function resolveTargetUser(client, message, raw) {
  if (!raw) return null;

  if (typeof message.resolveUser === 'function') {
    const user = await message.resolveUser(raw).catch(() => null);
    if (user) return user;
  }

  if (typeof universalResolveUser === 'function') {
    const user = await universalResolveUser(client, message, raw).catch(() => null);
    if (user) return user;
  }

  const query = String(raw).trim();
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

  return null;
}

module.exports = {
  name: 'purgeuser',
  description: 'Delete recent messages from a specific user',
  category: 'mod',
  usage: 'purgeuser <@user|userID|username|display name> <amount>',
  aliases: ['user-purge', 'purge-user'],
  async execute(client, message, args) {
    if (!message.guild) return;

    const app = client.application?.partial ? await client.application.fetch() : client.application;
    const ownerId = app?.owner?.id || app?.owner?.ownerUserId || null;

    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    const isBotOwnerUser = message.author.id === ownerId || isBotOwner(client, message.author.id);
    const isServerOwner = message.author.id === message.guild.ownerId;

    if (!isAdmin && !isBotOwnerUser && !isServerOwner) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ff0000',
            'Purge Failed',
            'You need Administrator permission, be the bot owner, or be the server owner to use this command.'
          )
        ]
      });
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({
        embeds: [makeEmbed('#ff0000', 'Purge Failed', 'I need the Manage Messages permission to purge messages.')]
      });
    }

    if (!botMember?.permissions?.has(PermissionFlagsBits.ReadMessageHistory)) {
      return message.reply({
        embeds: [makeEmbed('#ff0000', 'Purge Failed', 'I need the Read Message History permission to fetch messages.')]
      });
    }

    if (args.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('Purge User Command')
        .setDescription('Delete recent messages from a specific user.')
        .addFields(
          {
            name: 'Usage',
            value: '`purgeuser <@user|userID|username|display name> <amount>`\n`user-purge <@user|userID|username|display name> <amount>`',
            inline: false
          },
          {
            name: 'Examples',
            value: '`purgeuser @Alice 50`\n`purgeuser 123456789012345678 100`\n`purgeuser Alice 200`\n`purgeuser "Alice Smith" 30`',
            inline: false
          },
          {
            name: 'Notes',
            value: '• Deletes the most recent messages from the user first\n• Maximum 500 messages\n• Only works on messages from the last 14 days\n• Requires Administrator, Bot Owner, or Server Owner',
            inline: false
          }
        )
        .setFooter({ text: 'Use with caution - this cannot be undone!' });

      return message.reply({ embeds: [embed] });
    }

    const amountArg = args[args.length - 1];
    const amount = Number(amountArg);

    if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ff0000',
            'Purge Failed',
            'Please provide a valid whole number between 1-500.\n\n**Usage:** `purgeuser <@user|userID|username|display name> <amount>`'
          )
        ]
      });
    }

    const targetArg = args.slice(0, -1).join(' ').trim();
    const target = await resolveTargetUser(client, message, targetArg);

    if (!target) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ff0000',
            'Purge Failed',
            'Could not find that user. Use a mention, user ID, username, or display name.'
          )
        ]
      });
    }

    await message.delete().catch(() => {});

    try {
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
      const allUserMessages = [];
      let lastId = null;

      while (allUserMessages.length < amount) {
        const fetched = await message.channel.messages.fetch({
          limit: 100,
          ...(lastId ? { before: lastId } : {})
        });

        if (!fetched.size) break;

        const userMessages = fetched.filter(m =>
          m.author.id === target.id &&
          m.createdTimestamp > twoWeeksAgo
        );

        for (const msg of userMessages.values()) {
          if (!allUserMessages.some(m => m.id === msg.id)) {
            allUserMessages.push(msg);
          }
        }

        lastId = fetched.last().id;
        if (fetched.last().createdTimestamp < twoWeeksAgo) break;
        if (fetched.size < 100) break;
      }

      if (allUserMessages.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription(`No messages found from ${target.tag} in the last 14 days.`);

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }

      allUserMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      const toDelete = allUserMessages.slice(0, amount);

      let deletedCount = 0;
      const chunks = [];
      for (let i = 0; i < toDelete.length; i += 100) {
        chunks.push(toDelete.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        const deleted = await message.channel.bulkDelete(chunk.map(msg => msg.id), true);
        deletedCount += deleted.size;
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setDescription(`Successfully deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} from ${target.tag}`)
        .setFooter({ text: `Deleted by ${message.author.tag}` });

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error('[Purge User] Error:', error);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(`Failed to purge messages: ${error.message}`);

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
  }
};