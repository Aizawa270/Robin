const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "battlewinner",
  description: "Declare the winner of a battle",
  category: "mod",

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const users = message.mentions.users;
    if (!users || users.size < 2) return;

    const winner = users.first();
    const loser = users.at(1);

    if (!client.battles) return;

    const battle = client.battles.get(message.guild.id);
    if (!battle) return;

    // EMBED
    const embed = new EmbedBuilder()
      .setColor("#ef4444")
      .setDescription(`(${winner}) has successfully humbed (${loser})`);

    await message.channel.send({ embeds: [embed] });

    // RESTORE PERMS
    for (const channel of message.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;

      for (const userId of battle.fighters) {
        const overwrite = channel.permissionOverwrites.cache.get(userId);
        if (overwrite) {
          await channel.permissionOverwrites.delete(userId).catch(() => {});
        }
      }
    }

    // DELETE ARENA
    if (battle.arena) {
      await battle.arena.delete().catch(() => {});
    }

    // CLEAR STATE
    client.battles.delete(message.guild.id);
  }
};