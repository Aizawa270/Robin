const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'timezones.sqlite');
const db = new Database(dbPath);

db.prepare(`
  CREATE TABLE IF NOT EXISTS user_timezones (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL,
    set_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const TIMEZONE_EXAMPLES = [
  'America/New_York',
  'America/Los_Angeles', 
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Europe/Moscow',
  'Africa/Johannesburg',
  'America/Toronto',
  'UTC'
];

function isValidTimezone(timezone) {
  try {
    const test = new Date().toLocaleString('en-US', { timeZone: timezone });
    return !!test;
  } catch {
    return false;
  }
}

module.exports = {
  name: 'settimezone',
  aliases: ['stz'],
  description: 'Set your timezone for time commands.',
  category: 'utility',
  usage: '$settimezone <timezone>',
  async execute(client, message, args) {
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';
    
    // Help embed
    if (!args[0]) {
      const helpEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Set Your Timezone')
        .setDescription(`**Usage:** \`${prefix}settimezone <timezone>\``)
        .addFields(
          { 
            name: 'Format', 
            value: 'Use IANA Timezone format: `Continent/City`', 
            inline: false 
          },
          { 
            name: 'Examples', 
            value: TIMEZONE_EXAMPLES.slice(0, 7).map(tz => `\`${tz}\``).join(', '), 
            inline: false 
          },
          { 
            name: 'More Examples', 
            value: TIMEZONE_EXAMPLES.slice(7).map(tz => `\`${tz}\``).join(', '), 
            inline: false 
          }
        )
        .setFooter({ text: `Example: ${prefix}settimezone Asia/Dhaka` })
        .setTimestamp();
      
      return message.reply({ embeds: [helpEmbed] });
    }
    
    const timezone = args.join(' ');
    
    // Validate
    if (!isValidTimezone(timezone)) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Invalid Timezone')
        .setDescription(`\`${timezone}\` is not a valid timezone.`)
        .addFields(
          { 
            name: 'Valid Examples', 
            value: TIMEZONE_EXAMPLES.slice(0, 5).map(tz => `\`${tz}\``).join('\n'), 
            inline: false 
          },
          { 
            name: 'Help', 
            value: `Use \`${prefix}settimezone\` without arguments to see all examples.`, 
            inline: false 
          }
        );
      
      return message.reply({ embeds: [errorEmbed] });
    }
    
    // Save to database
    db.prepare(`
      INSERT OR REPLACE INTO user_timezones (user_id, timezone) 
      VALUES (?, ?)
    `).run(message.author.id, timezone);
    
    // Show current time
    const now = new Date();
    const userTime = now.toLocaleString('en-US', { 
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    const successEmbed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('Timezone Set Successfully')
      .setDescription(`Your timezone has been set to: **${timezone}**`)
      .addFields(
        { 
          name: 'Current Time', 
          value: `${userTime}`, 
          inline: false 
        },
        { 
          name: 'Check Your Time', 
          value: `Use \`${prefix}timezone\` to see your time anytime.`, 
          inline: false 
        }
      )
      .setFooter({ text: `Set by ${message.author.tag}` })
      .setTimestamp();
    
    return message.reply({ embeds: [successEmbed] });
  },
};