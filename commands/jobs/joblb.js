// commands/jobs/jobl b.js
const { EmbedBuilder } = require('discord.js');
const jobs = require('../../handlers/jobs');

module.exports = {
  name: 'joblb',
  description: 'Leaderboard: top earners from work.',
  category: 'jobs',
  usage: '!joblb',
  aliases: ['jobleaderboard'],
  async execute(client, message, args) {
    const top = jobs.getJobLeaderboard(10);
    if (!top.length) return message.reply('No job data yet.');

    const lines = top.map((r, i) => `${i+1}. <@${r.user_id}> — ${r.total_earned} (${r.job_name || '—'})`);
    const embed = new EmbedBuilder()
      .setTitle('Job Leaderboard')
      .setColor('#f97316')
      .setDescription(lines.join('\n'));

    return message.reply({ embeds: [embed] });
  }
};