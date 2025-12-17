module.exports = {
    name: "addrole",

    async execute(message, args) {
        if (!message.member.permissions.has("ManageRoles")) {
            return message.reply("❌ You don’t have permission to manage roles.");
        }

        const member =
            message.mentions.members.first() ||
            message.guild.members.cache.get(args[0]);

        const role =
            message.mentions.roles.first() ||
            message.guild.roles.cache.get(args[1]);

        if (!member || !role) {
            return message.reply("❌ Usage: `$addrole @user @role`");
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply("❌ That role is higher than or equal to my role.");
        }

        await member.roles.add(role);

        const embed = {
            color: 0x2ecc71,
            title: "✅ Role Added",
            description: `Successfully added **${role.name}** to **${member.user.tag}**.`,
            thumbnail: {
                url: member.user.displayAvatarURL({ dynamic: true })
            },
            footer: {
                text: `Action by ${message.author.tag}`,
                icon_url: message.author.displayAvatarURL({ dynamic: true })
            },
            timestamp: new Date()
        };

        message.channel.send({ embeds: [embed] });
    }
};