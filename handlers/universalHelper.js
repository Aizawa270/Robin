const { EmbedBuilder } = require('discord.js');

const DEFAULT_COLOR = '#FF69B4'; // Hot Pink (darker than FF6C1)
const ROLES_INFO_COLOR = '#FF69B4'; // Also same color

// Create embed with dynamic prefix
function createEmbed(client, message, options = {}) {
    // Get current prefix for this guild
    const prefix = client.getPrefix(message.guild?.id) || '!';
    
    const embed = new EmbedBuilder()
        .setColor(DEFAULT_COLOR); // Hot pink

    // Helper to replace $ prefixes with current prefix
    const fixPrefixInText = (text) => {
        if (typeof text !== 'string') return text;
        return text.replace(/\$([a-zA-Z0-9])/g, `${prefix}$1`);
    };

    // Apply options
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

// Patch reply method for auto-fixing embeds AND text
function patchMessageReply(message) {
    if (!message || message._replyPatched) return;
    
    const originalReply = message.reply.bind(message);
    const prefix = message.prefix || '!';
    
    // Helper to fix prefixes in any text
    const fixText = (text) => {
        if (typeof text !== 'string') return text;
        return text.replace(/\$([a-zA-Z0-9])/g, `${prefix}$1`);
    };
    
    message.reply = async function(content, options) {
        // If content is a string (plain text), fix prefixes
        if (typeof content === 'string') {
            content = fixText(content);
        }
        // If content is an object with string content
        else if (content && typeof content === 'object' && content.content) {
            content.content = fixText(content.content);
        }
        
        // Fix embeds in content
        if (content && content.embeds) {
            content.embeds = content.embeds.map(embed => {
                if (embed.data) {
                    const fixedEmbed = new EmbedBuilder(embed.data);
                    
                    // Set hot pink color
                    fixedEmbed.setColor(DEFAULT_COLOR);
                    
                    // Fix prefixes in text fields
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
                            text: fixText(embed.data.footer.text),
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

// Simple prefix fix function
function fixPrefixes(text, prefix) {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([a-zA-Z0-9])/g, `${prefix}$1`);
}

module.exports = {
    createEmbed,
    patchMessageReply,
    fixPrefixes,
    DEFAULT_COLOR,
    ROLES_INFO_COLOR
};