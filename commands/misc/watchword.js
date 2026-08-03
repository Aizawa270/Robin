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

function ensureWatchwordDB(client) {
if (!client.watchwordDB) return false;
if (client._watchwordReady) return true;

client.watchwordDB.prepare("CREATE TABLE IF NOT EXISTS watchwords ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, guild_id TEXT NOT NULL, word TEXT NOT NULL, created_at INTEGER DEFAULT (strftime('%s','now')*1000), UNIQUE(user_id, guild_id, word) )").run();

client.watchwordDB.prepare("CREATE TABLE IF NOT EXISTS watchword_disabled_channels ( guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, PRIMARY KEY (guild_id, channel_id) )").run();

if (!client.watchwordDisabledChannels) {
client.watchwordDisabledChannels = new Map();
}

client._watchwordReady = true;
return true;
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

function canManageWatchwordSettings(client, member) {
if (!member) return false;
if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
if (member.id === member.guild?.ownerId) return true;
if (isBotOwner(client, member.id)) return true;
return false;
}

function getDisabledSet(client, guildId) {
if (!client.watchwordDisabledChannels) {
client.watchwordDisabledChannels = new Map();
}

const key = String(guildId);
if (client.watchwordDisabledChannels.has(key)) {
return client.watchwordDisabledChannels.get(key);
}

const rows = client.watchwordDB
.prepare('SELECT channel_id FROM watchword_disabled_channels WHERE guild_id = ?')
.all(key);

const set = new Set(rows.map(r => String(r.channel_id)));
client.watchwordDisabledChannels.set(key, set);
return set;
}

function refreshDisabledSet(client, guildId) {
if (!client.watchwordDisabledChannels) {
client.watchwordDisabledChannels = new Map();
}

const key = String(guildId);
const rows = client.watchwordDB
.prepare('SELECT channel_id FROM watchword_disabled_channels WHERE guild_id = ?')
.all(key);

const set = new Set(rows.map(r => String(r.channel_id)));
client.watchwordDisabledChannels.set(key, set);
return set;
}

function resolveTextChannel(guild, raw) {
if (!raw) return null;

const query = String(raw).trim();
if (!query) return null;

const mentionMatch = query.match(/^<#(\d{15,20})>$/);
const id = mentionMatch?.[1] || query.replace(/[<#>]/g, '');

const byId = guild.channels.cache.get(id);
if (byId) return byId;

const lowered = query.toLowerCase();
const byName = guild.channels.cache.find(ch =>
ch?.name?.toLowerCase() === lowered
);

return byName || null;
}

function normalizeWord(word) {
return String(word || '').trim().toLowerCase();
}

function escapeRegex(text) {
return text.replace(/[.*+?^${}()|[]\]/g, '\$&');
}

function matchesWatchword(content, word) {
const cleanWord = normalizeWord(word);
if (!cleanWord) return false;

const lowerContent = String(content || '').toLowerCase();

if (cleanWord.includes(' ')) {
return lowerContent.includes(cleanWord);
}

const regex = new RegExp("(^|\\W)${escapeRegex(cleanWord)}(?=$|\\W)", 'i');
return regex.test(content);
}

function buildHelpEmbed(prefix) {
return makeEmbed(
'#ec4899',
'Watchword Commands',
[
"\"${prefix}watchword add <word>`", "`${prefix}watchword remove <word>`", "`${prefix}watchword list`", "`${prefix}watchword disable <#channel|channel_id|channel_name>`", "`${prefix}watchword enable <#channel|channel_id|channel_name>`", "`${prefix}watchword listdisabled``,
'',
'Watchwords and disabled channels are separate for each server.',
'Anyone in the server can use add, remove, and list.',
'Only the bot owner, server owner, or administrators can manage disabled channels.'
].join('\n')
);
}

async function sendTemp(channel, embed, ms = 10000) {
const msg = await channel.send({ embeds: [embed] }).catch(() => null);
if (msg) setTimeout(() => msg.delete().catch(() => {}), ms);
return msg;
}

module.exports = {
name: 'watchword',
description: 'Manage server-specific watchwords and disabled channels.',
category: 'misc',
usage: 'watchword <add|remove|list|disable|enable|listdisabled> [word|channel]',
aliases: ['ww', 'watch'],

async execute(client, message, args) {
if (!message.guild) return;
if (!ensureWatchwordDB(client)) {
return message.reply({
embeds: [
makeEmbed('#ef4444', 'Watchword Error', 'Watchword database is unavailable.')
]
});
}

const prefix = client.getPrefix?.(message.guild.id) || '$';
const subcommand = (args[0] || '').toLowerCase();

if (!subcommand || !['add', 'remove', 'list', 'disable', 'enable', 'listdisabled'].includes(subcommand)) {
  return message.reply({ embeds: [buildHelpEmbed(prefix)] });
}

if (subcommand === 'list') {
  const words = client.watchwordDB.prepare(`
    SELECT word
    FROM watchwords
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(message.guild.id, message.author.id);

  if (!words.length) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ec4899',
        'Your Watchwords',
        'You have no watchwords in this server.'
      ).setFooter({ text: `Use ${prefix}watchword add <word>` }),
      15000
    );
  }

  const list = words.map((w, i) => `${i + 1}. **${w.word}**`).join('\n');

  return sendTemp(
    message.channel,
    makeEmbed(
      '#ec4899',
      'Your Watchwords',
      `You're watching **${words.length}** word${words.length === 1 ? '' : 's'} in this server:\n\n${list}`
    ).setFooter({ text: `Use ${prefix}watchword remove <word> to delete one` }),
    15000
  );
}

if (subcommand === 'listdisabled') {
  if (!canManageWatchwordSettings(client, message.member)) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#ef4444',
          'Permission Denied',
          'Only the bot owner, server owner, or administrators can view disabled channels.'
        )
      ]
    });
  }

  const rows = client.watchwordDB.prepare(`
    SELECT channel_id
    FROM watchword_disabled_channels
    WHERE guild_id = ?
    ORDER BY channel_id ASC
  `).all(message.guild.id);

  if (!rows.length) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#3b82f6',
        'Disabled Channels',
        'No channels are disabled in this server.'
      ).setFooter({ text: `Use ${prefix}watchword disable #channel` }),
      15000
    );
  }

  const channels = rows.map(row => `<#${row.channel_id}>`).join('\n');

  return sendTemp(
    message.channel,
    makeEmbed(
      '#3b82f6',
      'Disabled Channels',
      `Watchwords will not trigger in these channels:\n\n${channels}`
    ).setFooter({ text: `Use ${prefix}watchword enable #channel to re-enable` }),
    15000
  );
}

