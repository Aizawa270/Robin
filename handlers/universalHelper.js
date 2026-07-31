const { EmbedBuilder } = require('discord.js');

const DEFAULT_COLOR = '#FF69B4';
const ROLES_INFO_COLOR = '#FF69B4';

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
                inline: field.inline || false
            });
        });
    }

    if (options.footer) {
        if (typeof options.footer === 'string') {
            embed.setFooter({ text: fixPrefixInText(options.footer) });
        } else {
            embed.setFooter({
                text: fixPrefixInText(options.footer.text || ''),
                iconURL: options.footer.iconURL
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
                url: options.author.url
            });
        }
    }

    return embed;
}

function patchMessageReply(message) {
    if (!message || message._replyPatched) return;

    const originalReply = message.reply.bind(message);
    const prefix = message.prefix || '!';

    const fixText = (text) => {
        if (typeof text !== 'string') return text;
        return text.replace(/\$([a-zA-Z0-9])/g, (_match, letter) => `${prefix}${letter}`);
    };

    message.reply = async function(content, options) {
        if (typeof content === 'string') {
            content = fixText(content);
        } else if (content && typeof content === 'object' && content.content) {
            content.content = fixText(content.content);
        }

        if (content && content.embeds) {
            content.embeds = content.embeds.map(embed => {
                if (embed._bypassUniversalHelper) {
                    return embed;
                }

                if (embed.data) {
                    const fixedEmbed = new EmbedBuilder(embed.data);
                    fixedEmbed.setColor(DEFAULT_COLOR);

                    if (embed.data.title) fixedEmbed.setTitle(fixText(embed.data.title));
                    if (embed.data.description) fixedEmbed.setDescription(fixText(embed.data.description));

                    if (embed.data.fields) {
                        fixedEmbed.setFields(
                            embed.data.fields.map(field => ({
                                name: fixText(field.name),
                                value: fixText(field.value),
                                inline: field.inline
                            }))
                        );
                    }

                    if (embed.data.footer) {
                        fixedEmbed.setFooter({
                            text: fixText(embed.data.footer.text || ''),
                            iconURL: embed.data.footer.iconURL
                        });
                    }

                    return fixedEmbed;
                }

                return embed;
            });
        }

        return originalReply(content, options);
    };

    message._replyPatched = true;
}

function fixPrefixes(text, prefix) {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([a-zA-Z0-9])/g, (_match, letter) => `${prefix}${letter}`);
}

async function resolveUser(client, message, input) {
    if (!input) return null;

    const query = String(input).trim();
    if (!query) return null;

    // 1) Mention
    const mention = message.mentions?.users?.first();
    if (mention) return mention;

    // 2) User ID
    const id = query.replace(/[<@!>]/g, '');
    if (/^\d{15,20}$/.test(id)) {
        const cached = client.users.cache.get(id);
        if (cached) return cached;

        const fetched = await client.users.fetch(id).catch(() => null);
        if (fetched) return fetched;
    }

    // 3) Exact Discord username (NOT nickname, NOT display name)
    const lowered = query.toLowerCase();

    const cachedUser = client.users.cache.find(u =>
        u?.username?.toLowerCase() === lowered
    );
    if (cachedUser) return cachedUser;

    if (message.guild) {
        const guildMember = message.guild.members.cache.find(m =>
            m?.user?.username?.toLowerCase() === lowered
        );
        if (guildMember?.user) return guildMember.user;
    }

    return null;
}

async function resolveMember(client, message, input) {
    const user = await resolveUser(client, message, input);
    if (!user || !message.guild) return null;

    return message.guild.members.cache.get(user.id)
        || await message.guild.members.fetch(user.id).catch(() => null);
}

module.exports = {
    createEmbed,
    patchMessageReply,
    fixPrefixes,
    resolveUser,
    resolveMember,
    DEFAULT_COLOR,
    ROLES_INFO_COLOR
};