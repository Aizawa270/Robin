const { EmbedBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
  name: "battlewinner",
  description: "Ends a battle and declares the winner",
  category: "mod",
  permissions: [PermissionsBitField.Flags.Administrator],

  async execute(message, args, client) {
    const mentions = message.mentions.users;
    if (mentions.size < 2) return;

    const winner = mentions.first();
    const loser = mentions.at(1);

    const guildId = message.guild.id;
    const battle = client.battles?.get(guildId);
    if (!battle) return;

    const fighters = battle.fighters;
    const arena = battle.arena;

    // 🏆 WINNER EMBED
    const embed = new EmbedBuilder()
      .setColor("Red")
      .setDescription(`(${winner}) has successfully humbed (${loser})`);

    await message.channel.send({ embeds: [embed] });

    // 🔓 RESTORE PERMISSIONS SAFELY
    for (const channel of message.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;

      for (const userId of fighters) {
        const overwrite = channel.permissionOverwrites.cache.get(userId);
        if (!overwrite) continue;

        await channel.permissionOverwrites.delete(userId).catch(() => {});
      }
    }

    // 🧹 DELETE ARENA
    if (arena) {
      await arena.delete().catch(() => {});
    }

    // 🧠 CLEAR BATTLE STATE
    client.battles.delete(guildId);
  }
};