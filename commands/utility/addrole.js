const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveMember: universalResolveMember } = require('../../handlers/universalHelper');

async function resolveTargetMember(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveMember === 'function') {
    return await message.resolveMember(input).catch(() => null);
  }

  if (typeof universalResolveMember === 'function') {
    return await universalResolveMember(client, message, input).catch(() => null);
  }

  const query = String(input).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    return await message.guild.members.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cached = message.guild.members.cache.find(m =>
    m?.user?.username?.toLowerCase() === lowered ||
    m?.user?.tag?.toLowerCase() === lowered
  );
  if (cached) return cached;

  const fetched = await message.guild.members.fetch({ query, limit: 10 }).catch(() => null);
  if (fetched?.size) {
    const exact = fetched.find(m =>
      m?.user?.username?.toLowerCase() === lowered ||
      m?.user?.tag?.toLowerCase() === lowered
    );
    return exact || fetched.first() || null;
  }

  return null;
}

function resolveRole(guild, input) {
  if (!input) return null;

  const raw = String(input).trim();
  const cleaned = raw.replace(/[<@&>]/g, '');

  const byId = guild.roles.cache.get(cleaned);
  if (byId) return byId;

  const lowered = cleaned.toLowerCase();
  const byName = guild.roles.cache.find(role =>
    role.name.toLowerCase() === lowered
  );

  if (byName) return byName;

  return guild.roles.cache.find(role =>
    role.name.toLowerCase().includes(lowered)
  ) || null;
}

module.exports = {
  name: 'addrole',
  description: 'Add a role to a user. Usage: $addrole @user @role',
  aliases: ['ar'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You need **Manage Roles** permission.')
        ]
      });
    }

    const member = await resolveTargetMember(client, message, args[0]);
    const role = resolveRole(message.guild, args[1]);

    if (!member || !role) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('Usage')
            .setDescription('$addrole @user @role')
        ]
      });
    }

    if (member.id === message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot add roles to yourself.')
        ]
      });
    }

    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot modify someone with equal or higher role.')
        ]
      });
    }

    if (role.position >= message.member.roles.highest.position) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot assign a role equal or higher than your highest role.')
        ]
      });
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('I cannot assign that role because it is above my highest role.')
        ]
      });
    }

    try {
      await member.roles.add(role);

      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Role Added')
        .setDescription(`Added **${role.name}** to **${member.user.tag}**`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

      return message.reply({ embeds: [embed] });
    } catch (e) {
      console.error(e);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('Something went wrong while executing that command.')
        ]
      });
    }
  },
};