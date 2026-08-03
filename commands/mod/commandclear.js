const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

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
if (Array.isArray(client?.ownerIds)) {
for (const id of client.ownerIds) ids.add(String(id));
}
if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));

return ids;
}

function isBotOwner(client, userId) {
return getBotOwnerIds(client).has(String(userId));
}

function canUseCommandClear(client, member) {
if (!member) return false;
if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
if (member.id === member.guild?.ownerId) return true;
if (isBotOwner(client, member.id)) return true;
return false;
}

function sleep(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
name: 'commandclear',
description: 'Delete the most recent bot messages in the channel.',
category: 'mod',
usage: '$commandclear <amount>',
async execute(client, message, args) {
if (!message.guild) return;

const prefix = client.getPrefix?.(message.guild.id) || '$';
const amount = parseInt(args[0], 10);

if (!canUseCommandClear(client, message.member)) {
  return message.reply({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Command Clear Failed',
        'You do not have permission to use this command.'
      )
    ]
  });
}

const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
if (!botMember?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
  return message.reply({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Command Clear Failed',
        'I need **Manage Messages** permission.'
      )
    ]
  });
}

if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
  return message.reply({
    embeds: [
      makeEmbed(
        '#f59e0b',
        'Command Clear Usage',
        `Use \`${prefix}commandclear <amount>\` where amount is between **1** and **100**.`
      )
    ]
  });
}

const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
const collected = [];
let beforeId = null;

try {
  while (collected.length < amount) {
    const fetched = await message.channel.messages.fetch({
      limit: 100,
      ...(beforeId ? { before: beforeId } : {})
    });

    if (!fetched.size) break;

    for (const msg of fetched.values()) {
      if (msg.author.id === client.user.id && msg.createdTimestamp >= cutoff) {
        if (!collected.some(m => m.id === msg.id)) {
          collected.push(msg);
          if (collected.length >= amount) break;
        }
      }
    }

    beforeId = fetched.last().id;

    if (fetched.last().createdTimestamp < cutoff) break;
    if (fetched.size < 100) break;
  }

  if (!collected.length) {
    await message.delete().catch(() => {});
    return message.channel.send({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Command Clear',
          'No recent bot messages were found in the last 14 days.'
        )
      ]
    }).then(reply => setTimeout(() => reply.delete().catch(() => {}), 5000)).catch(() => {});
  }

  const toDelete = collected.slice(0, amount);
  let deletedCount = 0;

  for (let i = 0; i < toDelete.length; i += 100) {
    const chunk = toDelete.slice(i, i + 100);
    const deleted = await message.channel.bulkDelete(chunk, true).catch(() => null);
    deletedCount += deleted?.size || 0;

    // small delay helps avoid rate-limit spikes on busy channels
    if (i + 100 < toDelete.length) {
      await sleep(250);
    }
  }

  await message.delete().catch(() => {});

  const successMsg = await message.channel.send({
    embeds: [
      makeEmbed(
        '#22c55e',
        'Command Clear Complete',
        `Deleted **${deletedCount}** bot message${deletedCount === 1 ? '' : 's'} from this channel.`
      )
    ]
  });

  setTimeout(() => successMsg.delete().catch(() => {}), 5000);
} catch (err) {
  console.error('[CommandClear] Error:', err);

  try {
    await message.delete().catch(() => {});
  } catch {}

  return message.channel.send({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Command Clear Failed',
        'Something went wrong while deleting messages.'
      )
    ]
  }).then(reply => setTimeout(() => reply.delete().catch(() => {}), 5000)).catch(() => {});
}

}
};