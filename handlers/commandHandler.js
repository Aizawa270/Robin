// handlers/commandHandler.js
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { prefix } = require('../config');

function loadCommands(client) {
  client.commands = new Collection();
  client.brokenCommands = []; // { file, error }

  const commandsPath = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(commandsPath)) {
    console.warn('No commands folder found.');
    return;
  }

  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    let stat;
    try {
      stat = fs.statSync(categoryPath);
    } catch (err) {
      console.warn('Skipping invalid entry in commands folder:', category);
      continue;
    }

    // single files in /commands root (rare)
    if (stat.isFile() && category.endsWith('.js')) {
      const filePath = categoryPath;
      try {
        const command = require(filePath);
        registerCommand(client, command, filePath);
      } catch (err) {
        client.brokenCommands.push({ file: filePath, error: (err && err.stack) ? err.stack : String(err) });
        console.error(`Failed loading command (root): ${filePath}`, err);
      }
      continue;
    }

    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      try {
        const command = require(filePath);
        registerCommand(client, command, filePath);
      } catch (err) {
        client.brokenCommands.push({ file: filePath, error: (err && err.stack) ? err.stack : String(err) });
        console.error(`Failed loading command: ${filePath}`, err);
      }
    }
  }

  console.log(`Loaded ${client.commands.size} commands. Broken: ${client.brokenCommands.length}`);
}

function registerCommand(client, command, filePath = 'unknown') {
  // Validate structure
  if (!command || typeof command !== 'object') {
    throw new Error(`Invalid command export in ${filePath} — expected module.exports = { ... }`);
  }

  if (!command.name || typeof command.name !== 'string') {
    throw new Error(`Command missing valid "name" string in ${filePath}`);
  }

  if (typeof command.execute !== 'function') {
    throw new Error(`Command "${command.name}" missing execute() function in ${filePath}`);
  }

  // Fill defaults safely
  if (!command.description || typeof command.description !== 'string') command.description = 'No description.';
  if (!command.usage || typeof command.usage !== 'string') command.usage = '';
  if (!command.category || typeof command.category !== 'string') command.category = 'Misc';
  if (!Array.isArray(command.aliases)) command.aliases = [];

  // store by primary name (lowercase)
  client.commands.set(command.name.toLowerCase(), command);
  // also register aliases map for quick lookup (optional)
  if (command.aliases && command.aliases.length) {
    for (const a of command.aliases) {
      // don't overwrite real commands; only register alias if free
      if (!client.commands.has(a.toLowerCase())) {
        // store alias pointing to same command object
        client.commands.set(a.toLowerCase(), command);
      }
    }
  }

  console.log(`Loaded command: ${command.name} (${command.category})`);
}

async function handleMessage(client, message) {
  if (message.author.bot) return;
  const content = message.content?.trim();
  if (!content) return;

  // AFK clearing & mentions (keeps as is)
  if (client.afk?.has(message.author.id)) {
    client.afk.delete(message.author.id);
    try { await message.reply(`Welcome back, <@${message.author.id}>. I removed your AFK status.`); } catch {}
  }
  if (message.mentions.users.size > 0 && client.afk) {
    for (const [, user] of message.mentions.users) {
      const data = client.afk.get(user.id);
      if (data) {
        try {
          await message.reply(`<@${user.id}> is AFK: **${data.reason}** (since <t:${Math.floor(data.since / 1000)}:R>)`);
        } catch {}
      }
    }
  }

  // PREFIXLESS (per-user)
  if (client.prefixless && client.prefixless.has(message.author.id)) {
    const parts = content.split(/\s+/);
    const possibleName = parts[0].toLowerCase();
    const cmd = client.commands.get(possibleName);
    if (cmd) {
      const args = parts.slice(1);
      try {
        await cmd.execute(client, message, args);
      } catch (err) {
        console.error(`Error executing prefixless command ${possibleName}:`, err);
        try { await message.reply('Something went wrong while executing that command.'); } catch {}
      }
      return;
    }
  }

  // PREFIXED
  if (!content.startsWith(prefix)) return;

  const args = content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(client, message, args);
  } catch (err) {
    console.error(`Command execution error (${commandName}):`, err);
    try { await message.reply('Something went wrong while executing that command.'); } catch {}
  }
}

module.exports = { loadCommands, handleMessage };