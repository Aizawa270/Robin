const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

let config = null;
try {
config = require('../../config');
} catch {}

function getBotOwnerIds(client) {
const ids = new Set();

if (config?.ownerId) ids.add(String(config.ownerId));
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

function makeEmbed(color, title, description) {
return new EmbedBuilder()
.setColor(color)
.setTitle(title)
.setDescription(description)
.setTimestamp();
}

module.exports = {
name: 'changeprefix',
aliases: ['cp'],
hidden: true,
description: 'Change the bot prefix for this server.',
usage: '$changeprefix <newPrefix>',
category: 'utility',

async execute(client, message, args) {
if (!message.guild) {
return message.reply({
embeds: [
makeEmbed('#ef4444', 'Prefix Change Failed', 'This command can only be used inside a server.')
]
});
}

const isServerOwner = message.author.id === message.guild.ownerId;
const isOwner = isBotOwner(client, message.author.id);

if (!isServerOwner && !isOwner) {
  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Prefix Change Failed', 'Only the bot owner or server owner can change the prefix.')
    ]
  });
}

const newPrefix = args[0];

if (!newPrefix) {
  return message.reply({
    embeds: [
      makeEmbed(
        '#f59e0b',
        'Prefix Change Usage',
        `Provide a new prefix.\n\nExample:\n\`${message.prefix || '$'}changeprefix !\``
      )
    ]
  });
}

if (newPrefix.length > 5) {
  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Prefix Change Failed', 'The prefix cannot be longer than 5 characters.')
    ]
  });
}

if (/\s/.test(newPrefix)) {
  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Prefix Change Failed', 'The prefix cannot contain spaces.')
    ]
  });
}

if (newPrefix.includes('<@') || newPrefix.includes('>')) {
  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Prefix Change Failed', 'Mention-based prefixes are not allowed.')
    ]
  });
}

if (!client.prefixDB) {
  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Prefix Change Failed', 'Prefix database is not initialized.')
    ]
  });
}

try {
  const oldPrefix = client.getPrefix?.(message.guild.id) || '$';

  client.prefixDB.prepare(`
    INSERT OR REPLACE INTO prefixes (guild_id, prefix)
    VALUES (?, ?)
  `).run(message.guild.id, newPrefix);

  return message.reply({
    embeds: [
      makeEmbed(
        '#22c55e',
        'Prefix Updated',
        `Server prefix updated successfully.\n\n**Old prefix:** \`${oldPrefix}\`\n**New prefix:** \`${newPrefix}\`\n\nUse \`${newPrefix}help\` to open the help menu.`
      )
    ]
  });
} catch (error) {
  console.error('[ChangePrefix] Failed to change prefix:', error);
  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Prefix Change Failed', 'Failed to change the server prefix.')
    ]
  });
}

},
};