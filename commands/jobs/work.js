// commands/jobs/work.js
const { EmbedBuilder } = require('discord.js');
const jobs = require('../../handlers/jobs');

module.exports = {
  name: 'work',
  description: 'Do your job work and earn coins. Respect cooldowns.',
  category: 'jobs',
  usage: '!work',
  aliases: ['jobwork'],
  async execute(client, message, args) {
    try {
      const uj = jobs.getUserJob(message.author.id);
      if (!uj || !uj.job_id) return message.reply('You do not have a job. Use !joblist and !jobapply.');

      const job = jobs.getJobById(uj.job_id);
      if (!job) {
        return message.reply('Your job data is corrupted. Use !jobleave and reapply.');
      }

      // cooldown check
      const now = Date.now();
      if ((now - (uj.last_work_ts || 0)) < job.cooldown_ms) {
        const rem = job.cooldown_ms - (now - (uj.last_work_ts || 0));
        const mins = Math.floor(rem / 60000);
        const secs = Math.floor((rem % 60000) / 1000);
        return message.reply(`Cooldown active. Try again in ${mins}m ${secs}s.`);
      }

      const res = jobs.doWork(message.author.id);
      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(`Work: ${job.name}`)
        .setDescription(`You worked and earned **${res.pay} Vyncoins**.\nXP gained: **${res.xpGain}**\nJob level: **${res.level}**`);

      return message.reply({ embeds: [embed] });

    } catch (err) {
      if (String(err) === 'cooldown') return message.reply('Cooldown active. Try later.');
      console.error('Work error:', err);
      return message.reply('Failed to do work. Check console.');
    }
  }
};