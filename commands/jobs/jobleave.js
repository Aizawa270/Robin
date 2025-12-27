// commands/jobs/jobleave.js
const { EmbedBuilder } = require('discord.js');
const jobs = require('../../handlers/jobs');

module.exports = {
  name: 'jobleave',
  description: 'Leave your current job.',
  category: 'jobs',
  usage: '!jobleave',
  aliases: ['leavejob'],
  async execute(client, message, args) {
    const uj = jobs.getUserJob(message.author.id);
    if (!uj || !uj.job_id) return message.reply('You do not have a job.');
    const job = jobs.getJobById(uj.job_id);
    jobs.leaveJob(message.author.id);
    const embed = new EmbedBuilder()
      .setColor('#ef4444')
      .setDescription(`You left **${job.name}**.`);
    return message.reply({ embeds: [embed] });
  }
};