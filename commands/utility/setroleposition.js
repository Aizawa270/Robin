module.exports = {
    name: "setroleposition",
    aliases: ["srp"],

    async execute(message, args) {
        // Permission check
        if (!message.member.permissions.has("ManageRoles")) {
            return message.reply("❌ You don’t have permission to manage roles.");
        }

        if (!message.guild.members.me.permissions.has("ManageRoles")) {
            return message.reply("❌ I don’t have permission to manage roles.");
        }

        // Get role
        const role =
            message.mentions.roles.first() ||
            message.guild.roles.cache.get(args[0]);

        const newPosition = parseInt(args[1]);

        if (!role || isNaN(newPosition)) {
            return message.reply(
                "❌ Usage: `$setroleposition @role <position>`"
            );
        }

        // Bot hierarchy check
        const botHighestRole = message.guild.members.me.roles.highest;

        if (role.position >= botHighestRole.position) {
            return message.reply(
                "❌ I can only move roles below my highest role."
            );
        }

        // Position bounds check
        if (newPosition < 1 || newPosition >= botHighestRole.position) {
            return message.reply(
                `❌ Position must be between 1 and ${botHighestRole.position - 1}.`
            );
        }

        try {
            const oldPosition = role.position;

            await role.setPosition(newPosition);

            const embed = {
                color: 0x5865f2, // Discord blurple
                title: "🔁 Role Position Updated",
                description: `Successfully switched positions for **${role.name}**.`,
                fields: [
                    {
                        name: "Old Position",
                        value: `${oldPosition}`,
                        inline: true
                    },
                    {
                        name: "New Position",
                        value: `${newPosition}`,
                        inline: true
                    }
                ],
                thumbnail: {
                    url: message.guild.iconURL({ dynamic: true })
                },
                footer: {
                    text: `Action by ${message.author.tag}`,
                    icon_url: message.author.displayAvatarURL({ dynamic: true })
                },
                timestamp: new Date()
            };

            message.channel.send({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            message.reply("❌ Failed to update role position.");
        }
    }
};