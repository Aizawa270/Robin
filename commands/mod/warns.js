const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

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
    u.username?.toLowerCase() === lowered ||
    u.globalName?.toLowerCase() === lowered
  );

  if (cached) return cached;


  if (message.guild) {

    const member = message.guild.members.cache.find(m =>
      m.displayName?.toLowerCase() === lowered ||
      m.user.username?.toLowerCase() === lowered ||
      m.user.globalName?.toLowerCase() === lowered
    );

    if (member) return member.user;


    const fetched = await message.guild.members.fetch({
      query: raw,
      limit: 10
    }).catch(() => null);


    if (fetched?.size) {

      const exact = fetched.find(m =>
        m.displayName?.toLowerCase() === lowered ||
        m.user.username?.toLowerCase() === lowered ||
        m.user.globalName?.toLowerCase() === lowered
      );

      return exact?.user || fetched.first()?.user || null;
    }
  }

  return null;
}



function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}



module.exports = {
  name: 'warns',
  aliases: ['warnings'],
  description: 'Shows all warns for a user.',
  category: 'mod',
  usage: '$warns <@user|userID>',


  async execute(client, message, args) {


    if (!message.guild) {
      return message.reply({
        embeds:[
          makeEmbed(
            '#ef4444',
            'Warnings Failed',
            'This command can only be used in servers.'
          )
        ]
      });
    }



    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {

      return message.reply({
        embeds:[
          makeEmbed(
            '#ef4444',
            'Warnings Failed',
            'You need **Moderate Members** permission.'
          )
        ]
      });
    }



    const prefix =
      message.prefix ||
      client.getPrefix?.(message.guild.id) ||
      '$';



    if (!args.length) {
      return message.reply({
        embeds:[
          makeEmbed(
            '#facc15',
            'Warns Usage',
            `**Usage:**\n\`${prefix}warns <@user|ID>\``
          )
        ]
      });
    }



    const targetUser = await resolveTargetUser(message,args[0]);



    if (!targetUser) {
      return message.reply({
        embeds:[
          makeEmbed(
            '#f59e0b',
            'Warnings Failed',
            'User not found.'
          )
        ]
      });
    }



    if (!client.automodDB) {
      return message.reply({
        embeds:[
          makeEmbed(
            '#ef4444',
            'Warnings Failed',
            'Warning database unavailable.'
          )
        ]
      });
    }



    try {


      const warnings = client.automodDB.prepare(`
        SELECT reason, moderator_id, timestamp
        FROM automod_warns
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
      `).all(
        message.guild.id,
        targetUser.id
      );



      if (!warnings.length) {

        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('No Warnings')
          .setDescription(
            `<@${targetUser.id}> has no warnings.`
          )
          .setThumbnail(
            targetUser.displayAvatarURL({size:1024})
          )
          .setFooter({
            text:`Requested by ${message.author.tag}`,
            iconURL:message.author.displayAvatarURL({size:64})
          })
          .setTimestamp();


        return message.reply({
          embeds:[embed]
        });

      }



      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(`${targetUser.tag}'s Warnings`)
        .setDescription(
          `Total warnings: **${warnings.length}**`
        )
        .setThumbnail(
          targetUser.displayAvatarURL({size:1024})
        )
        .setFooter({
          text:`Requested by ${message.author.tag}`,
          iconURL:message.author.displayAvatarURL({size:64})
        })
        .setTimestamp();



      warnings.slice(0,5).forEach((warn,index)=>{

        const time = warn.timestamp
          ? `<t:${Math.floor(warn.timestamp / 1000)}:R>`
          : 'Unknown';



        embed.addFields({

          name:`Warning #${index+1}`,

          value:
          `**Reason:** ${warn.reason || 'No reason'}\n`+
          `**Moderator:** ${warn.moderator_id ? `<@${warn.moderator_id}>` : 'System'}\n`+
          `**Time:** ${time}`,

          inline:false
        });

      });



      if (warnings.length > 5) {

        embed.addFields({

          name:'Note',

          value:
          `Showing 5 newest warnings out of ${warnings.length}.`,

          inline:false

        });

      }



      return message.reply({
        embeds:[embed]
      });



    } catch(err) {

      console.error('[Warns] Error:',err);

      return message.reply({
        embeds:[
          makeEmbed(
            '#ef4444',
            'Warnings Failed',
            'Failed to load warnings.'
          )
        ]
      });

    }

  }
};