if (subcommand === 'add') {
  const word = normalizeWord(args.slice(1).join(' '));
  if (!word) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ef4444',
        'Add Watchword Failed',
        `Provide a word.\n\nUsage: \`${prefix}watchword add <word>\``
      ),
      10000
    );
  }

  if (word.length > 50) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ef4444',
        'Add Watchword Failed',
        'Watchwords must be 50 characters or less.'
      ),
      10000
    );
  }

  try {
    const result = client.watchwordDB.prepare(`
      INSERT OR IGNORE INTO watchwords (user_id, guild_id, word)
      VALUES (?, ?, ?)
    `).run(message.author.id, message.guild.id, word);

    if (!result.changes) {
      return sendTemp(
        message.channel,
        makeEmbed(
          '#f59e0b',
          'Watchword Already Added',
          `**${word}** is already in your watchlist for this server.`
        ),
        10000
      );
    }

    return sendTemp(
      message.channel,
      makeEmbed(
        '#22c55e',
        'Watchword Added',
        `You will now get a DM when **${word}** is mentioned in this server.`
      ),
      12000
    );
  } catch (err) {
    console.error('[Watchword] Add error:', err);
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ef4444',
        'Add Watchword Failed',
        'Could not add that watchword.'
      ),
      10000
    );
  }
}

if (subcommand === 'remove') {
  const word = normalizeWord(args.slice(1).join(' '));
  if (!word) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ef4444',
        'Remove Watchword Failed',
        `Provide a word.\n\nUsage: \`${prefix}watchword remove <word>\``
      ),
      10000
    );
  }

  const result = client.watchwordDB.prepare(`
    DELETE FROM watchwords
    WHERE user_id = ? AND guild_id = ? AND word = ?
  `).run(message.author.id, message.guild.id, word);

  if (!result.changes) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#f59e0b',
        'Watchword Not Found',
        `**${word}** is not in your watchlist for this server.`
      ),
      10000
    );
  }

  return sendTemp(
    message.channel,
    makeEmbed(
      '#22c55e',
      'Watchword Removed',
      `You will no longer get DMs for **${word}** in this server.`
    ),
    12000
  );
}

