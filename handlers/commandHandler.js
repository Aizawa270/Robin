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

    // Support direct .js files at /commands root
    if (stat.isFile() && category.endsWith('.js')) {
      const command = require(categoryPath);
      if (!command.name || typeof command.execute !== 'function') continue;

      // Fill defaults
      if (!command.description) command.description = 'No description.';
      if (!command.usage) command.usage = 'No usage.';
      if (!command.category) command.category = 'Misc';
      if (!Array.isArray(command.aliases)) command.aliases = [];

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
      if (!command.description) command.description = 'No description.';
      if (!command.usage) command.usage = 'No usage.';
      if (!command.category) command.category = 'Misc';
      if (!Array.isArray(command.aliases)) command.aliases = [];

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

  // --- AFK: clear AFK on user message ---
  if (client.afk?.has(message.author.id)) {
    client.afk.delete(message.author.id);
    try {
      await message.reply(`Welcome back, <@${message.author.id}>. I removed your AFK status.`);
    } catch {}
  }

  // --- AFK: notify when mentioning AFK users ---
  if (message.mentions.users.size > 0 && client.afk) {
    for (const [, user] of message.mentions.users) {
      const data = client.afk.get(user.id);
      if (data) {
        try {
          await message.reply(
            `<@${user.id}> is AFK: **${data.reason}** (since <t:${Math.floor(data.since / 1000)}:R>)`
          );
        } catch {}
      }
    }
  }

  // --- PREFIXLESS ---
  if (client.prefixless && client.prefixless.has(message.author.id)) {
    const parts = content.split(/\s+/);
    const possibleName = parts[0].toLowerCase();

    let possibleCommand = client.commands.get(possibleName);
    if (!possibleCommand) {
      // check aliases
      possibleCommand = Array.from(client.commands.values()).find(cmd =>
        Array.isArray(cmd.aliases) && cmd.aliases.includes(possibleName)
      );
    }

    if (possibleCommand) {
      const args = parts.slice(1);
      try {
        await possibleCommand.execute(client, message, args);
      } catch (error) {
        console.error(`Error executing prefixless command ${possibleName}:`, error);
        try { await message.reply('Something went wrong while executing that command.'); } catch {}
      }
      return; // do not process as prefixed
    }
  }

  // --- PREFIX COMMANDS ---
  if (!content.startsWith(prefix)) return;

  const args = content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  let command = client.commands.get(commandName);
  if (!command) {
    // check aliases
    command = Array.from(client.commands.values()).find(cmd =>
      Array.isArray(cmd.aliases) && cmd.aliases.includes(commandName)
    );
  }

  if (!command) return;

  try {
    await command.execute(client, message, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    try { await message.reply('Something went wrong while executing that command.'); } catch {}
  }
}

module.exports = { loadCommands, handleMessage };