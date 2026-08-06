const { EmbedBuilder } = require('discord.js');

let config = null;
try {
  config = require('../config');
} catch {}

const DEFAULT_COLOR = config?.colors?.theme || '#5b0000';
const ROLES_INFO_COLOR = DEFAULT_COLOR;

function createEmbed(client, message, options = {}) {
  const prefix = client.getPrefix(message.guild?.id) || '!';

  const embed = new EmbedBuilder().setColor(DEFAULT_COLOR);

  const fixPrefixInText = (text) => {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([a-zA-Z0-9])/g, (_match, letter) => `${prefix}${letter}`);
  };

  if (options.title) embed.setTitle(fixPrefixInText(options.title));
  if (options.description) embed.setDescription(fixPrefixInText(options.description));

  if (options.fields) {
    options.fields.forEach(field => {
      embed.addFields({
        name: fixPrefixInText(field.name),
        value: fixPrefixInText(field.value),
        inline: field.inline || false,
      });
    });
  }

  if (options.footer) {
    if (typeof options.footer === 'string') {
      embed.setFooter({ text: fixPrefixInText(options.footer) });
    } else {
      embed.setFooter({
        text: fixPrefixInText(options.footer.text || ''),
        iconURL: options.footer.iconURL,
      });
    }
  }

  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);

  if (options.author) {
    if (typeof options.author === 'string') {
      embed.setAuthor({ name: fixPrefixInText(options.author) });
    } else {
      embed.setAuthor({
        name: fixPrefixInText(options.author.name || ''),
        iconURL: options.author.iconURL,
        url: options.author.url,
      });
    }
  }

  return embed;
}

function fixPrefixes(text, prefix) {
  if (typeof text !== 'string') return text;
  return text.replace(/\$([a-zA-Z0-9])/g, (_match, letter) => `${prefix}${letter}`);
}

function patchMessageReply(message) {
  if (!message || message._replyPatched) return;
  if (typeof message.reply !== 'function') return;

  const originalReply = message.reply.bind(message);
  const prefix = message.prefix || '!';

  const fixText = (text) => {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([a-zA-Z0-9])/g, (_match, letter) => `${prefix}${letter}`);
  };

  message.reply = async function(content, options) {
    if (typeof content === 'string') {
      content = fixText(content);
    } else if (content && typeof content === 'object') {
      if (content.content) {
        content.content = fixText(content.content);
      }

      if (Array.isArray(content.embeds)) {
        content.embeds = content.embeds.map(embed => {
          if (!embed) return embed;
          if (embed._bypassUniversalHelper) return embed;

          if (embed.data) {
            const fixedEmbed = new EmbedBuilder(embed.data);
            fixedEmbed.setColor(DEFAULT_COLOR);

            if (embed.data.title) fixedEmbed.setTitle(fixText(embed.data.title));
            if (embed.data.description) fixedEmbed.setDescription(fixText(embed.data.description));

            if (Array.isArray(embed.data.fields)) {
              fixedEmbed.setFields(
                embed.data.fields.map(field => ({
                  name: fixText(field.name),
                  value: fixText(field.value),
                  inline: field.inline,
                }))
              );
            }

            if (embed.data.footer) {
              fixedEmbed.setFooter({
                text: fixText(embed.data.footer.text || ''),
                iconURL: embed.data.footer.iconURL,
              });
            }

            if (embed.data.author) {
              fixedEmbed.setAuthor({
                name: fixText(embed.data.author.name || ''),
                iconURL: embed.data.author.iconURL,
                url: embed.data.author.url,
              });
            }

            if (embed.data.thumbnail?.url) fixedEmbed.setThumbnail(embed.data.thumbnail.url);
            if (embed.data.image?.url) fixedEmbed.setImage(embed.data.image.url);

            return fixedEmbed;
          }

          return embed;
        });
      }
    }

    return originalReply(content, options);
  };

  message._replyPatched = true;
}

function normalizeQuery(input) {
  if (!input) return '';
  return String(input).trim();
}

function stripMentionMarkup(query) {
  return query.replace(/[<@!>]/g, '');
}

async function resolveUser(client, message, input) {
  const query = normalizeQuery(input);
  if (!query) return null;

  const lowered = query.toLowerCase();

  const mentionMatch = query.match(/^<@!?(\d{15,20})>$/);
  if (mentionMatch) {
    const id = mentionMatch[1];
    const cachedMention = client.users.cache.get(id);
    if (cachedMention) return cachedMention;
    return await client.users.fetch(id).catch(() => null);
  }

  const maybeId = stripMentionMarkup(query);
  if (/^\d{15,20}$/.test(maybeId)) {
    const cachedById = client.users.cache.get(maybeId);
    if (cachedById) return cachedById;
    return await client.users.fetch(maybeId).catch(() => null);
  }

  const cachedUser = client.users.cache.find(u => {
    if (!u) return false;
    const username = u.username?.toLowerCase?.() || '';
    return username === lowered;
  });
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => null);

    const cachedMember = message.guild.members.cache.find(m => {
      if (!m?.user) return false;
      const username = m.user.username?.toLowerCase?.() || '';
      return username === lowered;
    });

    if (cachedMember?.user) return cachedMember.user;
  }

  return null;
}

async function resolveMember(client, message, input) {
  const user = await resolveUser(client, message, input);
  if (!user || !message.guild) return null;

  return (
    message.guild.members.cache.get(user.id) ||
    await message.guild.members.fetch(user.id).catch(() => null)
  );
}

module.exports = {
  createEmbed,
  patchMessageReply,
  fixPrefixes,
  resolveUser,
  resolveMember,
  DEFAULT_COLOR,
  ROLES_INFO_COLOR,
};