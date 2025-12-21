const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'timezones.sqlite');
const db = new Database(dbPath);

module.exports = {
  name: 'timezone',
  aliases: ['tz'],
  description: 'Check your current time in your set timezone.',
  category: 'utility',
  usage: '$timezone [@user]',
  async execute(client, message, args) {
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';
    
    // Determine target user
    let targetUser = message.author;
    let targetMention = '';
    
    if (args[0]) {
      const mentionedUser = message.mentions.users.first();
      if (mentionedUser) {
        targetUser = mentionedUser;
        targetMention = ` for ${targetUser.tag}`;
      } else {
        // Try to fetch by ID
        try {
          const user = await client.users.fetch(args[0]);
          targetUser = user;
          targetMention = ` for ${targetUser.tag}`;
        } catch {
          // If can't fetch, assume it's the author
        }
      }
    }
    
    // Get timezone from database
    const row = db.prepare('SELECT timezone FROM user_timezones WHERE user_id = ?').get(targetUser.id);
    
    if (!row) {
      if (targetUser.id === message.author.id) {
        // User hasn't set timezone
        const errorEmbed = new EmbedBuilder()
          .setColor('#f59e0b')
          .setTitle('No Timezone Set')
          .setDescription(`You haven't set your timezone yet.`)
          .addFields(
            { 
              name: 'Set Your Timezone', 
              value: `Use \`${prefix}settimezone <timezone>\` to set your timezone.`, 
              inline: false 
            },
            { 
              name: 'Example', 
              value: `\`${prefix}settimezone Asia/Dhaka\``, 
              inline: false 
            }
          );
        
        return message.reply({ embeds: [errorEmbed] });
      } else {
        // Checking someone else who hasn't set timezone
        const errorEmbed = new EmbedBuilder()
          .setColor('#f59e0b')
          .setTitle('No Timezone Set')
          .setDescription(`${targetUser.tag} hasn't set their timezone yet.`);
        
        return message.reply({ embeds: [errorEmbed] });
      }
    }
    
    const timezone = row.timezone;
    const now = new Date();
    
    // Format time in 12-hour and 24-hour formats
    const time12hr = now.toLocaleString('en-US', { 
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
    
    const time24hr = now.toLocaleString('en-US', { 
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Get timezone offset
    const offset = now.toLocaleString('en-US', { 
      timeZone: timezone,
      timeZoneName: 'longOffset'
    }).split(' ').pop() || 'Unknown offset';
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`Current Time${targetMention}`)
      .setDescription(`**Timezone:** ${timezone}`)
      .addFields(
        { 
          name: 'Current Time', 
          value: time12hr, 
          inline: false 
        },
        { 
          name: '24-Hour Format', 
          value: time24hr, 
          inline: true 
        },
        { 
          name: 'Timezone Offset', 
          value: offset, 
          inline: true 
        }
      )
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();
    
    return message.reply({ embeds: [embed] });
  },
};