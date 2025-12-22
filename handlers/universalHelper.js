const { EmbedBuilder } = require('discord.js');

const DEFAULT_COLOR = '#f472b6';
const ROLES_INFO_COLOR = '#fde047';

// Store original EmbedBuilder
const OriginalEmbedBuilder = EmbedBuilder;

// Monkey patch EmbedBuilder globally
function patchEmbedBuilder() {
    // Create patched version
    class PatchedEmbedBuilder extends OriginalEmbedBuilder {
        constructor(data) {
            super(data);
            this._isRoleinfo = false;
        }
        
        setColor(color) {
            // If color is being set manually, track if it's roleinfo
            if (color === ROLES_INFO_COLOR || (typeof color === 'string' && color.includes('fde047'))) {
                this._isRoleinfo = true;
            }
            return super.setColor(color);
        }
    }
    
    // Replace global EmbedBuilder
    require('discord.js').EmbedBuilder = PatchedEmbedBuilder;
    return PatchedEmbedBuilder;
}

// Create prefix fixing wrapper
function createUniversalEmbed(client, message, options = {}) {
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';
    
    const embed = new EmbedBuilder();
    
    // Auto-detect if this is roleinfo command
    const commandName = message.commandName || '';
    const isRoleinfo = commandName === 'roleinfo' || 
                      (options.title && options.title.toLowerCase().includes('roleinfo')) ||
                      (options.description && options.description.toLowerCase().includes('roleinfo'));
    
    // Set color: light pink for all except roleinfo
    if (isRoleinfo) {
        embed.setColor(ROLES_INFO_COLOR);
    } else {
        embed.setColor(DEFAULT_COLOR);
    }
    
    // Fix prefixes in text
    function fixText(text) {
        if (typeof text !== 'string') return text;
        return text.replace(/\$([a-zA-Z0-9])/g, `${prefix}$1`);
    }
    
    // Apply options
    if (options.title) embed.setTitle(fixText(options.title));
    if (options.description) embed.setDescription(fixText(options.description));
    if (options.fields) {
        options.fields.forEach(field => {
            embed.addFields({
                name: fixText(field.name),
                value: fixText(field.value),
                inline: field.inline || false
            });
        });
    }
    if (options.footer) {
        if (typeof options.footer === 'string') {
            embed.setFooter({ text: fixText(options.footer) });
        } else {
            embed.setFooter({ 
                text: fixText(options.footer.text || ''),
                iconURL: options.footer.iconURL 
            });
        }
    }
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.author) {
        if (typeof options.author === 'string') {
            embed.setAuthor({ name: fixText(options.author) });
        } else {
            embed.setAuthor({ 
                name: fixText(options.author.name || ''),
                iconURL: options.author.iconURL,
                url: options.author.url 
            });
        }
    }
    
    return embed;
}

// Patch reply method to auto-fix embeds
function patchMessageReply(message) {
    const originalReply = message.reply;
    
    message.reply = function(content, options) {
        // If content is an embed or has embeds, fix them
        if (content && (content.embeds || (Array.isArray(content) && content[0]?.constructor?.name === 'EmbedBuilder'))) {
            const embeds = content.embeds || content;
            const fixedEmbeds = [];
            
            for (const embed of Array.isArray(embeds) ? embeds : [embeds]) {
                if (embed instanceof EmbedBuilder) {
                    const data = embed.data;
                    const isRoleinfo = data.color === parseInt(ROLES_INFO_COLOR.replace('#', ''), 16) || 
                                     (data.title && data.title.toLowerCase().includes('roleinfo'));
                    
                    // Create new embed with fixes
                    const newEmbed = new EmbedBuilder(data);
                    
                    // Fix color if not roleinfo
                    if (!isRoleinfo) {
                        newEmbed.setColor(DEFAULT_COLOR);
                    }
                    
                    // Fix prefixes in all text fields
                    if (data.title) newEmbed.setTitle(fixPrefixes(data.title, message.prefix || '!'));
                    if (data.description) newEmbed.setDescription(fixPrefixes(data.description, message.prefix || '!'));
                    if (data.fields) {
                        newEmbed.data.fields = data.fields.map(field => ({
                            ...field,
                            name: fixPrefixes(field.name, message.prefix || '!'),
                            value: fixPrefixes(field.value, message.prefix || '!')
                        }));
                    }
                    if (data.footer) {
                        newEmbed.setFooter({
                            text: fixPrefixes(data.footer.text, message.prefix || '!'),
                            iconURL: data.footer.iconURL
                        });
                    }
                    
                    fixedEmbeds.push(newEmbed);
                } else {
                    fixedEmbeds.push(embed);
                }
            }
            
            // Replace embeds with fixed ones
            if (content.embeds) {
                content.embeds = fixedEmbeds;
            } else {
                content = fixedEmbeds;
            }
        }
        
        return originalReply.call(this, content, options);
    };
    
    return message;
}

function fixPrefixes(text, prefix) {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([a-zA-Z0-9])/g, `${prefix}$1`);
}

module.exports = {
    patchEmbedBuilder,
    createUniversalEmbed,
    patchMessageReply,
    fixPrefixes,
    DEFAULT_COLOR,
    ROLES_INFO_COLOR
};