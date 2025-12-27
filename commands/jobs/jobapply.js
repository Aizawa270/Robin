// commands/jobs/jobapply.js
const { EmbedBuilder } = require('discord.js');
const jobs = require('../../handlers/jobs');

module.exports = {
  name: 'jobapply',
  description: 'Apply for a job by slug or id.',
  category: 'jobs',
  usage: '!jobapply <job_slug_or_id>',
  aliases: ['applyjob'],
  async execute(client, message, args) {
    if (!args[0]) return message.reply('Usage: !jobapply <job_slug_or_id>');

    const q = args[0];
    let job = null;
    if (/^\d+$/.test(q)) job = jobs.getJobById(Number(q));
    else job = jobs.getJobBySlug(q);

    if (!job) return message.reply('Job not found.');

    // faction jobs: check user's faction if necessary (simple check stored in econ)
    const user = message.author;
    const userRow = (await require('../../handlers/economy').getUser(user.id)) || null;
    if (job.faction_id && (!userRow || userRow.faction_id !== job.faction_id)) {
      return message.reply('This job is faction-exclusive. You do not qualify.');
    }

    try {
      jobs.applyJob(user.id, job.id);
    } catch (err) {
      return message.reply(`Failed to apply: ${err.message}`);
    }

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setDescription(`You have successfully applied to **${job.name}**. Use \`!work\` to start working when ready.`);

    return message.reply({ embeds: [embed] });
  }
};