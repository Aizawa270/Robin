const { EmbedBuilder } = require('discord.js');

const DEFAULT_COLOR = '#f472b6';
const ROLES_INFO_COLOR = '#fde047';

function getDynamicPrefix(client, message) {
    return message.prefix || client.getPrefix(message.guild?.id) || '!';
}

function fixPrefixes(text, prefix) {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([a-zA-Z0-9])/g, `${prefix}$1`);
}

function getEmbedColor(commandName) {
    if (commandName === 'roleinfo') return ROLES_INFO_COLOR;
    return DEFAULT_COLOR;
}

function createEmbed(client, message, commandName, options = {}) {
    const prefix = getDynamicPrefix(client, message);
    const color = getEmbedColor(commandName);
    
    const embed = new EmbedBuilder().setColor(color).setTimestamp();
    
    if (options.title) embed.setTitle(fixPrefixes(options.title, prefix));
    if (options.description) embed.setDescription(fixPrefixes(options.description, prefix));
    
    if (options.footer) {
        if (typeof options.footer === 'string') {
            embed.setFooter({ text: fixPrefixes(options.footer, prefix) });
        } else {
            embed.setFooter({ 
                text: fixPrefixes(options.footer.text || '', prefix),
                iconURL: options.footer.iconURL 
            });
        }
    }
    
    if (options.fields) {
        options.fields.forEach(field => {
            embed.addFields({
                name: fixPrefixes(field.name, prefix),
                value: fixPrefixes(field.value, prefix),
                inline: field.inline || false
            });
        });
    }
    
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    
    return embed;
}

module.exports = { getDynamicPrefix, fixPrefixes, getEmbedColor, createEmbed };