// commands/jobs/joblist.js
const { EmbedBuilder } = require('discord.js');
const jobsHandler = require('../../handlers/jobs');

module.exports = {
  name: 'joblist',
  description: 'List available jobs.',
  category: 'jobs',
  usage: '!joblist',
  aliases: ['jobs'],
  async execute(client, message, args) {
    const all = jobsHandler.listJobs(true);
    const normal = all.filter(j => j.tier === 'normal' && !j.faction_id);
    const elite = all.filter(j => j.tier === 'elite' && !j.faction_id);
    const faction = all.filter(j => j.tier === 'faction');

    const embed = new EmbedBuilder().setTitle('Available Jobs').setColor('#8b5cf6');

    if (normal.length) embed.addFields({ name: 'Normal Jobs', value: normal.map(j => `**${j.name}** — ${j.description} (pay ${j.min_pay}-${j.max_pay})\nslug: \`${j.slug}\``).join('\n\n').slice(0, 1024) });
    if (elite.length) embed.addFields({ name: 'Elite Jobs', value: elite.map(j => `**${j.name}** — ${j.description} (pay ${j.min_pay}-${j.max_pay})\nslug: \`${j.slug}\``).join('\n\n').slice(0, 1024) });
    if (faction.length) embed.addFields({ name: 'Faction Jobs (require faction)', value: faction.map(j => `**${j.name}** — ${j.description} (pay ${j.min_pay}-${j.max_pay})\nslug: \`${j.slug}\``).join('\n\n').slice(0, 1024) });

    return message.reply({ embeds: [embed] });
  }
};