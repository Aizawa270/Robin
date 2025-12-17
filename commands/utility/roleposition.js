module.exports = {
    name: "roleposition",

    async execute(message, args) {
        const role =
            message.mentions.roles.first() ||
            message.guild.roles.cache.get(args[0]);

        if (!role) {
            return message.reply("❌ Usage: `$roleposition @role`");
        }

        const embed = {
            color: 0x5865f2, // Discord blurple
            title: "📍 Role Position",
            description: `**${role.name}** is at position:\n\n🔢 **${role.position}**`,
            thumbnail: {
                url: message.guild.iconURL({ dynamic: true })
            },
            footer: {
                text: `Requested by ${message.author.tag}`,
                icon_url: message.author.displayAvatarURL({ dynamic: true })
            },
            timestamp: new Date()
        };

        message.channel.send({ embeds: [embed] });
    }
};