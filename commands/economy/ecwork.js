const { EmbedBuilder } = require('discord.js');
const { canManageEconomy } = require('../../handlers/economyHelpers');

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer) {
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }
    return embed;
  }

  const embed = new EmbedBuilder().setColor('#5b0000').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

function resolveRoleId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const mention = raw.match(/^<@&(\d{15,20})>$/);
  if (mention) return mention[1];
  const id = raw.replace(/[<@&>]/g, '');
  return /^\d{15,20}$/.test(id) ? id : null;
}

module.exports = {
  name: 'ecwork',
  aliases: [],
  description: 'Configure built-in jobs.',
  category: 'economy',
  usage: '$ecwork setup <job id> <role/id> <shift pay> <7 day bonus>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!canManageEconomy(client, message)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Access Denied',
            description: 'Only the server owner or bot owner can use this command.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const sub = String(args[0] || '').toLowerCase();

    if (!sub) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Job Setup',
            description:
              '`$ecwork setup <job id> <role/id> <shift pay> <7 day bonus>`\n' +
              '`$ecwork disable <job id>`\n' +
              '`$ecwork reset <job id>`',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    if (sub === 'setup') {
      const jobId = String(args[1] || '').trim();
      const roleId = resolveRoleId(args[2]);
      const shiftPay = parseInt(args[3], 10);
      const bonus = parseInt(args[4], 10);

      if (!jobId || !roleId || !Number.isInteger(shiftPay) || shiftPay <= 0 || !Number.isInteger(bonus) || bonus <= 0) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Setup Failed',
              description: 'Use: `$ecwork setup <job id> <role/id> <shift pay> <7 day bonus>`',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const job = client.economy.setupJob(
        message.guild.id,
        jobId,
        roleId,
        shiftPay,
        bonus,
        message.author.id
      );

      if (!job) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Setup Failed',
              description: 'That job id does not exist.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Job Configured',
            description:
              `**${job.id}. ${job.name}**\n` +
              `Role: <@&${job.required_role_id}>\n` +
              `Shift Pay: ${client.economy.formatCurrency(job.shift_pay)}\n` +
              `7-Day Bonus: ${client.economy.formatCurrency(job.weekly_bonus)}\n` +
              `Works/Day: ${job.works_per_day}\n` +
              `Cooldown: ${client.economy.formatDuration(job.cooldown_ms)}`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    if (sub === 'disable') {
      const job = client.economy.disableJob(message.guild.id, args[1], message.author.id);
      if (!job) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Disable Failed',
              description: 'That job id does not exist.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Job Disabled',
            description: `**${job.id}. ${job.name}** has been disabled.`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    if (sub === 'reset') {
      const job = client.economy.resetJob(message.guild.id, args[1]);
      if (!job) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Reset Failed',
              description: 'That job id does not exist.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Job Reset',
            description: `**${String(args[1] || '').padStart(2, '0')}** has been reset.`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Job Setup',
          description:
            '`$ecwork setup <job id> <role/id> <shift pay> <7 day bonus>`\n' +
            '`$ecwork disable <job id>`\n' +
            '`$ecwork reset <job id>`',
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};