if (subcommand === 'disable') {
  if (!canManageWatchwordSettings(client, message.member)) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#ef4444',
          'Permission Denied',
          'Only the bot owner, server owner, or administrators can disable channels.'
        )
      ]
    });
  }

  const channelInput = args.slice(1).join(' ').trim();
  if (!channelInput) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ef4444',
        'Disable Failed',
        `Provide a channel.\n\nUsage: \`${prefix}watchword disable #channel\``
      ),
      10000
    );
  }

  const channel = resolveTextChannel(message.guild, channelInput);
  if (!channel) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#f59e0b',
        'Disable Failed',
        'Could not find that channel.'
      ),
      10000
    );
  }

  client.watchwordDB.prepare(`
    INSERT OR IGNORE INTO watchword_disabled_channels (guild_id, channel_id)
    VALUES (?, ?)
  `).run(message.guild.id, channel.id);

  refreshDisabledSet(client, message.guild.id);

  return sendTemp(
    message.channel,
    makeEmbed(
      '#22c55e',
      'Watchword Disabled',
      `Watchwords will no longer trigger in ${channel}.`
    ),
    12000
  );
}

if (subcommand === 'enable') {
  if (!canManageWatchwordSettings(client, message.member)) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#ef4444',
          'Permission Denied',
          'Only the bot owner, server owner, or administrators can enable channels.'
        )
      ]
    });
  }

  const channelInput = args.slice(1).join(' ').trim();
  if (!channelInput) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#ef4444',
        'Enable Failed',
        `Provide a channel.\n\nUsage: \`${prefix}watchword enable #channel\``
      ),
      10000
    );
  }

  const channel = resolveTextChannel(message.guild, channelInput);
  if (!channel) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#f59e0b',
        'Enable Failed',
        'Could not find that channel.'
      ),
      10000
    );
  }

  const result = client.watchwordDB.prepare(`
    DELETE FROM watchword_disabled_channels
    WHERE guild_id = ? AND channel_id = ?
  `).run(message.guild.id, channel.id);

  refreshDisabledSet(client, message.guild.id);

  if (!result.changes) {
    return sendTemp(
      message.channel,
      makeEmbed(
        '#f59e0b',
        'Channel Already Enabled',
        `${channel} was not disabled.`
      ),
      10000
    );
  }

  return sendTemp(
    message.channel,
    makeEmbed(
      '#22c55e',
      'Watchword Enabled',
      `Watchwords can trigger again in ${channel}.`
    ),
    12000
  );
}

},

checkWatchwords: async (client, message) => {
if (!message.guild || message.author.bot) return;
if (!ensureWatchwordDB(client)) return;

const disabled = getDisabledSet(client, message.guild.id);
if (disabled.has(message.channel.id)) return;

const content = String(message.content || '');
if (!content.trim()) return;

const watchwords = client.watchwordDB.prepare(`
  SELECT user_id, word
  FROM watchwords
  WHERE guild_id = ?
`).all(message.guild.id);

if (!watchwords.length) return;

for (const { user_id, word } of watchwords) {
  if (String(user_id) === message.author.id) continue;
  if (!matchesWatchword(content, word)) continue;

  const user = await client.users.fetch(user_id).catch(() => null);
  if (!user) continue;

  const embed = new EmbedBuilder()
    .setColor('#ec4899')
    .setTitle('Watchword Detected')
    .setDescription(`Your watchword **"${word}"** was mentioned in **${message.guild.name}**.`)
    .addFields(
      { name: 'Message', value: content.slice(0, 1024) || 'No content', inline: false },
      { name: 'Author', value: `${message.author.tag} (${message.author.id})`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Jump Link', value: `[Open message](${message.url})`, inline: false }
    )
    .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
    .setFooter({ text: `Server: ${message.guild.name}` })
    .setTimestamp();

  await user.send({ embeds: [embed] }).catch(() => {});
}

}
};