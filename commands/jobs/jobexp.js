// commands/jobs/jobexp.js
const { EmbedBuilder } = require('discord.js');
const jobs = require('../../handlers/jobs');

module.exports = {
  name: 'jobexp',
  description: 'Show your job XP and level.',
  category: 'jobs',
  usage: '!jobexp',
  aliases: ['joblvl'],
  async execute(client, message, args) {
    const uj = jobs.getUserJob(message.author.id);
    if (!uj || !uj.job_id) return message.reply('You do not have a job.');

    const job = jobs.getJobById(uj.job_id);
    const xp = uj.xp || 0;
    const level = uj.level || 1;
    const threshold = level * 100;

    const embed = new EmbedBuilder()
      .setColor('#06b6d4')
      .setTitle(`${job.name} — Progress`)
      .setDescription(`Level: **${level}**\nXP: **${xp}** / ${threshold}`);

    return message.reply({ embeds: [embed] });
  }
};