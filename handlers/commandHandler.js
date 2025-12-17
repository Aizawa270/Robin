const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { prefix } = require('../config');

function loadCommands(client) {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(commandsPath)) {
    console.warn('No commands folder found.');
    return;
  }

  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const stat = fs.statSync(categoryPath);

    // direct JS files in root of commands
    if (stat.isFile() && category.endsWith('.js')) {
      const command = require(categoryPath);
      if (!command.name || typeof command.execute !== 'function') continue;

      // Fill defaults
      command.description ||= 'No description.';
      command.usage ||= 'No usage.';
      command.category ||= 'Misc';
      command.aliases ||= [];

      client.commands.set(command.name.toLowerCase(), command);
      console.log(`Loaded command: ${command.name} (root)`);
      continue;
    }

    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      const command = require(filePath);
      if (!command.name || typeof command.execute !== 'function') continue;

      // Fill defaults
      command.description ||= 'No description.';
      command.usage ||= 'No usage.';
      command.category ||= 'Misc';
      command.aliases ||= [];

      client.commands.set(command.name.toLowerCase(), command);
      console.log(`Loaded command: ${command.name} (${category})`);
    }
  }

  console.log(`Loaded ${client.commands.size} commands.`);
}

async function handleMessage(client, message) {
  if (message.author.bot) return;
  const content = message.content?.trim();
  if (!content) return;

  // --- AFK ---
  if (client.afk?.has(message.author.id)) {
    client.afk.delete(message.author.id);
    try {
      await message.reply(`Welcome back, <@${message.author.id}>. Removed your AFK status.`);
    } catch {}
  }

  if (message.mentions.users.size > 0 && client.afk) {
    for (const [, user] of message.mentions.users) {
      const data = client.afk.get(user.id);
      if (data) {
        try {
          await message.reply(
            `<@${user.id}> is AFK: **${data.reason}** (since <t:${Math.floor(
              data.since / 1000
            )}:R>)`
          );
        } catch {}
      }
    }
  }

  // --- PREFIXLESS ---
  if (client.prefixless && client.prefixless.has(message.author.id)) {
    const parts = content.split(/\s+/);
    const cmdName = parts[0].toLowerCase();

    let cmd = client.commands.get(cmdName);
    if (!cmd) {
      cmd = Array.from(client.commands.values()).find(c =>
        Array.isArray(c.aliases) && c.aliases.includes(cmdName)
      );
    }

    if (cmd) {
      const args = parts.slice(1);
      try {
        await cmd.execute(client, message, args);
      } catch (err) {
        console.error(`Error executing prefixless command ${cmdName}:`, err);
        try {
          await message.reply('Something went wrong while executing that command.');
        } catch {}
      }
      return;
    }
  }

  // --- PREFIXED ---
  if (!content.startsWith(prefix)) return;

  const args = content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  let command = client.commands.get(commandName);
  if (!command) {
    command = Array.from(client.commands.values()).find(c =>
      Array.isArray(c.aliases) && c.aliases.includes(commandName)
    );
  }

  if (!command) return;

  try {
    await command.execute(client, message, args);
  } catch (err) {
    console.error(`Error executing command ${commandName}:`, err);
    try {
      await message.reply('Something went wrong while executing that command.');
    } catch {}
  }
}

module.exports = { loadCommands, handleMessage };