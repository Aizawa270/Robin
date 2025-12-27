// commands/jobs/jobinfo.js
const { EmbedBuilder } = require('discord.js');
const jobs = require('../../handlers/jobs');

module.exports = {
  name: 'jobinfo',
  description: 'Get detailed info about a job (slug or id).',
  category: 'jobs',
  usage: '!jobinfo <job_slug_or_id>',
  aliases: ['jinfo'],
  async execute(client, message, args) {
    if (!args[0]) return message.reply('Usage: !jobinfo <job_slug_or_id>');
    const q = args[0];
    let job = null;
    if (/^\d+$/.test(q)) job = jobs.getJobById(Number(q));
    else job = jobs.getJobBySlug(q);
    if (!job) return message.reply('Job not found.');

    const embed = new EmbedBuilder()
      .setTitle(job.name)
      .setColor('#7c3aed')
      .addFields(
        { name: 'Description', value: job.description || 'No description', inline: false },
        { name: 'Tier', value: job.tier, inline: true },
        { name: 'Pay Range', value: `${job.min_pay} - ${job.max_pay}`, inline: true },
        { name: 'Cooldown', value: `${Math.floor(job.cooldown_ms/60000)} minutes`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }
};