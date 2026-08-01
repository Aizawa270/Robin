const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}

function getRolePos(member) {
  return member?.roles?.highest?.position ?? 0;
}

function isOwner(guild, member) {
  return !!guild?.ownerId && member?.id === guild.ownerId;
}

function buildUsage(prefix) {
  return makeEmbed(
    '#facc15',
    'Unmute Command Usage',
    `**Usage:** \`${prefix}unmute <@user|userID|username|display name> [reason]\`\n\n` +
    `**Examples:**\n` +
    `${prefix}unmute @User timeout ended\n` +
    `${prefix}unmute 123456789012345678 apology\n` +
    `${prefix}unmute Xusion stopped`
  );
}

async function resolveTargetUser(message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input);
  }

  const raw = String(input).trim();

  const mention = raw.match(/^<@!?(\d{15,20})>$/);
  const id = mention?.[1] || raw.replace(/[<@!>]/g, '');

  if (/^\d{15,20}$/.test(id)) {
    return (
      message.client.users.cache.get(id) ||
      await message.client.users.fetch(id).catch(() => null)
    );
  }

  const lowered = raw.toLowerCase();

  const cached = message.client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );

  if (cached) return cached;

  if (message.guild) {
    const member = message.guild.members.cache.find(m =>
      m?.displayName?.toLowerCase() === lowered ||
      m?.user?.username?.toLowerCase() === lowered ||
      m?.user?.globalName?.toLowerCase() === lowered ||
      m?.user?.tag?.toLowerCase() === lowered
    );

    if (member?.user) return member.user;

    const fetched = await message.guild.members.fetch({
      query: raw,
      limit: 10
    }).catch(() => null);

    if (fetched?.size) {
      const exact = fetched.find(m =>
        m?.displayName?.toLowerCase() === lowered ||
        m?.user?.username?.toLowerCase() === lowered ||
        m?.user?.globalName?.toLowerCase() === lowered ||
        m?.user?.tag?.toLowerCase() === lowered
      );

      return exact?.user || fetched.first()?.user || null;
    }
  }

  return null;
}

async function resolveTargetMember(message, input) {
  if (!message.guild) return null;

  if (typeof message.resolveMember === 'function') {
    return await message.resolveMember(input);
  }

  const user = await resolveTargetUser(message, input);

  if (!user) return null;

  return (
    message.guild.members.cache.get(user.id) ||
    await message.guild.members.fetch(user.id).catch(() => null)
  );
}


module.exports = {
  name: 'unmute',
  description: 'Remove timeout from a user.',
  category: 'mod',
  usage: '$unmute <@user|userID|username|display name> [reason]',

  async execute(client, message, args) {

    if (!message.guild) {
      return message.reply({
        embeds: [
          makeEmbed('#ef4444', 'Unmute Failed', 'This command can only be used in a server.')
        ]
      });
    }

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unmute Failed',
            'You need **Timeout Members** permission or Administrator.'
          )
        ]
      });
    }


    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';


    if (!args.length) {
      return message.reply({
        embeds: [buildUsage(prefix)]
      });
    }


    const targetInput = args[0];
    const reason = args.slice(1).join(' ').trim() || 'No reason provided';


    const targetUser = await resolveTargetUser(message, targetInput);

    if (!targetUser) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Unmute Failed',
            'User not found. Try a mention, ID, username, or display name.'
          )
        ]
      });
    }


    if (targetUser.id === message.author.id) {
      return message.reply({
        embeds: [
          makeEmbed('#ef4444', 'Unmute Failed', 'You cannot unmute yourself.')
        ]
      });
    }


    if (targetUser.id === client.user.id) {
      return message.reply({
        embeds: [
          makeEmbed('#ef4444', 'Unmute Failed', 'I cannot unmute myself.')
        ]
      });
    }


    const member = await resolveTargetMember(message, targetInput);

    if (!member) {
      return message.reply({
        embeds: [
          makeEmbed('#f59e0b', 'Unmute Failed', 'That user is not in this server.')
        ]
      });
    }


    const botMember =
      message.guild.members.me ||
      await message.guild.members.fetchMe().catch(() => null);



    if (isOwner(message.guild, member) && !isOwner(message.guild, message.member)) {
      return message.reply({
        embeds: [
          makeEmbed('#ef4444', 'Unmute Failed', 'You cannot unmute the server owner.')
        ]
      });
    }


    if (!isOwner(message.guild, message.member)) {
      if (getRolePos(member) >= getRolePos(message.member)) {
        return message.reply({
          embeds: [
            makeEmbed(
              '#ef4444',
              'Unmute Failed',
              'You cannot unmute someone with equal or higher role.'
            )
          ]
        });
      }
    }


    if (botMember && getRolePos(member) >= getRolePos(botMember)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unmute Failed',
            'I cannot unmute that user because my role is too low.'
          )
        ]
      });
    }


    if (
      botMember &&
      !botMember.permissions.has(PermissionFlagsBits.ModerateMembers)
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unmute Failed',
            'I need **Timeout Members** permission.'
          )
        ]
      });
    }


    if (
      !member.communicationDisabledUntilTimestamp ||
      member.communicationDisabledUntilTimestamp < Date.now()
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Not Muted',
            `<@${member.id}> is not currently muted.`
          )
        ]
      });
    }


    try {

      await member.timeout(
        null,
        `${reason} (unmuted by ${message.author.tag})`
      );


      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('User Unmuted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          {
            name: 'User',
            value: `<@${targetUser.id}>`,
            inline: false
          },
          {
            name: 'Unmuted by',
            value: `<@${message.author.id}>`,
            inline: false
          },
          {
            name: 'Reason',
            value: reason,
            inline: false
          }
        )
        .setTimestamp();


      return message.reply({
        embeds: [embed]
      });


    } catch (err) {

      console.error('Unmute command error:', err);

      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unmute Failed',
            'Failed to remove timeout from the user.'
          )
        ]
      });

    }
  }
};